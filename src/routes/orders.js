const express = require("express");
const router = express.Router();
const orderController = require("../controllers/orderController");
const { protect, adminAuth } = require("../middlewares/auth");
const { vnpayPayment, vnpayReturn, vnpayIPN } = require("../controllers/vnpayController");

router.post("/vnpay-payment", protect, adminAuth, vnpayPayment);
router.get("/vnpay-return", vnpayReturn);
router.post("/vnpay-ipn", vnpayIPN);

router.get("/", protect, adminAuth, orderController.getOrders);
router.get("/:id", protect, adminAuth, orderController.getOrderById);
router.post("/", protect, adminAuth, orderController.createOrder);
router.put("/:id", protect, adminAuth, orderController.updateOrder);
router.put("/:id/status", protect, adminAuth, orderController.updateOrderStatus);
router.delete("/:id", protect, adminAuth, orderController.cancelOrder);

module.exports = router;