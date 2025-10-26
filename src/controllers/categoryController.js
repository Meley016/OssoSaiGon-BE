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

exports.createCategory = async (req, res) => {
  try {
    const { name, description } = req.body;
    
    console.log("📥 CREATE CATEGORY:", { name, description });
    
    if (!name) {
      return res.status(400).json({ success: false, error: "Tên danh mục là bắt buộc!" });
    }

    const categoryExists = await Category.findOne({ name });
    if (categoryExists) {
      return res.status(400).json({ success: false, error: "Tên danh mục đã tồn tại!" });
    }

    const category = new Category({ name, description });
    await category.save();
    
    console.log("✅ CATEGORY CREATED:", category);
    
    res.status(201).json({ 
      success: true, 
      message: "Thêm danh mục thành công!", 
      category 
    });
  } catch (error) {
    console.error("💥 Create category error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, isActive } = req.body;
    
    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ success: false, error: "Danh mục không tồn tại!" });
    }

    if (name) category.name = name;
    if (description !== undefined) category.description = description;
    if (isActive !== undefined) category.isActive = isActive;
    
    await category.save();
    res.json({ success: true, message: "Cập nhật thành công!", category });
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