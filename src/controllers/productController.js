const fs = require("fs").promises;
const csv = require("csv-parser");
const XLSX = require("xlsx");
const path = require("path");
const cloudinary = require("cloudinary").v2;
const { Readable } = require("stream");

const Product = require("../models/Product");
const Category = require("../models/Category");
const Color = require("../models/Color");
const Size = require("../models/Size");

const { uploadImageFromURL } = require("../utils/cloudinaryHelper");

exports.searchProducts = async (req, res) => {
  try {
    const q = req.query.q?.trim();
    if (!q) return res.json([]);

    // Dùng regex cho search chứa ký tự (case-insensitive)
    const products = await Product.find({
      name: { $regex: q, $options: "i" },
      status: "active",
    })
      .select("name variants coverImage")
      .limit(10)
      .lean();

    // Ghép ảnh từ variants (lấy cover hoặc ảnh đầu tiên)
    const result = products.map((p) => ({
      _id: p._id,
      name: p.name,
      image:
        p.variants?.[0]?.coverImage ||
        p.variants?.[0]?.images?.[0] ||
        p.coverImage ||
        null,
      price: p.variants?.[0]?.price || null,
    }));

    res.json(result);
  } catch (err) {
    console.error("❌ Lỗi search:", err);
    res.status(500).json({ error: "Lỗi khi tìm kiếm sản phẩm" });
  }
};
// === HELPER FUNCTIONS ===
const splitFiles = (files) => {
  const variantImages = {};
  if (!Array.isArray(files)) return { variantImages };

  files.forEach(file => {
    // ví dụ fieldname: variantImageFile[68fb5329f6e7e125a9264d6a]
    const match = file.fieldname.match(/variantImageFile\[(.+?)\]/);
    if (match) {
      const colorId = match[1];
      if (!variantImages[colorId]) variantImages[colorId] = [];
      variantImages[colorId].push(file);
    }
  });

  console.log("🧩 Parsed variantImages (colorId keys):", Object.keys(variantImages));
  return { variantImages };
};


const fileToUrl = (file) => {
  const url = file?.path || null;
  console.log("File to URL:", file?.originalname, "->", url);
  return url;
};

const extractPublicId = (url) => {
  if (!url) return null;
  const match = url.match(/\/v\d+\/(.+?)\.(jpg|jpeg|png|webp|gif)/);
  return match ? match[1] : null;
};

