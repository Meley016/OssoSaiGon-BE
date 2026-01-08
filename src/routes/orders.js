const express = require("express");
const router = express.Router();
const Order = require("../models/Order");
const orderController = require("../controllers/orderController");
const { protect, apiProtect, requireRole } = require("../middlewares/auth");

// 🧾 Client CRUD
router.post("/", apiProtect, orderController.createOrder);
router.post("/pre-create", apiProtect, orderController.preCreateOrder);
router.get("/user/order/:orderId", apiProtect, orderController.getOrderByIdForUser);
router.get("/user", apiProtect, orderController.getOrdersForUser);
// 🛠️ Admin quản lý toàn bộ
router.get("/", protect, requireRole("admin"), orderController.getOrders);
router.get("/:id", protect, requireRole("admin"), orderController.getOrderById);
router.put("/:id", protect, requireRole("admin"), orderController.updateOrder);
router.put("/:id/status", protect, requireRole("admin"), orderController.updateOrderStatus);
router.delete("/:id", protect, requireRole("admin"), orderController.cancelOrder);

router.get("/check-vnpay", async (req, res) => {
  try {
    const { orderCode } = req.query; 
    if (!orderCode) return res.status(400).json({ status: "error", message: "Missing orderCode" });

    const order = await Order.findOne({ orderCode });
    if (!order) return res.json({ status: "not_found" });

    let status;
    if (order.status === "paid") status = "success";
    else if (["failed", "cancelled", "expired"].includes(order.status)) status = "failed";
    else status = "pending";

    res.json({
      status,
      orderCode: order.orderCode,
      total: order.total,
      paymentMethod: order.paymentMethod || "VNPAY",
      createdAt: order.createdAt,
      items: order.items,
      promotion: order.promotionId || null,
      shippingAddress: order.shippingAddress,
    });
  } catch (err) {
    console.error("Check VNPay order error:", err);
    res.status(500).json({ status: "error", message: "Server error" });
  }
});

module.exports = router;
