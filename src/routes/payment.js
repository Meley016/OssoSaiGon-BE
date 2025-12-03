const express = require("express");
const router = express.Router();
const { apiProtect } = require("../middlewares/auth");
const paypalController = require("../controllers/paypalController");
const paymentController = require("../controllers/paymentController");
const vnpayController = require("../controllers/vnpayController");
const stripeController = require("../controllers/stripeController");

// 🟢 Thanh toán tổng hợp (tùy phương thức)
router.post("/create", apiProtect, paymentController.createPayment);

// ================== VNPay ==================
router.post("/vnpay-payment", apiProtect, vnpayController.vnpayPayment); // ✅ FE gọi endpoint này
router.get("/vnpay-return", vnpayController.vnpayReturn); // ✅ returnUrl (redirect user)
router.get("/vnpay-ipn", vnpayController.vnpayIPN); // ✅ ipnUrl (VNPay gọi server)

// ================== PayPal ==================
router.get("/paypal", paypalController.createPaypalPayment);
router.get("/paypal/success", paypalController.capturePaypal);
router.get("/paypal/cancel", (req, res) => {
  res.redirect(`${process.env.CLIENT_URL}/payment-failed`);
});

// ================== Stripe ==================
// Tạo PaymentIntent
router.post("/create-payment-intent", apiProtect, stripeController.createPaymentIntent);

// Stripe webhook (Stripe gọi)
router.post("/webhook", stripeController.handleWebhook);
module.exports = router;