// === IMPORT CSV/XLSX ===
exports.importProducts = async (req, res) => {
  try {
    console.log("Received file:", req.file?.originalname); // Debug
    if (!req.file) {
      return res.status(400).json({ error: "Chọn file CSV/XLSX!" });
    }

    const ext = path.extname(req.file.originalname).slice(1).toLowerCase();
    let rows = [];

    if (["xlsx", "xls"].includes(ext)) {
      const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
    } else if (ext === "csv") {
      const buffer = req.file.buffer;
      const text = buffer.toString("utf8");
      rows = await new Promise((resolve, reject) => {
        const data = [];
        Readable.from(text)
          .pipe(csv())
          .on("data", (row) => data.push(row))
          .on("end", () => resolve(data))
          .on("error", reject);
      });
    } else {
      return res.status(400).json({ error: "Chỉ hỗ trợ .csv, .xlsx!" });
    }

    console.log("Parsed rows:", rows.length); // Debug
    if (!rows.length) {
      return res.status(400).json({ error: "File rỗng hoặc không đọc được!" });
    }

    const groups = {};
    for (const r of rows) {
      const groupId = (r.ID || "").toString().trim();
      if (!groupId) {
        console.log("Skipping row with empty groupId:", r); // Debug
        continue;
      }

      let name = (r.Name || r.name || "").toString().trim();
      const colorName = (r["Color name"] || r["color name"] || "").toString().trim();
      const colorCode = (r["Color code"] || r["color code"] || "").toString().trim();
      const sizeName = (r["Size name"] || r["size name"] || "").toString().trim();
      const sizeCode = (r["Size code"] || r["size code"] || "").toString().trim();
      if (name && colorName && sizeName) {
        name = name.replace(new RegExp(` - ${colorName}.*`, 'i'), '').trim();
      }

      let description = (r.Description || r.description || "").toString().trim();
      const detailsIndex = description.indexOf('**Details**');
      if (detailsIndex !== -1) {
        description = description.substring(0, detailsIndex).trim();
      }

      if (!groups[groupId]) {
        groups[groupId] = {
          groupId,
          SKU: (r.SKU || "").toString().trim(),
          name,
          brand: (r.Brand || r.brand || "").toString().trim() || "Khác",
          description,
          categoryName: (r.Category || r.category || "").toString().trim(),
          variants: []
        };
      }

      const variant = {
        colorName,
        colorCode,
        sizeName,
        sizeCode,
        price: Number(r.Price || r.price || 0),
        quantity: Number(r.Quantity || r.Stock || r.stock || 0),
        subImages: (r["Sub Images"] || r["sub images"] || "").toString().split(",").map(s => s.trim()).filter(Boolean)
      };

      if (variant.colorName && variant.sizeName && variant.price > 0) {
        groups[groupId].variants.push(variant);
      } else {
        console.log("Skipping invalid variant:", variant); // Debug
      }
    }

    console.log("Processed groups:", Object.keys(groups).length); // Debug
    if (!Object.keys(groups).length) {
      return res.status(400).json({ error: "Không có sản phẩm hợp lệ trong file!" });
    }

    const results = { created: 0, updated: 0, failed: [] };
    const defaultColorCodeMap = {
      "washed blue": "#94d1df",
      "red/grey": "#988E94"
    };

    for (const groupId of Object.keys(groups)) {
      const g = groups[groupId];
      if (!g.variants.length) {
        results.failed.push({ groupId, error: "Không có biến thể hợp lệ" });
        continue;
      }

      try {
        let category = null;
        if (g.categoryName) {
          category = await Category.findOne({ name: new RegExp(`^${g.categoryName}$`, 'i') });
          if (!category) {
            category = await Category.create({ name: g.categoryName, isActive: true });
            console.log(`Created category: ${g.categoryName}`); // Debug
          }
        }

        const variants = [];
        for (const v of g.variants) {
          const isValidHex = /^#([0-9A-F]{3}|[0-9A-F]{6})$/i.test(v.colorCode);
          const colorCode = isValidHex ? v.colorCode : defaultColorCodeMap[v.colorName.toLowerCase()] || "#000000";

          let color = await Color.findOne({ code: colorCode });
          if (!color) {
            color = await Color.findOne({ name: new RegExp(`^${v.colorName}$`, 'i') });
          }
          if (!color) {
            if (!isValidHex && !defaultColorCodeMap[v.colorName.toLowerCase()]) {
              results.failed.push({ groupId, error: `Màu ${v.colorName} thiếu mã hex hợp lệ` });
              continue;
            }
            color = await Color.create({ name: v.colorName, code: colorCode, isActive: true });
            console.log(`Created color: ${v.colorName}, code: ${colorCode}`); // Debug
          }

          let size = await Size.findOne({ code: v.sizeCode });
          if (!size) {
            size = await Size.findOne({ name: new RegExp(`^${v.sizeName}$`, 'i') });
          }
          if (!size) {
            size = await Size.create({ name: v.sizeName, code: v.sizeCode, isActive: true });
            console.log(`Created size: ${v.sizeName}, code: ${v.sizeCode}`); // Debug
          }

          const variantImages = await Promise.all(
            v.subImages.slice(0, 6).map(url => uploadImageFromURL(url, "osso/variants"))
          );
          const validImages = variantImages.filter(Boolean);
          if (!validImages.length) {
            results.failed.push({ groupId, error: `Biến thể ${v.colorName}/${v.sizeName}: Không tải được ảnh` });
            continue;
          }
          const variantCover = validImages[0] || "";

          variants.push({
            sku: `${g.SKU}-${color.name.slice(0, 3)}-${size.name}`.toUpperCase(),
            color: color._id,
            size: size._id,
            stockQuantity: v.quantity,
            price: v.price,
            importPrice: v.price * 0.8,
            images: validImages,
            coverImage: variantCover
          });
        }

        if (!variants.length) {
          results.failed.push({ groupId, error: "Không có biến thể hợp lệ sau khi xử lý" });
          continue;
        }

        const exist = await Product.findOne({ groupId });
        if (exist) {
          const existingImages = exist.variants.flatMap(v => v.images || []).filter(Boolean);
          const newImages = variants.flatMap(v => v.images || []).filter(Boolean);
          const imagesToDelete = existingImages.filter(img => !newImages.includes(img));

          const deletePromises = imagesToDelete.map(url => {
            const pid = extractPublicId(url);
            if (pid) {
              return cloudinary.uploader.destroy(pid).catch(err => {
                console.error(`Cloudinary delete error for ${pid}:`, err);
                return null;
              });
            }
            return Promise.resolve(null);
          });
          await Promise.all(deletePromises);
          console.log(`Deleted ${imagesToDelete.length} unused images for product ${groupId}`); // Debug

          await Product.findByIdAndUpdate(exist._id, {
            groupId,
            name: g.name,
            brand: g.brand,
            description: g.description,
            category: category?._id,
            variants
          }, { new: true });
          results.updated++;
          console.log(`Updated product: ${groupId}`); // Debug
        } else {
          await Product.create({
            groupId,
            name: g.name,
            brand: g.brand,
            description: g.description,
            category: category?._id,
            variants
          });
          results.created++;
          console.log(`Created product: ${groupId}`); // Debug
        }
      } catch (err) {
        console.error(`Error processing group ${groupId}:`, err.message); // Debug
        results.failed.push({ groupId, error: err.message });
      }
    }

    console.log("Import results:", results); // Debug
    res.json({
      success: true,
      results,
      message: `Tạo: ${results.created}, Cập nhật: ${results.updated}, Lỗi: ${results.failed.length}`
    });
  } catch (err) {
    console.error("IMPORT ERROR:", err);
    res.status(500).json({ error: "Import thất bại", details: err.message });
  }
};

