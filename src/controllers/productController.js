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


// === SEARCH PRODUCTS ===
exports.searchProducts = async (req, res) => {
  try {
    const q = req.query.q?.trim();
    if (!q) return res.json([]);

    // ⚡ Ưu tiên dùng text index nếu có (nhanh hơn nhiều so với regex)
    const query = q.length > 2
      ? { $text: { $search: q }, status: "active" }
      : { name: { $regex: q, $options: "i" }, status: "active" };

    const products = await Product.find(query)
      .populate("variants.color", "name code")
      .populate("variants.size", "name code")
      .select("name variants coverImage")
      .limit(10)
      .lean();

    const result = products.map((p) => {
      // ✅ Lọc variant hợp lệ
      const validVariants = (p.variants || []).filter(
        (v) =>
          v &&
          typeof v.price === "number" &&
          !isNaN(v.price) &&
          v.price > 0 &&
          v.color &&
          v.size
      );

      // ✅ Giá trị mặc định
      let minPrice = 0;
      let maxPrice = 0;
      if (validVariants.length > 0) {
        const prices = validVariants.map((v) => v.price);
        minPrice = Math.min(...prices);
        maxPrice = Math.max(...prices);
      }

      // ✅ Tập hợp màu và size duy nhất
      const colors = [
        ...new Map(
          validVariants.map((v) => [v.color._id.toString(), v.color])
        ).values(),
      ];

      const sizes = [
        ...new Map(
          validVariants.map((v) => [v.size._id.toString(), v.size])
        ).values(),
      ];

      // ✅ Ảnh đại diện ưu tiên: coverImage > variant cover > variant images
      const coverImage =
        p.coverImage ||
        validVariants[0]?.coverImage ||
        validVariants[0]?.images?.[0] ||
        "/imgs/placeholder.jpg";

      return {
        _id: p._id,
        name: p.name,
        coverImage,
        minPrice,
        maxPrice,
        colors,
        sizes,
      };
    });

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

exports.filterProducts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const {
      name,
      category,
      brand,
      minPrice,
      maxPrice,
      color,
      size,
      minQuantity,
    } = req.query;

    const query = {};

    // ✅ Tên sản phẩm
    if (name) query.name = new RegExp(name, "i");

    // ✅ Category
    if (category) query.category = category;

    // ✅ Brand
    if (brand) query.brand = new RegExp(`^${brand}$`, "i");

    // ✅ Variant filters
    const variantFilter = {};

    if (minPrice || maxPrice) {
      variantFilter.price = {};
      if (minPrice) variantFilter.price.$gte = Number(minPrice);
      if (maxPrice) variantFilter.price.$lte = Number(maxPrice);
    }

    if (color) variantFilter.color = color;
    if (size) variantFilter.size = size;
    if (minQuantity) variantFilter.stockQuantity = { $gte: Number(minQuantity) };

    if (Object.keys(variantFilter).length > 0) {
      query.variants = { $elemMatch: variantFilter };
    }

    // ✅ Tổng sản phẩm
    const total = await Product.countDocuments(query);

    // ✅ Lấy sản phẩm
    const products = await Product.find(query)
      .populate("category", "name")
      .populate("variants.color", "name code")
      .populate("variants.size", "name code")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // ✅ Chuẩn hóa dữ liệu
    const formatted = products.map((p) => {
      const variants = p.variants || [];
      const validVariants = variants.filter(
        (v) =>
          (!minPrice || v.price >= minPrice) &&
          (!maxPrice || v.price <= maxPrice) &&
          (!color || v.color?._id.toString() === color) &&
          (!size || v.size?._id.toString() === size) &&
          (!minQuantity || v.stockQuantity >= minQuantity)
      );

      const minPriceVar = validVariants.length
        ? Math.min(...validVariants.map((v) => v.price))
        : 0;
      const maxPriceVar = validVariants.length
        ? Math.max(...validVariants.map((v) => v.price))
        : 0;

      const colors = [
        ...new Map(
          validVariants.map((v) => [v.color._id.toString(), v.color])
        ).values(),
      ];

      const sizes = [
        ...new Map(validVariants.map((v) => [v.size._id.toString(), v.size])).values(),
      ];

      return {
        _id: p._id,
        name: p.name,
        coverImage: p.coverImage || variants[0]?.coverImage || "/imgs/placeholder.jpg",
        minPrice: minPriceVar,
        maxPrice: maxPriceVar,
        colors,
        sizes,
        variants: validVariants, // Nếu muốn frontend hiển thị chi tiết
      };
    });

    res.json({
      success: true,
      total,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      data: formatted,
    });
  } catch (err) {
    console.error("FILTER PRODUCTS ERROR:", err);
    res.status(500).json({ error: "Lỗi lọc sản phẩm", details: err.message });
  }
};

