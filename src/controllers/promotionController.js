// src/controllers/promotionsController.js
const Promotion = require('../models/Promotion');

exports.listPromotions = async (req, res) => {
  try {
    const promotions = await Promotion.find().sort({ startDate: -1 }).lean();
    res.json(promotions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi server' });
  }
};

exports.getPromotion = async (req, res) => {
  try {
    const p = await Promotion.findById(req.params.id).lean();
    if (!p) return res.status(404).json({ error: 'Không tìm thấy khuyến mãi' });
    res.json(p);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi server' });
  }
};

exports.createPromotion = async (req, res) => {
  try {
    const data = req.body;
    // normalize type strings if needed (percentage vs percent)
    if (data.type === "percent") data.type = "percentage";
    const promo = await Promotion.create(data);
    res.status(201).json(promo);
  } catch (err) {
    console.error("createPromotion error:", err);
    res.status(400).json({ error: err.message || "Tạo thất bại" });
  }
};

exports.getPromotions = async (req, res) => {
  try {
    const list = await Promotion.find().sort({ startDate: -1 });
    res.json(list);
  } catch (err) {
    console.error("getPromotions error:", err);
    res.status(500).json({ error: "Lỗi server" });
  }
};

exports.updatePromotion = async (req, res) => {
  try {
    const promo = await Promotion.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!promo) return res.status(404).json({ error: "Không tìm thấy" });
    res.json(promo);
  } catch (err) {
    console.error("updatePromotion error:", err);
    res.status(400).json({ error: err.message || "Cập nhật thất bại" });
  }
};

exports.deletePromotion = async (req, res) => {
  try {
    await Promotion.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error("deletePromotion error:", err);
    res.status(500).json({ error: "Xóa thất bại" });
  }
};