// === GET ALL PRODUCTS ===
exports.getAllProducts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const query = {};

    // === Search tên SP ===
    if (req.query.name) {
      query.name = new RegExp(req.query.name, "i");
    }

    // === Filter theo Category ===
    if (req.query.category) {
      query.category = req.query.category; // ObjectId string
    }

    // === Filter theo Brand (chính xác, không chứa 1 phần) ===
    if (req.query.brand) {
      query.brand = new RegExp(`^${req.query.brand}$`, "i");
    }

    // === Filter theo tồn kho tối thiểu ===
    if (req.query.minQuantity) {
      query["variants.stockQuantity"] = {
        $gte: parseInt(req.query.minQuantity),
      };
    }

    // === Debug Query (có thể xoá sau) ===
    console.log("QUERY:", query);

    const total = await Product.countDocuments(query);

    const products = await Product.find(query)
      .populate("category", "name")
      .populate("variants.color", "name code")
      .populate("variants.size", "name code")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // === Add coverImage fallback ===
    products.forEach((p) => {
      p.coverImage = p.variants?.[0]?.coverImage || p.images?.[0] || "/imgs/placeholder.jpg";
    });

    res.json({
      success: true,
      data: products,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        total,
      },
    });
  } catch (err) {
    console.error("GET ALL PRODUCTS ERROR:", err);
    res.status(500).json({ error: "Lỗi tải sản phẩm", details: err.message });
  }
};

// === GET BY ID ===
exports.getProductById = async (req, res) => {
  try {
    const p = await Product.findById(req.params.id)
      .populate("category", "name")
      .populate("variants.color", "name code")
      .populate("variants.size", "name code")
      .lean();

    if (!p) return res.status(404).json({ error: "Không tìm thấy sản phẩm" });

    // Thêm coverImage từ variants[0].coverImage
    p.coverImage = p.variants[0]?.coverImage || '/imgs/placeholder.jpg';

    res.json(p);
  } catch (err) {
    res.status(500).json({ error: "Lỗi", details: err.message });
  }
};

// === CREATE PRODUCT ===
exports.createProduct = async (req, res) => {
  try {
    const data = req.body;
    const { variantImages } = splitFiles(req.files);
    const variants = JSON.parse(data.variants || "[]");

    if (!variants.length) {
      return res.status(400).json({ error: "Cần ít nhất 1 biến thể!" });
    }

    // === Base folder Cloudinary (theo tên sản phẩm)
    const safeName = data.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const baseFolder = `osso/products/${safeName}`;

    // === Map lưu ảnh theo màu (upload 1 lần)
    const colorImageMap = {}; // { colorId: [url1, url2...] }

    for (let i = 0; i < variants.length; i++) {
      const v = variants[i];
      const files = variantImages[v.color] || [];

      // Nếu màu này chưa upload -> upload lên Cloudinary
      if (!colorImageMap[v.color] && files.length) {
        const uploadedUrls = [];

        for (const f of files) {
          // Nếu đã là URL Cloudinary (multer-storage-cloudinary) -> dùng luôn
          if (f.path && f.path.startsWith("https://res.cloudinary.com")) {
            uploadedUrls.push(f.path);
            continue;
          }

          // Nếu là file local (chưa upload) -> upload thủ công
          const uploadRes = await cloudinary.uploader.upload(f.path, {
            folder: `${baseFolder}/${v.color}`,
            unique_filename: true,
            overwrite: false,
          });
          uploadedUrls.push(uploadRes.secure_url);
        }

        colorImageMap[v.color] = [...new Set(uploadedUrls)]; // loại trùng
      } else if (!files.length && !colorImageMap[v.color]) {
        return res.status(400).json({ error: `Biến thể ${i + 1} thiếu ảnh!` });
      }
    }

    // === Gán ảnh chung cho các variant cùng màu
    const finalVariants = [];
    for (const v of variants) {
      const color = await Color.findById(v.color);
      const size = await Size.findById(v.size);
      if (!color || !size) continue;

      const sharedImages = colorImageMap[v.color] || [];
      if (!sharedImages.length) continue;

      finalVariants.push({
        sku: `${data.SKU}-${color.name}-${size.name}`.toUpperCase(),
        color: v.color,
        size: v.size,
        price: Number(v.price),
        stockQuantity: Number(v.stock),
        importPrice: Number(v.price) * 0.8,
        images: sharedImages,
        coverImage: sharedImages[0],
      });
    }

    // === Tạo sản phẩm
    const product = await Product.create({
      groupId: data.SKU,
      name: data.name,
      category: data.category,
      brand: data.brand,
      description: data.description,
      variants: finalVariants,
    });

    const populated = await Product.findById(product._id)
      .populate("category", "name")
      .populate("variants.color", "name code")
      .populate("variants.size", "name code")
      .lean();

    res.status(201).json(populated);
  } catch (err) {
    console.error("CREATE ERROR:", err);
    res.status(500).json({ error: "Lỗi tạo sản phẩm", details: err.message });
  }
};