exports.createProduct = async (req, res) => {
  try {
    const data = req.body;
    const { variantImages } = splitFiles(req.files); // đã có f.path là URL cloudinary
    const variants = JSON.parse(data.variants || "[]");

    if (!variants.length) {
      return res.status(400).json({ error: "Cần ít nhất 1 biến thể!" });
    }

    const safeName = data.name.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    const baseFolder = `oso/products/${safeName}`;

    const colorImageMap = {};

    for (const v of variants) {
      const files = variantImages[v.color] || [];

      // Nếu có URL sẵn từ import hoặc upload
      if (v.images?.length > 0 && !colorImageMap[v.color]) {
        colorImageMap[v.color] = v.images;
        continue;
      }

      // Dùng luôn ảnh do multer upload (đã có URL Cloudinary)
      if (!colorImageMap[v.color] && files.length) {
        const urls = files.map((f) => f.path);
        colorImageMap[v.color] = urls;
      } else if (!files.length && !v.images?.length) {
        console.warn(`⚠️ Biến thể màu ${v.color} chưa có ảnh upload hoặc ảnh URL.`);
      }
    }

    // === Gán ảnh cho từng variant theo colorId
    const finalVariants = [];
    for (const v of variants) {
      const color = await Color.findById(v.color);
      const size = await Size.findById(v.size);
      if (!color || !size) continue;

      const sharedImages = colorImageMap[v.color] || [];
      if (!sharedImages.length) continue;

      finalVariants.push({
        sku: v.sku || `${data.SKU}-${color.name}-${size.name}`.toUpperCase(),
        color: v.color,
        size: v.size,
        price: Number(v.price),
        stockQuantity: Number(v.stock),
        importPrice: Number(v.importPrice || v.price * 0.8),
        images: sharedImages,
        coverImage: sharedImages[0],
      });
    }

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

exports.importProducts = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Vui lòng chọn file CSV hoặc XLSX!" });
    }

    const ext = path.extname(req.file.originalname).slice(1).toLowerCase();
    let rows = [];

    // --- Đọc file CSV hoặc XLSX ---
    if (["xlsx", "xls"].includes(ext)) {
      const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
    } else if (ext === "csv") {
      const text = req.file.buffer.toString("utf8");
      rows = await new Promise((resolve, reject) => {
        const data = [];
        Readable.from(text)
          .pipe(csv())
          .on("data", (row) => data.push(row))
          .on("end", () => resolve(data))
          .on("error", reject);
      });
    } else {
      return res.status(400).json({ error: "Chỉ hỗ trợ định dạng .csv hoặc .xlsx" });
    }

    if (!rows.length) {
      return res.status(400).json({ error: "File rỗng hoặc không có dữ liệu!" });
    }

    // === Gom sản phẩm theo ID (mã chung) ===
    const groups = {};
    for (const r of rows) {
      const id = (r.ID || "").trim();
      if (!id) continue;

      if (!groups[id]) {
        groups[id] = {
          id,
          name: (r.Name || "").trim(),
          brand: (r.Brand || "").trim() || "Khác",
          description: (r.Description || "").trim(),
          categoryName: (r.Category || "").trim(),
          variants: [],
        };
      }

      groups[id].variants.push({
        sku: (r.SKU || "").trim(),
        colorName: (r["Color name"] || "").trim(),
        colorCode: (r["Color code"] || "").trim(),
        sizeName: (r["Size name"] || "").trim(),
        sizeCode: (r["Size code"] || "").trim(),
        price: Number(r.Price || 0),
        quantity: Number(r.Quantity || 0),
        subImages: (r["Sub Images"] || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      });
    }

    const results = { success: [], failed: [] };

    // === Xử lý từng nhóm sản phẩm (theo ID) ===
    for (const id of Object.keys(groups)) {
      const g = groups[id];

      try {
        // === Category
        let category = null;
        if (g.categoryName) {
          category = await Category.findOne({
            name: new RegExp(`^${g.categoryName}$`, "i"),
          });
          if (!category) {
            category = await Category.create({ name: g.categoryName, isActive: true });
          }
        }

        const safeName = g.name.replace(/[^a-z0-9]/gi, "_").toLowerCase();
        const baseFolder = `oso/products/${safeName}`;

        // === Map lưu ảnh theo màu (chung cho các size cùng màu)
        const colorImageMap = {}; // { colorId: [urls] }
        const finalVariants = [];

        for (const v of g.variants) {
          if (!v.colorName || !v.sizeName) continue;

          // === Color
          let color = await Color.findOne({
            $or: [{ code: v.colorCode }, { name: new RegExp(`^${v.colorName}$`, "i") }],
          });
          if (!color) {
            color = await Color.create({
              name: v.colorName,
              code: v.colorCode || "#000000",
              isActive: true,
            });
          }

          // === Size
          let size = await Size.findOne({
            $or: [{ code: v.sizeCode }, { name: new RegExp(`^${v.sizeName}$`, "i") }],
          });
          if (!size) {
            size = await Size.create({
              name: v.sizeName,
              code: v.sizeCode || v.sizeName.toUpperCase(),
              isActive: true,
            });
          }

          // === Upload ảnh cho màu nếu chưa có
          if (!colorImageMap[color._id]) {
            const uploadedUrls = [];
            for (const img of v.subImages) {
              if (!img) continue;

              if (img.startsWith("https://res.cloudinary.com")) {
                uploadedUrls.push(img);
              } else {
                try {
                  const uploadRes = await cloudinary.uploader.upload(img, {
                    folder: baseFolder,
                    use_filename: true,
                    unique_filename: false,
                    overwrite: false,
                  });
                  uploadedUrls.push(uploadRes.secure_url);
                } catch (err) {
                  console.warn(`⚠️ Upload lỗi ảnh ${img}:`, err.message);
                }
              }
            }
            colorImageMap[color._id] = uploadedUrls;
          }

          const sharedImages = colorImageMap[color._id] || [];

          finalVariants.push({
            sku: v.sku || `${id}-${v.colorName}-${v.sizeName}`.toUpperCase(),
            color: color._id,
            size: size._id,
            price: v.price,
            stockQuantity: v.quantity,
            importPrice: Math.round(v.price * 0.8),
            images: sharedImages,
            coverImage: sharedImages[0] || null,
          });
        }

        if (!finalVariants.length) {
          results.failed.push({ id, error: "Không có biến thể hợp lệ" });
          continue;
        }

        // === Kiểm tra nếu sản phẩm đã tồn tại ===
        let product = await Product.findOne({ groupId: id });

        if (product) {
          // 🔹 Cập nhật thông tin chung, không upload lại ảnh
          product.name = g.name || product.name;
          product.brand = g.brand || product.brand;
          product.description = g.description || product.description;
          if (category?._id) product.category = category._id;

          // 🔹 Cập nhật / thêm variant
          for (const v of finalVariants) {
            const exist = product.variants.find((ex) => ex.sku === v.sku);
            if (exist) {
              exist.price = v.price;
              exist.stockQuantity = v.stockQuantity;
              exist.importPrice = v.importPrice;
              exist.color = v.color;
              exist.size = v.size;
            } else {
              product.variants.push(v);
            }
          }

          await product.save();

          results.success.push({
            message: `Đã cập nhật sản phẩm ${product.name}`,
            productId: product._id,
          });
        } else {
          // === Tạo mới
          const newProduct = await Product.create({
            groupId: id,
            name: g.name,
            SKU: g.variants[0]?.sku || id,
            brand: g.brand,
            description: g.description,
            category: category?._id || null,
            variants: finalVariants,
          });

          results.success.push({
            message: `Tạo sản phẩm mới: ${newProduct.name}`,
            productId: newProduct._id,
          });
        }
      } catch (err) {
        console.error(`❌ Lỗi xử lý ID ${id}:`, err.message);
        results.failed.push({ id, error: err.message });
      }
    }

    res.json({
      success: true,
      message: `Import hoàn tất (${results.success.length} thành công, ${results.failed.length} lỗi)`,
      results,
    });
  } catch (err) {
    console.error("IMPORT ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};


// === UPDATE PRODUCT ===
exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ error: "Không tìm thấy!" });

    const body = req.body;

    // Cập nhật chung
    ['name', 'brand', 'category', 'description'].forEach(f => {
      if (body[f]) product[f] = body[f];
    });
    if (body.SKU) product.groupId = body.SKU;

    // Xử lý variant
    const variantIds = Array.isArray(body.variantId) ? body.variantId : [body.variantId].filter(Boolean);
    const skus = Array.isArray(body.sku) ? body.sku : [body.sku].filter(Boolean);
    const colorIds = Array.isArray(body.colorId) ? body.colorId : [body.colorId].filter(Boolean);
    const sizeIds = Array.isArray(body.sizeId) ? body.sizeId : [body.sizeId].filter(Boolean);
    const prices = Array.isArray(body.price) ? body.price.map(Number) : [body.price].map(Number);
    const stocks = Array.isArray(body.stock) ? body.stock.map(Number) : [body.stock].map(Number);

    const keptSKUs = new Set();

    for (let i = 0; i < skus.length; i++) {
      const sku = skus[i];
      const colorId = colorIds[i];
      const sizeId = sizeIds[i];
      const price = prices[i];
      const stock = stocks[i];

      if (!sku || !colorId || !sizeId || isNaN(price) || isNaN(stock)) continue;

      keptSKUs.add(sku);

      const existing = product.variants.find(v => v.sku === sku);
      if (existing) {
        existing.price = price;
        existing.stockQuantity = stock;
        existing.importPrice = Math.round(price * 0.8);
      } else {
        product.variants.push({
          sku, color: colorId, size: sizeId,
          price, stockQuantity: stock, importPrice: Math.round(price * 0.8),
          images: [], coverImage: null
        });
      }
    }

    // Xóa variant không còn
    product.variants = product.variants.filter(v => keptSKUs.has(v.sku));

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
    const folder = `oso/products/${safeName}`;

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