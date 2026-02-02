// src/controllers/categoryController.js
const Category = require("../models/Category");
const cloudinary = require("../config/cloudinary");

/**
 * Helper: cố gắng lấy public_id từ URL (best-effort)
 * Sai thì return null → destroy sẽ bị skip
 */
const extractPublicId = (url) => {
  try {
    if (!url) return null;

    // bỏ query string
    const cleanUrl = url.split("?")[0];

    // lấy tên file
    const fileName = cleanUrl.split("/").pop(); // abc.jpg
    if (!fileName) return null;

    // bỏ extension
    return fileName.substring(0, fileName.lastIndexOf(".")) || null;
  } catch {
    return null;
  }
};

/* ================== GET ALL ================== */
exports.getAllCategories = async (req, res) => {
  try {
    const categories = await Category.find({})
      .populate("mainCategory", "name _id")
      .sort({ name: 1 });

    res.json(categories);
  } catch (error) {
    console.error("Get categories error:", error);
    res.status(500).json({
      success: false,
      error: "Lỗi lấy danh sách danh mục!",
    });
  }
};

/* ================== CREATE ================== */
exports.createCategory = async (req, res) => {
  try {
    const { name, description, mainCategory } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: "Tên danh mục là bắt buộc!",
      });
    }

    const exists = await Category.findOne({ name });
    if (exists) {
      return res.status(400).json({
        success: false,
        error: "Tên danh mục đã tồn tại!",
      });
    }

    let image = null;
    if (req.files?.length) {
      const file = req.files.find((f) => f.fieldname === "categoryImage");
      if (file?.path) image = file.path; // chỉ lưu URL
    }

    const category = new Category({
      name,
      description,
      image,
      mainCategory: mainCategory || null,
    });

    await category.save();

    const populated = await Category.findById(category._id).populate(
      "mainCategory",
      "name _id"
    );

    res.status(201).json({
      success: true,
      message: "Thêm danh mục thành công!",
      category: populated,
    });
  } catch (error) {
    console.error("Create category error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/* ================== GET BY ID ================== */
exports.getCategoryById = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id).populate(
      "mainCategory",
      "name _id"
    );

    if (!category) {
      return res.status(404).json({
        success: false,
        error: "Không tìm thấy danh mục!",
      });
    }

    res.json(category);
  } catch (error) {
    console.error("Get category error:", error);
    res.status(500).json({
      success: false,
      error: "Lỗi lấy danh mục!",
    });
  }
};

/* ================== UPDATE ================== */
exports.updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, isActive, mainCategory } = req.body;

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({
        success: false,
        error: "Danh mục không tồn tại!",
      });
    }

    // update text fields
    if (name) category.name = name;
    if (description !== undefined) category.description = description;
    if (isActive !== undefined) category.isActive = isActive;
    if (mainCategory !== undefined) category.mainCategory = mainCategory;

    // xử lý ảnh
    if (req.files?.length) {
      const file = req.files.find((f) => f.fieldname === "categoryImage");
      if (file?.path) {
        const oldImageUrl = category.image; // giữ lại ảnh cũ

        // 1️⃣ gán ảnh mới trước (KHÔNG phụ thuộc cloudinary cũ)
        category.image = file.path;
        await category.save();

        // 2️⃣ thử xóa ảnh cũ (best-effort)
        const oldPublicId = extractPublicId(oldImageUrl);
        if (oldPublicId) {
          cloudinary.uploader.destroy(oldPublicId).catch(() => {}); // ❌ fail thì bỏ qua
        }

        const populated = await Category.findById(id).populate(
          "mainCategory",
          "name _id"
        );

        return res.json({
          success: true,
          message: "Cập nhật thành công!",
          category: populated,
        });
      }
    }

    // không có ảnh
    await category.save();

    const populated = await Category.findById(id).populate(
      "mainCategory",
      "name _id"
    );

    res.json({
      success: true,
      message: "Cập nhật thành công!",
      category: populated,
    });
  } catch (error) {
    console.error("Update category error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/* ================== DELETE ================== */
exports.deleteCategory = async (req, res) => {
  try {
    const category = await Category.findByIdAndDelete(req.params.id);

    if (!category) {
      return res.status(404).json({
        success: false,
        error: "Danh mục không tồn tại!",
      });
    }

    // xóa ảnh (best-effort)
    const publicId = extractPublicId(category.image);
    if (publicId) {
      cloudinary.uploader.destroy(publicId).catch(() => {});
    }

    res.json({
      success: true,
      message: "Xóa thành công!",
    });
  } catch (error) {
    console.error("Delete category error:", error);
    res.status(500).json({
      success: false,
      error: "Xóa thất bại!",
    });
  }
};
