const express = require("express");
const router = express.Router();
const { apiProtect } = require("../middlewares/auth");

const paymentController = require("../controllers/paymentController");
const vnpayController = require("../controllers/vnpayController");
const paypalController = require("../controllers/paypalController");

// 🟢 Thanh toán tổng hợp (tùy phương thức)
router.post("/create", apiProtect, paymentController.createPayment);

// ================== VNPay ==================
router.post("/vnpay-payment", apiProtect, vnpayController.vnpayPayment); // ✅ FE gọi endpoint này
router.get("/vnpay-return", vnpayController.vnpayReturn); // ✅ returnUrl (redirect user)
router.get("/vnpay-ipn", vnpayController.vnpayIPN); // ✅ ipnUrl (VNPay gọi server)

// ================== PayPal ==================
router.post("/paypal", apiProtect, paypalController.createPayment);
router.get("/paypal/success", paypalController.success);
router.get("/paypal/cancel", paypalController.cancel);

module.exports = router;
