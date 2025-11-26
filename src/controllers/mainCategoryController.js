const MainCategory = require("../models/MainCategory");
const Category = require("../models/Category");

//  Lấy tất cả danh mục lớn
exports.getAllMainCategories = async (req, res) => {
  try {
    const mains = await MainCategory.find().sort({ createdAt: -1 });
    res.json(mains);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Lấy 1 danh mục lớn theo ID
exports.getMainCategoryById = async (req, res) => {
  try {
    const main = await MainCategory.findById(req.params.id);
    if (!main) return res.status(404).json({ error: "Không tìm thấy danh mục lớn!" });
    res.json(main);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Tạo danh mục lớn
exports.createMainCategory = async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: "Tên danh mục lớn là bắt buộc!" });

    const newMain = new MainCategory({
      name,
      description,
      image: req.file?.path || null, // nếu có upload lên cloudinary
    });

    await newMain.save();
    res.json({ success: true, message: "Tạo danh mục lớn thành công!", data: newMain });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Cập nhật danh mục lớn
exports.updateMainCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    const main = await MainCategory.findById(id);
    if (!main) return res.status(404).json({ error: "Không tìm thấy danh mục lớn!" });

    if (name) main.name = name;
    if (description) main.description = description;
    if (req.file?.path) main.image = req.file.path;

    await main.save();
    res.json({ success: true, message: "Cập nhật danh mục lớn thành công!", data: main });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Xóa danh mục lớn
exports.deleteMainCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const hasCategory = await Category.findOne({ mainCategory: id });

    if (hasCategory)
      return res.status(400).json({ error: "Không thể xóa vì có danh mục con liên kết!" });

    const deleted = await MainCategory.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ error: "Không tìm thấy danh mục lớn!" });

    res.json({ success: true, message: "Đã xóa danh mục lớn!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Gắn Category con vào Main Category
exports.assignCategoryToMain = async (req, res) => {
  try {
    const { mainCategoryId, categoryId } = req.body;
    if (!mainCategoryId || !categoryId)
      return res.status(400).json({ error: "Thiếu dữ liệu!" });

    const main = await MainCategory.findById(mainCategoryId);
    const category = await Category.findById(categoryId);

    if (!main || !category)
      return res.status(404).json({ error: "Danh mục hoặc danh mục lớn không tồn tại!" });

    category.mainCategory = mainCategoryId;
    await category.save();

    res.json({
      success: true,
      message: `Đã gắn danh mục '${category.name}' vào '${main.name}'`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
