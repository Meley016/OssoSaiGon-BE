const express = require("express");
const router = express.Router();
const orderController = require("../controllers/orderController");
const { protect, apiProtect, requireRole } = require("../middlewares/auth");
// const { vnpayPayment, vnpayReturn, vnpayIPN } = require("../controllers/vnpayController");

// // 🟢 Thanh toán VNPay (user được phép)
// router.post("/vnpay-payment", apiProtect, vnpayPayment);

// // 🟢 Khi thanh toán thành công -> cập nhật order + cộng điểm loyalty
// router.get("/vnpay-return", vnpayReturn);
// router.get("/vnpay-ipn", vnpayIPN);

// 🧾 Client CRUD
router.post("/", apiProtect, orderController.createOrder);
// router.get("/my-orders", apiProtect, orderController.getMyOrders);
// router.get("/my-orders/:id", apiProtect, orderController.getMyOrderById);

// 🛠️ Admin quản lý toàn bộ
router.get("/", protect, requireRole("admin"), orderController.getOrders);
router.get("/:id", protect, requireRole("admin"), orderController.getOrderById);
router.put("/:id", protect, requireRole("admin"), orderController.updateOrder);
router.put("/:id/status", protect, requireRole("admin"), orderController.updateOrderStatus);
router.delete("/:id", protect, requireRole("admin"), orderController.cancelOrder);
router.get("/check-vnpay", async (req, res) => {
  const { orderId } = req.query;
  const order = await Order.findOne({ orderCode: orderId });
  if (!order) return res.json({ status: "not_found" });
  res.json({ status: order.status === "completed" ? "success" : "pending" });
});
module.exports = router;
