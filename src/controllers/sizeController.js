// src/controllers/sizeController.js
const Size = require("../models/Size");

exports.getAllSizes = async (req, res) => {
  try {
    const sizes = await Size.find({}).sort({ name: 1 });
    res.json(sizes);
  } catch (error) {
    console.error("Get sizes error:", error);
    res.status(500).json({ success: false, error: "Lỗi lấy danh sách size!" });
  }
};

exports.createSize = async (req, res) => {
  try {
    const { name, code } = req.body;
    if (!name || !code) return res.status(400).json({ success: false, error: "Tên và mã size là bắt buộc!" });

    const nameExists = await Size.findOne({ name });
    if (nameExists) return res.status(400).json({ success: false, error: "Tên size đã tồn tại!" });

    const codeExists = await Size.findOne({ code });
    if (codeExists) return res.status(400).json({ success: false, error: "Mã size đã tồn tại!" });

    const size = new Size({ name, code, isActive: true });
    await size.save();
    res.status(201).json({ success: true, message: "Thêm size thành công!", size });
  } catch (error) {
    console.error("CREATE SIZE ERROR:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.updateSize = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, isActive } = req.body;
    const size = await Size.findById(id);
    if (!size) return res.status(404).json({ success: false, error: "Size không tồn tại!" });
    if (name) size.name = name;
    if (code) size.code = code;
    if (isActive !== undefined) size.isActive = isActive;
    await size.save();
    res.json({ success: true, message: "Cập nhật thành công!", size });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.deleteSize = async (req, res) => {
  try {
    const { id } = req.params;
    const size = await Size.findByIdAndDelete(id);
    if (!size) return res.status(404).json({ success: false, error: "Size không tồn tại!" });
    res.json({ success: true, message: "Xóa thành công!" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Xóa thất bại!" });
  }
};