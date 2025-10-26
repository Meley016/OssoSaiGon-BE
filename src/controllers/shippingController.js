// src/controllers/shippingController.js
const Shipping = require('../models/Shipping');

exports.listShipping = async (req, res) => {
  try {
    const items = await Shipping.find().sort({ name: 1 }).lean();
    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi server' });
  }
};

exports.getShipping = async (req, res) => {
  try {
    const s = await Shipping.findById(req.params.id).lean();
    if (!s) return res.status(404).json({ error: 'Không tìm thấy phương thức' });
    res.json(s);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi server' });
  }
};

exports.createShipping = async (req, res) => {
  try {
    const doc = await Shipping.create(req.body);
    res.status(201).json(doc);
  } catch (err) {
    console.error("createShipping error:", err);
    res.status(400).json({ error: err.message || "Tạo thất bại" });
  }
};

exports.getShipping = async (req, res) => {
  try {
    const methods = await Shipping.find().sort({ name: 1 });
    res.json(methods);
  } catch (err) {
    console.error("getShipping error:", err);
    res.status(500).json({ error: "Lỗi server" });
  }
};

exports.updateShipping = async (req, res) => {
  try {
    const { id } = req.params;
    const m = await Shipping.findByIdAndUpdate(id, req.body, { new: true });
    if (!m) return res.status(404).json({ error: "Không tìm thấy" });
    res.json(m);
  } catch (err) {
    console.error("updateShipping error:", err);
    res.status(500).json({ error: "Cập nhật thất bại" });
  }
};

exports.deleteShipping = async (req, res) => {
  try {
    const { id } = req.params;
    await Shipping.findByIdAndDelete(id);
    res.json({ success: true });
  } catch (err) {
    console.error("deleteShipping error:", err);
    res.status(500).json({ error: "Xóa thất bại" });
  }
};
