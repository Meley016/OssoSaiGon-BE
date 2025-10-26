// src/controllers/colorController.js
const Color = require("../models/Color");

exports.getAllColors = async (req, res) => {
  try {
    const colors = await Color.find({}).sort({ name: 1 });
    res.json(colors);
  } catch (error) {
    console.error("Get colors error:", error);
    res.status(500).json({ success: false, error: "Lỗi lấy danh sách màu!" });
  }
};

exports.createColor = async (req, res) => {
  try {
    const { name, code } = req.body;
    
    console.log("📥 CREATE COLOR:", { name, code });
    
    if (!name || !code) {
      return res.status(400).json({ success: false, error: "Tên và mã màu là bắt buộc!" });
    }

    // Validate hex color
    if (!/^#([0-9A-F]{6})$/i.test(code)) {
      return res.status(400).json({ 
        success: false, 
        error: "Mã màu phải đúng định dạng #RRGGBB!" 
      });
    }

    const colorExists = await Color.findOne({ code: code.toUpperCase() });
    if (colorExists) {
      return res.status(400).json({ success: false, error: "Mã màu đã tồn tại!" });
    }

    const color = new Color({ 
      name, 
      code: code.toUpperCase() 
    });
    await color.save();
    
    console.log("✅ COLOR CREATED:", color);
    
    res.status(201).json({ 
      success: true, 
      message: "Thêm màu thành công!", 
      color 
    });
  } catch (error) {
    console.error("💥 Create color error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.updateColor = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code } = req.body;
    
    const color = await Color.findById(id);
    if (!color) {
      return res.status(404).json({ success: false, error: "Màu không tồn tại!" });
    }

    if (name) color.name = name;
    if (code) {
      if (!/^#([0-9A-F]{6})$/i.test(code)) {
        return res.status(400).json({ success: false, error: "Mã màu phải đúng định dạng #RRGGBB!" });
      }
      color.code = code.toUpperCase();
    }
    
    await color.save();
    res.json({ success: true, message: "Cập nhật thành công!", color });
  } catch (error) {
    console.error("💥 Update color error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.deleteColor = async (req, res) => {
  try {
    const { id } = req.params;
    const color = await Color.findByIdAndDelete(id);
    
    if (!color) {
      return res.status(404).json({ success: false, error: "Màu không tồn tại!" });
    }
    
    res.json({ success: true, message: "Xóa thành công!" });
  } catch (error) {
    console.error("💥 Delete color error:", error);
    res.status(500).json({ success: false, error: "Xóa thất bại!" });
  }
};