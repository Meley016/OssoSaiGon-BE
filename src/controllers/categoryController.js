// src/controllers/categoryController.js
const Category = require("../models/Category");

exports.getAllCategories = async (req, res) => {
  try {
    const categories = await Category.find({}).sort({ name: 1 });
    res.json(categories);
  } catch (error) {
    console.error("Get categories error:", error);
    res.status(500).json({ success: false, error: "Lỗi lấy danh sách danh mục!" });
  }
};

exports.getAllCategories = async (req, res) => {
  try {
    // ✅ populate mainCategory để FE hiển thị tên
    const categories = await Category.find({})
      .populate("mainCategory", "name _id")
      .sort({ name: 1 });
    res.json(categories);
  } catch (error) {
    console.error("Get categories error:", error);
    res.status(500).json({ success: false, error: "Lỗi lấy danh sách danh mục!" });
  }
};

exports.createCategory = async (req, res) => {
  try {
    const { name, description, mainCategory } = req.body;

    console.log("📥 CREATE CATEGORY:", { name, description, mainCategory });

    if (!name) {
      return res.status(400).json({ success: false, error: "Tên danh mục là bắt buộc!" });
    }

    const categoryExists = await Category.findOne({ name });
    if (categoryExists) {
      return res.status(400).json({ success: false, error: "Tên danh mục đã tồn tại!" });
    }

    let image = null;
    if (req.files && req.files.length > 0) {
      const file = req.files.find(f => f.fieldname === "categoryImage");
      if (file && file.path) image = file.path;
    }

    const category = new Category({
      name,
      description,
      image,
      mainCategory: mainCategory || null, // ✅ gắn liên kết
    });

    await category.save();

    const populated = await Category.findById(category._id).populate("mainCategory", "name _id");

    res.status(201).json({
      success: true,
      message: "Thêm danh mục thành công!",
      category: populated,
    });
  } catch (error) {
    console.error("💥 Create category error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getCategoryById = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id).populate("mainCategory", "name _id");
    if (!category) {
      return res.status(404).json({ success: false, error: "Không tìm thấy danh mục!" });
    }
    res.json(category);
  } catch (error) {
    console.error("💥 Get category by ID error:", error);
    res.status(500).json({ success: false, error: "Lỗi lấy danh mục!" });
  }
};

exports.updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, isActive, mainCategory } = req.body;

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ success: false, error: "Danh mục không tồn tại!" });
    }

    if (name) category.name = name;
    if (description !== undefined) category.description = description;
    if (isActive !== undefined) category.isActive = isActive;
    if (mainCategory !== undefined) category.mainCategory = mainCategory; // ✅ cập nhật quan hệ

    if (req.files && req.files.length > 0) {
      const file = req.files.find(f => f.fieldname === "categoryImage");
      if (file && file.path) {
        if (category.image) {
          const oldId = category.image.split("/").pop().split(".")[0];
          try {
            await cloudinary.uploader.destroy(oldId);
          } catch {}
        }
        category.image = file.path;
      }
    }

    await category.save();
    const populated = await Category.findById(id).populate("mainCategory", "name _id");

    res.json({ success: true, message: "Cập nhật thành công!", category: populated });
  } catch (error) {
    console.error("💥 Update category error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};


exports.deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const category = await Category.findByIdAndDelete(id);
    
    if (!category) {
      return res.status(404).json({ success: false, error: "Danh mục không tồn tại!" });
    }
    
    res.json({ success: true, message: "Xóa thành công!" });
  } catch (error) {
    console.error("💥 Delete category error:", error);
    res.status(500).json({ success: false, error: "Xóa thất bại!" });
  }
};