// === UPDATE PRODUCT ===
exports.updateProduct = async (req, res) => {
  try {
    console.log("🧩 BODY:", Object.keys(req.body));
    const { id } = req.params;
    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ error: "Không tìm thấy sản phẩm!" });

    const body = req.body;
    const { variantImages } = splitFiles(req.files);

    // 1️⃣ Cập nhật thông tin chung
    const fields = ["name", "brand", "category", "description", "SKU"];
    let hasChange = false;

    fields.forEach(f => {
      if (body[f] !== undefined && body[f] !== "") {
        if (f === "SKU") product.groupId = body[f];
        else product[f] = body[f];
        hasChange = true;
      }
    });

    // === Folder Cloudinary
    const safeName = product.name.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    const baseFolder = `osso/products/${safeName}`;

    // === Lấy danh sách variant mới từ client
    const variantCount = Object.keys(body).filter(k => k.startsWith("variantSKU[")).length;
    const newVariants = [];

    for (let i = 0; i < variantCount; i++) {
      const sku = body[`variantSKU[${i}]`];
      const colorId = body[`variantColor[${i}]`];
      const sizeId = body[`variantSize[${i}]`];
      const stock = Number(body[`variantStock[${i}]`] || 0);
      const price = Number(body[`variantPrice[${i}]`] || 0);
      const files = variantImages[colorId] || [];

      // === Nếu variant đã tồn tại → cập nhật
      let variant = product.variants.find(v => v.sku === sku);

      // Upload ảnh nếu có
      let uploadedUrls = [];
      if (files.length) {
        for (const f of files) {
          const uploadRes = await cloudinary.uploader.upload(f.path, {
            folder: `${baseFolder}/${colorId}`,
            unique_filename: true,
            overwrite: false,
          });
          uploadedUrls.push(uploadRes.secure_url);
        }
      }

      if (variant) {
        variant.price = price;
        variant.stockQuantity = stock;
        variant.importPrice = Math.round(price * 0.8);

        // Nếu có ảnh mới → thay ảnh
        if (uploadedUrls.length) {
          variant.images = uploadedUrls;
          variant.coverImage = uploadedUrls[0];
        }

        newVariants.push(variant.sku); // Ghi nhận để giữ lại
      } else {
        // === Variant mới
        const color = await Color.findById(colorId);
        const size = await Size.findById(sizeId);
        if (!color || !size) continue;

        const newVariant = {
          sku,
          color: colorId,
          size: sizeId,
          price,
          stockQuantity: stock,
          importPrice: Math.round(price * 0.8),
          images: uploadedUrls,
          coverImage: uploadedUrls[0] || null,
        };
        product.variants.push(newVariant);
        newVariants.push(sku);
      }
    }

    // 3️⃣ Xóa variant không còn trong form (client không gửi lên nữa)
    product.variants = product.variants.filter(v => newVariants.includes(v.sku));

    // 4️⃣ Lưu thay đổi
    await product.save();

    const populated = await Product.findById(product._id)
      .populate("category", "name")
      .populate("variants.color", "name code")
      .populate("variants.size", "name code")
      .lean();

    res.json(populated);
  } catch (err) {
    console.error("UPDATE ERROR:", err);
    res.status(500).json({ error: "Lỗi cập nhật", details: err.message });
  }
};

// === DELETE PRODUCT ===
exports.deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: "Không tìm thấy!" });

    const safeName = product.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const folder = `osso/products/${safeName}`;

    // XÓA TOÀN BỘ THƯ MỤC
    await cloudinary.api.delete_resources_by_prefix(folder);
    await cloudinary.api.delete_folder(folder);

    await Product.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Xóa thành công + ảnh" });
  } catch (err) {
    console.error("DELETE ERROR:", err);
    res.status(500).json({ error: "Lỗi xóa", details: err.message });
  }
};