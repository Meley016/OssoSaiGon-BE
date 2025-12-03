const express = require("express");
const router = express.Router();
const orderController = require("../controllers/orderController");
const { protect, apiProtect, requireRole } = require("../middlewares/auth");

// 🧾 Client CRUD
router.post("/", apiProtect, orderController.createOrder);
router.post("/pre-create", apiProtect, orderController.preCreateOrder);
router.get("/user/order/:orderId", apiProtect, orderController.getOrderByIdForUser);
router.get("/user", apiProtect, orderController.getUserOrders);
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
