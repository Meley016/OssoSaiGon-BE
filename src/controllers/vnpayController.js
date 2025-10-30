const VNPay = require("vnpay");
const Order = require("../models/Order");
const { User } = require("../models/User");

// VNPay config
const vnpayConfig = {
  tmnCode: process.env.VNP_TMNCODE,
  secureSecret: process.env.VNP_HASHSECRET,
  vnpayHost: process.env.VNP_URL || "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html",
  returnUrl: process.env.VNP_RETURN_URL,
  ipnUrl: process.env.VNP_IPN_URL,
};

// Validate config on startup
if (!vnpayConfig.tmnCode || !vnpayConfig.secureSecret || !vnpayConfig.returnUrl) {
  console.error("⚠️ VNPay config missing:", {
    tmnCode: !!vnpayConfig.tmnCode,
    secureSecret: !!vnpayConfig.secureSecret,
    returnUrl: !!vnpayConfig.returnUrl,
  });
  throw new Error("Missing VNPay configuration in .env");
}

// Create URL payment
async function createVNPayUrl(order, req) {
  const vnp = new VNPay(vnpayConfig);
  const now = new Date();

  const checkoutUrl = vnp.buildCheckoutUrl({
    vnp_Amount: Math.round(order.total * 100),
    vnp_Command: "pay",
    vnp_CreateDate: now.toISOString().replace(/[-:T.]/g, "").slice(0, 14),
    vnp_CurrCode: "VND",
    vnp_IpAddr: req.ip,
    vnp_Locale: "vn",
    vnp_OrderInfo: `Thanh toán ${order.orderCode}`,
    vnp_OrderType: "other",
    vnp_ReturnUrl: vnpayConfig.returnUrl,
    vnp_TxnRef: order._id.toString(),
    vnp_ExpireDate: new Date(now.getTime() + 15 * 60 * 1000)
      .toISOString()
      .replace(/[-:T.]/g, "")
      .slice(0, 14),
  });

  console.log("✅ VNPay URL created:", checkoutUrl);
  return checkoutUrl;
}

// ========= Controllers ========= //

async function vnpayPayment(req, res) {
  try {
    const { orderId } = req.body;
    const order = await Order.findById(orderId).populate("userId");

    if (!order || order.status !== "pending") {
      return res.status(400).json({ error: "Đơn hàng không hợp lệ hoặc đã thanh toán" });
    }

    order.paymentMethod = "vnpay";
    order.status = "processing";
    await order.save();

    const url = await createVNPayUrl(order, req);
    res.json({ vnpayUrl: url });

  } catch (err) {
    console.error("🔥 VNPay Payment Error: ", err);
    res.status(500).json({ error: err.message });
  }
}


async function vnpayReturn(req, res) {
  try {
    const vnp = new VNPay(vnpayConfig);
    const isValid = vnp.isVerifiedPayment(req.query);

    if (!isValid) return res.redirect(`${process.env.CLIENT_URL}/payment-failed`);

    const order = await Order.findById(req.query.vnp_TxnRef);
    if (!order) return res.redirect(`${process.env.CLIENT_URL}/payment-failed`);

    if (req.query.vnp_ResponseCode === "00") {
      order.status = "completed";
      await User.findByIdAndUpdate(order.userId, {
        $inc: { "loyalty.points": Math.floor(order.total / 10000) },
      });
      await order.save();

      return res.redirect(`${process.env.CLIENT_URL}/payment-success?order=${order.orderCode}`);
    }

    order.status = "cancelled";
    await order.save();
    return res.redirect(`${process.env.CLIENT_URL}/payment-failed`);

  } catch (err) {
    console.error("🔥 VNPay Return Error:", err);
    return res.redirect(`${process.env.CLIENT_URL}/payment-failed`);
  }
}

async function vnpayIPN(req, res) {
  try {
    const vnp = new VNPay(vnpayConfig);
    const isValid = vnp.isVerifiedPayment(req.query);

    if (!isValid) return res.json({ RspCode: "97", Message: "Checksum failed" });

    const order = await Order.findById(req.query.vnp_TxnRef);
    if (!order) return res.json({ RspCode: "01", Message: "Order not found" });

    if (req.query.vnp_ResponseCode === "00") {
      order.status = "completed";
    } else {
      order.status = "cancelled";
    }

    await order.save();
    return res.json({ RspCode: "00", Message: "Success" });

  } catch (err) {
    console.error("🔥 VNPay IPN Error:", err);
    return res.json({ RspCode: "99", Message: "Unknown error" });
  }
}

// Export chuẩn Node
module.exports = {
  createVNPayUrl,
  vnpayPayment,
  vnpayReturn,
  vnpayIPN,
};
