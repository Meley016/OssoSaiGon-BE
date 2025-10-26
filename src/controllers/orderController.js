// src/controllers/ordersController.js
const Order = require('../models/Order'); // path theo project của bạn
const User = require('../models/User');

exports.listOrders = async (req, res) => {
  try {
    const { status, orderId, page = 1, limit = 20 } = req.query;
    const q = {};
    if (status) q.status = status;
    if (orderId) q.orderCode = orderId;

    const skip = (Math.max(1, Number(page)) - 1) * Number(limit);
    const [orders, total] = await Promise.all([
      Order.find(q).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      Order.countDocuments(q)
    ]);

    res.json({ orders, pagination: { page: Number(page), limit: Number(limit), total } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi server' });
  }
};

exports.getOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).lean();
    if (!order) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
    res.json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi server' });
  }
};

exports.updateOrder = async (req, res) => {
  try {
    const updates = req.body;
    const order = await Order.findByIdAndUpdate(req.params.id, updates, { new: true }).lean();
    if (!order) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
    res.json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi server' });
  }
};

// Toggle status quick (cycle or set)
exports.toggleStatus = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
    const allowed = ['pending','processing','shipped','delivered','cancelled'];
    // if query.status provided -> set explicit
    if (req.query.status && allowed.includes(req.query.status)) {
      order.status = req.query.status;
    } else {
      // cycle to next (simple logic)
      const idx = allowed.indexOf(order.status);
      order.status = allowed[(idx + 1) % allowed.length];
    }
    await order.save();
    res.json({ message: 'Cập nhật trạng thái thành công', status: order.status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi server' });
  }
};

exports.deleteOrder = async (req, res) => {
  try {
    const d = await Order.findByIdAndDelete(req.params.id);
    if (!d) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
    res.json({ message: 'Xóa đơn hàng thành công' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi server' });
  }
};
