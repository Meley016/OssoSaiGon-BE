const fs = require("fs").promises;
const csv = require("csv-parser");
const XLSX = require("xlsx");
const path = require("path");
const cloudinary = require("cloudinary").v2;
const { Readable } = require("stream");
const mongoose = require("mongoose");
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
exports.getAllProductsAdvanced = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const {
      name,
      category,
      brand,
      color,
      inStock,
      minPrice,
      maxPrice,
      sort,
    } = req.query;

    /* ================= MATCH PRODUCT ================= */
    const matchProduct = { status: "active" };

    if (name) matchProduct.name = new RegExp(name, "i");
    if (category) matchProduct.category = new mongoose.Types.ObjectId(category);
    if (brand) matchProduct.brand = new RegExp(`^${brand}$`, "i");

    /* ================= MATCH VARIANT ================= */
    const matchVariant = {};

    if (color) {
      matchVariant["variants.color"] = new mongoose.Types.ObjectId(color);
    }

    if (inStock === "true") {
      matchVariant["variants.stockQuantity"] = { $gt: 0 };
    }

    if (minPrice || maxPrice) {
      matchVariant["variants.price"] = {};
      if (minPrice) matchVariant["variants.price"].$gte = Number(minPrice);
      if (maxPrice) matchVariant["variants.price"].$lte = Number(maxPrice);
    }

    /* ================= PIPELINE ================= */
    const pipeline = [
      { $match: matchProduct },
      { $unwind: "$variants" },

      ...(Object.keys(matchVariant).length
        ? [{ $match: matchVariant }]
        : []),

      {
        $lookup: {
          from: "colors",
          localField: "variants.color",
          foreignField: "_id",
          as: "variants.color",
        },
      },
      { $unwind: { path: "$variants.color", preserveNullAndEmptyArrays: true } },

      {
        $lookup: {
          from: "sizes",
          localField: "variants.size",
          foreignField: "_id",
          as: "variants.size",
        },
      },
      { $unwind: { path: "$variants.size", preserveNullAndEmptyArrays: true } },

      {
        $group: {
          _id: "$_id",
          groupId: { $first: "$groupId" },
          name: { $first: "$name" },
          brand: { $first: "$brand" },
          category: { $first: "$category" },
          createdAt: { $first: "$createdAt" },
          variants: { $push: "$variants" },
          minPrice: { $min: "$variants.price" },
        },
      },

      ...(sort === "price_asc" ? [{ $sort: { minPrice: 1 } }] : []),
      ...(sort === "price_desc" ? [{ $sort: { minPrice: -1 } }] : []),
      ...(sort === "name_asc" ? [{ $sort: { name: 1 } }] : []),
      ...(sort === "name_desc" ? [{ $sort: { name: -1 } }] : []),
      ...(!sort ? [{ $sort: { createdAt: -1 } }] : []),

      {
        $facet: {
          data: [{ $skip: skip }, { $limit: limit }],
          total: [{ $count: "count" }],
        },
      },
    ];

    const result = await Product.aggregate(pipeline);
    const products = result[0]?.data || [];
    const total = result[0]?.total[0]?.count || 0;

    const formatted = products.map(p => {
      const validVariants = (p.variants || []).filter(v =>
        v &&
        v.color &&
        v.size &&
        Array.isArray(v.images)
      );

      return {
        _id: p._id,
        groupId: p.groupId,
        name: p.name,
        brand: p.brand,
        category: p.category,
        variants: validVariants,
        coverImage:
          validVariants?.[0]?.coverImage ||
          validVariants?.[0]?.images?.[0] ||
          "/imgs/placeholder.jpg",
      };
    });

    res.json({
      success: true,
      data: formatted,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        total,
      },
    });
  } catch (err) {
    console.error("GET ALL PRODUCTS ADVANCED ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};
exports.getAllBrands = async (req, res) => {
  try {
    const brands = await Product.distinct("brand", {
      brand: { $ne: null, $ne: "" },
      status: "active",
    });

    res.json(
      brands
        .filter(Boolean)
        .map((b) => b.trim())
        .sort((a, b) => a.localeCompare(b))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Cannot fetch brands" });
  }
};
exports.getProductsByCategories = async (req, res) => {
  try {
    let {
      categories,
      page = 1,
      limit = 12,
      name,
      color,
      inStock,
      minPrice,
      maxPrice,
      sort,
    } = req.query;

    if (!categories) {
      return res.status(400).json({ message: "Thiếu categories" });
    }

    if (!Array.isArray(categories)) {
      categories = [categories];
    }

    page = Number(page);
    limit = Number(limit);
    const skip = (page - 1) * limit;

    /* ================= BASE QUERY ================= */
    const query = {
      category: { $in: categories },
      status: "active",
    };

    // 🔍 SEARCH NAME (TEXT INDEX)
    if (name) {
      query.$text = { $search: name };
    }

    /* ================= VARIANT FILTER ================= */
    const variantMatch = {};

    // 🎨 color (ObjectId)
    if (color) {
      variantMatch["variants.color"] = color;
    }

    // 📦 stock
    if (inStock === "true") {
      variantMatch["variants.stockQuantity"] = { $gt: 0 };
    }

    // 💰 price
    if (minPrice || maxPrice) {
      variantMatch["variants.price"] = {};
      if (minPrice) variantMatch["variants.price"].$gte = Number(minPrice);
      if (maxPrice) variantMatch["variants.price"].$lte = Number(maxPrice);
    }

    Object.assign(query, variantMatch);

    /* ================= SORT ================= */
    let sortOption = { createdAt: -1 };

    if (sort === "name_asc") sortOption = { name: 1 };
    if (sort === "name_desc") sortOption = { name: -1 };
    if (sort === "price_asc") sortOption = { "variants.price": 1 };
    if (sort === "price_desc") sortOption = { "variants.price": -1 };

    /* ================= QUERY ================= */
    const total = await Product.countDocuments(query);

    const products = await Product.find(query)
      .populate("category", "name")
      .populate("variants.color", "name code")
      .populate("variants.size", "name code")
      .sort(sortOption)
      .skip(skip)
      .limit(limit)
      .lean();

    /* ================= FORMAT ================= */
    const formatted = products.map((p) => {
      let variants = p.variants || [];

      // LỌC VARIANT ĐÚNG THEO FILTER
      variants = variants.filter((v) => {
        if (!v || typeof v.price !== "number") return false;
        if (color && String(v.color?._id) !== String(color)) return false;
        if (inStock === "true" && v.stockQuantity <= 0) return false;
        if (minPrice && v.price < Number(minPrice)) return false;
        if (maxPrice && v.price > Number(maxPrice)) return false;
        return true;
      });

      if (variants.length === 0) return null;

      return {
        _id: p._id,
        name: p.name,
        coverImage:
          p.coverImage ||
          variants[0]?.coverImage ||
          variants[0]?.images?.[0] ||
          "/imgs/placeholder.jpg",
        variants,
      };
    }).filter(Boolean);

    res.json({
      success: true,
      data: formatted,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("GET PRODUCTS BY CATEGORIES ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getProductsByBrand = async (req, res) => {
  try {
    let {
      brand,
      page = 1,
      limit = 12,
      name,
      color,
      inStock,
      category,
      sort,
    } = req.query;

    page = Number(page);
    limit = Number(limit);
    const skip = (page - 1) * limit;

    /* ================= BASE QUERY ================= */
    const query = {
      status: "active",
    };

    if (brand) {
      query.brand = new RegExp(`^${brand.trim()}$`, "i");
    }

    if (category) {
      query.category = category;
    }

    if (name) {
      query.$text = { $search: name };
    }

    /* ================= VARIANT FILTER ================= */
    const variantFilter = {};

    if (color) {
      variantFilter.color = color;
    }

    if (inStock === "true") {
      variantFilter.stockQuantity = { $gt: 0 };
    }

    /* ================= SORT ================= */
    let sortOption = { createdAt: -1 };

    if (sort === "name_asc") sortOption = { name: 1 };
    if (sort === "name_desc") sortOption = { name: -1 };

    /* ================= QUERY ================= */
    const total = await Product.countDocuments(query);

    const products = await Product.find(query)
      .populate("category", "name")
      .populate("variants.color", "name code")
      .populate("variants.size", "name code")
      .sort(sortOption)
      .skip(skip)
      .limit(limit)
      .lean();

    /* ================= FORMAT (GIỐNG CATEGORY) ================= */
    const formatted = products
      .map((p) => {
        let variants = p.variants || [];

        // lọc variant theo điều kiện
        variants = variants.filter((v) => {
          if (!v || typeof v.price !== "number") return false;
          if (color && String(v.color?._id) !== String(color)) return false;
          if (inStock === "true" && v.stockQuantity <= 0) return false;
          return true;
        });

        if (variants.length === 0) return null;

        return {
          _id: p._id,
          name: p.name,
          brand: p.brand,
          category: p.category,
          variants, // ✅ GIỮ NGUYÊN salePrice
          coverImage:
            p.coverImage ||
            variants[0]?.coverImage ||
            variants[0]?.images?.[0] ||
            "/imgs/placeholder.jpg",
        };
      })
      .filter(Boolean);

    res.json({
      success: true,
      data: formatted,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("GET PRODUCTS BY BRAND ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getCategoriesByBrand = async (req, res) => {
  try {
    const { brand } = req.query;
    if (!brand) {
      return res.status(400).json({ message: "Thiếu brand" });
    }

    const categoryIds = await Product.distinct("category", {
      brand: new RegExp(`^${brand}$`, "i"),
      status: "active",
      category: { $ne: null },
    });

    const categories = await Category.find({
      _id: { $in: categoryIds },
    })
      .select("_id name")
      .sort({ name: 1 });

    res.json({
      success: true,
      data: categories,
    });
  } catch (err) {
    console.error("GET CATEGORIES BY BRAND ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};
exports.getColorsByBrandCategory = async (req, res) => {
  try {
    const { brand, category } = req.query;

    if (!brand) {
      return res.status(400).json({ message: "Thiếu brand" });
    }

    const matchProduct = {
      status: "active",
      brand: new RegExp(`^${brand}$`, "i"),
    };

    if (category) {
      matchProduct.category = new mongoose.Types.ObjectId(category);
    }

    const colorIds = await Product.aggregate([
      { $match: matchProduct },
      { $unwind: "$variants" },
      {
        $match: {
          "variants.color": { $ne: null },
        },
      },
      {
        $group: {
          _id: "$variants.color",
        },
      },
    ]);

    const ids = colorIds.map(c => c._id);

    const colors = await Color.find({
      _id: { $in: ids },
    }).select("_id name code");

    res.json({
      success: true,
      data: colors,
    });
  } catch (err) {
    console.error("GET COLORS BY BRAND CATEGORY ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};
exports.getProductFacets = async (req, res) => {
  try {
    const { brand, category } = req.query;

    const matchProduct = { status: "active" };

    if (brand) {
      matchProduct.brand = new RegExp(`^${brand}$`, "i");
    }

    if (category) {
      matchProduct.category = new mongoose.Types.ObjectId(category);
    }

    const result = await Product.aggregate([
      { $match: matchProduct },
      { $unwind: "$variants" },
      {
        $match: {
          "variants.price": { $ne: null },
          "variants.color": { $ne: null },
        },
      },
      {
        $group: {
          _id: null,
          brands: { $addToSet: "$brand" },
          categories: { $addToSet: "$category" },
          colors: { $addToSet: "$variants.color" },
        },
      },
    ]);

    const facet = result[0] || {};

    res.json({
      success: true,
      data: {
        brands: (facet.brands || []).sort(),
        categories: await Category.find({
          _id: { $in: facet.categories || [] },
        }).select("_id name"),
        colors: await Color.find({
          _id: { $in: facet.colors || [] },
        }).select("_id name code"),
      },
    });
  } catch (err) {
    console.error("FACETS ERROR:", err);
    res.status(500).json({ message: "Server error" });
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

// === GET BY GROUP ID ===
exports.getProductByGroupId = async (req, res) => {
  try {
    const product = await Product.findOne({
      groupId: req.params.groupId,
      status: "active",
    })
      .populate("category", "name")
      .populate("variants.color", "name code")
      .populate("variants.size", "name code")
      .lean();

    if (!product) {
      return res.status(404).json({ error: "Không tìm thấy sản phẩm" });
    }

    product.coverImage =
      product.variants?.[0]?.coverImage || "/imgs/placeholder.jpg";

    res.json(product);
  } catch (err) {
    console.error("GET PRODUCT BY GROUP ID ERROR:", err);
    res.status(500).json({ error: "Lỗi server", details: err.message });
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
        salePrice: v.salePrice ? Number(v.salePrice) : null,
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
        salePrice:
          r["Sale Price"] !== undefined && r["Sale Price"] !== ""
            ? Number(r["Sale Price"])
            : null,

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
            salePrice: v.salePrice,
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
              exist.salePrice = v.salePrice;
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
exports.exportProducts = async (req, res) => {
  try {
    const {
      mode = "all",        // selected | filtered | all
      ids,
      category,
      brand,
      type = "xlsx"
    } = req.query;

    let query = {};

    /* =========================
       1️⃣ BUILD QUERY THEO MODE
    ========================= */

    // 🔘 EXPORT THEO ID ĐƯỢC CHỌN
    if (mode === "selected") {
      if (!ids) {
        return res.status(400).json({ error: "Thiếu ids để export" });
      }

      query._id = {
        $in: ids.split(",").map(id => new mongoose.Types.ObjectId(id))
      };
    }

    // 🔘 EXPORT THEO FILTER (ALL PAGE)
    else if (mode === "filtered") {
      if (category) {
        query.category = new mongoose.Types.ObjectId(category);
      }

      if (brand) {
        query.brand = new RegExp(`^${brand}$`, "i");
      }
    }

    // 🔘 EXPORT ALL → query = {}
    else if (mode === "all") {
      query = {};
    }

    else {
      return res.status(400).json({ error: "Mode export không hợp lệ" });
    }

    console.log("EXPORT MODE:", mode);
    console.log("EXPORT QUERY:", JSON.stringify(query, null, 2));

    /* =========================
       2️⃣ QUERY DATABASE
    ========================= */

    const products = await Product.find(query)
      .populate("category", "name")
      .populate("variants.color", "name code")
      .populate("variants.size", "name code")
      .lean();

    /* =========================
       3️⃣ BUILD ROWS (VARIANT LEVEL)
    ========================= */

    const rows = [];

    for (const p of products) {
      for (const v of p.variants || []) {
        rows.push({
          ID: p.groupId,
          Name: p.name,
          Brand: p.brand || "",
          Description: p.description || "",
          Category: p.category?.name || "",
          SKU: v.sku,
          "Color name": v.color?.name || "",
          "Color code": v.color?.code || "",
          "Size name": v.size?.name || "",
          "Size code": v.size?.code || "",
          Price: v.price,
          "Sale Price": v.salePrice || "",
          Quantity: v.stockQuantity,
          "Sub Images": (v.images || []).join(",")
        });
      }
    }

    if (!rows.length) {
      return res.status(400).json({ error: "Không có sản phẩm để export" });
    }

    /* =========================
       4️⃣ EXPORT FILE
    ========================= */

    // === XLSX ===
    if (type === "xlsx") {
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Products");

      const buffer = XLSX.write(wb, {
        type: "buffer",
        bookType: "xlsx"
      });

      res.setHeader(
        "Content-Disposition",
        "attachment; filename=products_export.xlsx"
      );
      res.type(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      return res.send(buffer);
    }

    // === CSV ===
    const { Parser } = require("json2csv");
    const parser = new Parser({ fields: Object.keys(rows[0]) });
    const csv = parser.parse(rows);

    res.setHeader(
      "Content-Disposition",
      "attachment; filename=products_export.csv"
    );
    res.type("text/csv");
    res.send(csv);

  } catch (err) {
    console.error("EXPORT ERROR:", err);
    res.status(500).json({ error: "Lỗi export" });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    /* =====================
       UPDATE BASIC INFO
    ===================== */
    const { SKU, name, brand, category, description } = req.body;

    if (SKU) product.groupId = SKU.trim();
    if (name) product.name = name.trim();
    if (brand) product.brand = brand.trim();
    if (category) product.category = category;
    if (description !== undefined) product.description = description;

    /* =====================
       PARSE VARIANTS
    ===================== */
    let variants = [];
    try {
      variants = JSON.parse(req.body.variants || "[]");
    } catch {
      return res.status(400).json({ error: "Variants JSON invalid" });
    }

    if (!variants.length) {
      return res.status(400).json({ error: "At least one variant is required" });
    }

    /* =====================
       MAP FILES BY COLOR
    ===================== */
    const filesByColor = {};
    if (Array.isArray(req.files)) {
      req.files.forEach(file => {
        const match = file.fieldname.match(/^variantImageFile\[(.+)\]$/);
        if (!match) return;

        const colorId = match[1];
        if (!filesByColor[colorId]) filesByColor[colorId] = [];
        filesByColor[colorId].push(file);
      });
    }

    /* =====================
       REMOVE IMAGES (DB + CLOUDINARY)
    ===================== */
    const removeImages =
      req.body.removeImages ||
      req.body["removeImages[]"] ||
      [];

    const removeSet = new Set(
      Array.isArray(removeImages) ? removeImages : [removeImages]
    );

    if (removeSet.size) {
      for (const variant of product.variants) {
        if (!Array.isArray(variant.images)) continue;

        variant.images = variant.images.filter(imgUrl => {
          if (removeSet.has(imgUrl)) {
            // 🔥 extract public_id từ URL
            const parts = imgUrl.split("/upload/");
            if (parts[1]) {
              const publicId = parts[1]
                .replace(/^v\d+\//, "")
                .replace(/\.[^/.]+$/, "");

              cloudinary.uploader
                .destroy(publicId)
                .catch(err =>
                  console.error("Cloudinary delete failed:", publicId, err.message)
                );
            }
            return false; // ❌ remove khỏi DB
          }
          return true;
        });

        variant.coverImage = variant.images[0] || null;
      }

      product.markModified("variants");
    }

    /* =====================
       PROCESS VARIANTS
    ===================== */
    const keepVariantIds = new Set();

    for (const v of variants) {
      const { _id, color, size, stockQuantity, price, salePrice } = v;
      if (!color || !size || price <= 0) continue;

      if (_id) {
        // UPDATE VARIANT CŨ
        const existing = product.variants.id(_id);
        if (!existing) continue;

        const finalSalePrice = salePrice && !isNaN(Number(salePrice)) && Number(salePrice) > 0 
        ? Number(salePrice) 
        : null;

      // Validate: salePrice không được > price
      if (finalSalePrice !== null && finalSalePrice > Number(price)) {
        return res.status(400).json({ 
          error: `salePrice (${finalSalePrice}) phải nhỏ hơn hoặc bằng price (${price}) cho biến thể ${_id || "mới"}` 
        });
      }
        existing.stockQuantity = stockQuantity;
        existing.price = price;
        existing.salePrice = finalSalePrice;
        keepVariantIds.add(existing._id.toString());
      } else {
        // ADD VARIANT MỚI
        product.variants.push({
          sku: `${product.groupId}-${color}-${size}`,
          color,
          size,
          stockQuantity,
          price,
          salePrice: finalSalePrice,
          importPrice: Math.round(price * 0.8),
          images: [],
          coverImage: null
        });

        const last = product.variants[product.variants.length - 1];
        keepVariantIds.add(last._id.toString());
      }
    }

    product.variants = product.variants.filter(v =>
      keepVariantIds.has(v._id.toString())
    );

    /* =====================
       UPLOAD NEW IMAGES
    ===================== */
    for (const colorId in filesByColor) {
      for (const file of filesByColor[colorId]) {
        const upload = await cloudinary.uploader.upload(file.path, {
          folder: `oso/products/${product.groupId}`
        });

        product.variants.forEach(v => {
          if (v.color.toString() === colorId) {
            v.images.push(upload.secure_url);
            v.coverImage = v.images[0] || null;
          }
        });
      }
    }

    /* =====================
       UPDATE PRODUCT COVER
    ===================== */
    const firstVariantWithImage = product.variants.find(v => v.coverImage);
    product.coverImage = firstVariantWithImage?.coverImage || null;

    await product.save();
    res.json({ success: true, product });

  } catch (err) {
    console.error("updateProduct error:", err);
    res.status(500).json({ error: "Update product failed" });
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: "Không tìm thấy!" });

    const safeName = (product.name || 'default').replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const folder = `oso/products/${safeName}`;

    try {
      // Thử xóa folder → nếu không tồn tại sẽ throw, catch sẽ bỏ qua
      await cloudinary.api.delete_resources_by_prefix(folder); // xóa tất cả ảnh bên trong
      await cloudinary.api.delete_folder(folder); // xóa folder
      console.log(`${folder} đã xóa`);
    } catch (err) {
      console.log(`${folder} không tồn tại trên Cloudinary - đã xóa sản phẩm`);
    }

    await Product.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Xóa thành công + ảnh nếu có" });

  } catch (err) {
    console.error("DELETE ERROR:", err);
    res.status(500).json({ error: "Lỗi xóa", details: err.message });
  }
};
exports.deleteMultipleProducts = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ error: "Chưa có sản phẩm nào để xóa" });
    }

    // Lọc các id hợp lệ
    const validIds = ids.filter(id => /^[0-9a-fA-F]{24}$/.test(id));

    if (!validIds.length) {
      return res.status(400).json({ error: "Không có ID hợp lệ để xóa" });
    }

    // Lấy danh sách sản phẩm để xóa ảnh
    const products = await Product.find({ _id: { $in: validIds } });

    for (const product of products) {
      const safeName = (product.name || "default").replace(/[^a-z0-9]/gi, "_").toLowerCase();
      const folder = `oso/products/${safeName}`;

      try {
        // Xóa tất cả ảnh trong folder
        await cloudinary.api.delete_resources_by_prefix(folder);
        await cloudinary.api.delete_folder(folder);
        console.log(`${folder} đã xóa`);
      } catch (err) {
        console.log(`${folder} không tồn tại trên Cloudinary - bỏ qua`);
      }
    }

    // Xóa sản phẩm trong database
    const result = await Product.deleteMany({ _id: { $in: validIds } });

    res.json({ 
      success: true, 
      deletedCount: result.deletedCount, 
      message: `${result.deletedCount} sản phẩm đã được xóa` 
    });

  } catch (err) {
    console.error("DELETE MULTIPLE PRODUCTS ERROR:", err);
    res.status(500).json({ error: "Lỗi server khi xóa nhiều sản phẩm", details: err.message });
  }
};