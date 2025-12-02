const crypto = require("crypto");
const querystring = require("qs");
const Order = require("../models/Order");
const { User } = require("../models/User");
const Product = require("../models/Product");
const Promotion = require("../models/Promotion");
const Cart = require("../models/Cart");

// ======================= CONFIG =======================
const vnpayConfig = {
  tmnCode: process.env.VNP_TMNCODE,
  hashSecret: process.env.VNP_HASHSECRET,
  url: process.env.VNP_URL || "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html",
  returnUrl: process.env.VNP_RETURN_URL,
  ipnUrl: process.env.VNP_IPN_URL,
};

function generateTxnRef(order) {
  const random = crypto.randomBytes(4).toString('hex'); // 8 hex chars
  return `${order.orderCode}_${random}`; // e.g. ORD000123_ab12cd34
}
// Validate config
if (!vnpayConfig.tmnCode || !vnpayConfig.hashSecret || !vnpayConfig.returnUrl) {
  console.error("⚠️ VNPay config missing in .env");
}
// ======================= HELPERS =======================
function formatDateVN(date) {
  // Chuyển về UTC+7
  const vnDate = new Date(date.getTime() + 7 * 60 * 60 * 1000);

  const yyyy = vnDate.getUTCFullYear().toString();
  const MM = (vnDate.getUTCMonth() + 1).toString().padStart(2, "0");
  const dd = vnDate.getUTCDate().toString().padStart(2, "0");
  const hh = vnDate.getUTCHours().toString().padStart(2, "0");
  const mm = vnDate.getUTCMinutes().toString().padStart(2, "0");
  const ss = vnDate.getUTCSeconds().toString().padStart(2, "0");

  return `${yyyy}${MM}${dd}${hh}${mm}${ss}`;
}

function sortObject(obj) {
  return Object.keys(obj)
    .sort()
    .reduce((acc, key) => {
      acc[key] = obj[key];
      return acc;
    }, {});
}

function getClientIp(req) {
  const forwarded = (req.headers["x-forwarded-for"] || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  if (forwarded.length) return forwarded[0];
  if (req.ip) return req.ip;
  if (req.connection?.remoteAddress) return req.connection.remoteAddress;
  return "";
}

// ======================= FINALIZE ORDER (CORE) =======================
const finalizeOrder = async (order) => {
  // ✅ Trừ stock
  for (const item of order.items) {
    await Product.updateOne(
      { "variants.sku": item.sku },
      { $inc: { "variants.$.stockQuantity": -item.quantity } }
    );
  }

  // ✅ Tăng usedCount promotion
  if (order.promotionId) {
    await Promotion.findByIdAndUpdate(order.promotionId, {
      $inc: { usedCount: 1 },
    });
  }

  // ✅ Xóa giỏ hàng
  await Cart.findOneAndUpdate(
    { userId: order.userId },
    { items: [] }
  );

  // ✅ Cộng điểm
  const points = Math.floor(order.total / 10000);
  await User.findByIdAndUpdate(order.userId, {
    $inc: { "loyalty.points": points },
  });
};

// ======================= CREATE VNPay URL =======================
async function createVNPayUrl(order, req) {
  if (!vnpayConfig.tmnCode || !vnpayConfig.hashSecret || !vnpayConfig.returnUrl) {
    throw new Error("VNPay not configured properly");
  }
  const txnRef = generateTxnRef(order);

  const date = new Date();
  const createDate = formatDateVN(date);
  const expireDate = formatDateVN(new Date(date.getTime() + 15 * 60 * 1000));

  const vnpParams = {
    vnp_Version: "2.1.0",
    vnp_Command: "pay",
    vnp_TmnCode: vnpayConfig.tmnCode,
    vnp_Locale: "vn",
    vnp_CurrCode: "VND",
    vnp_TxnRef: txnRef,
    vnp_OrderInfo: `Thanh toan don hang ${order.orderCode}`,
    vnp_OrderType: "other",
    vnp_Amount: Math.round(order.total * 100), // ✅ VNPay yêu cầu x100
    vnp_ReturnUrl: vnpayConfig.returnUrl,
    vnp_IpAddr: getClientIp(req),
    vnp_CreateDate: createDate,
    vnp_ExpireDate: expireDate,
  };

  const sorted = sortObject(vnpParams);
  const signData = querystring.stringify(sorted, { encode: false });

  const hmac = crypto.createHmac("sha512", vnpayConfig.hashSecret);
  const signed = hmac.update(Buffer.from(signData, "utf-8")).digest("hex");

  sorted["vnp_SecureHash"] = signed;

  const vnpUrl = `${vnpayConfig.url}?${querystring.stringify(sorted, {
    encode: true,
  })}`;

  console.log("✅ VNPay URL:", vnpUrl);
  return vnpUrl;
}

// ======================= CREATE PAYMENT (FE CALL) =======================
exports.vnpayPayment = async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId)
      return res.status(400).json({ success: false, msg: "Thiếu orderId" });

    const order = await Order.findById(orderId);
    if (!order)
      return res.status(404).json({ success: false, msg: "Không tìm thấy đơn" });

    if (order.status === "completed" || order.status === "paid") {
      return res
        .status(400)
        .json({ success: false, msg: "Đơn đã thanh toán" });
    }

    const paymentUrl = await createVNPayUrl(order, req);
    return res.json({ success: true, paymentUrl });
  } catch (err) {
    console.error("🔥 VNPay Payment Error:", err);
    return res.status(500).json({
      success: false,
      msg: "Lỗi khởi tạo thanh toán VNPay",
      error: err.message,
    });
  }
};

// ======================= RETURN URL (CLIENT REDIRECT ONLY) =======================
exports.vnpayReturn = async (req, res) => {
  try {
    const vnpParams = { ...req.query };
    const secureHash = vnpParams["vnp_SecureHash"];

    delete vnpParams["vnp_SecureHash"];
    delete vnpParams["vnp_SecureHashType"];

    const sorted = sortObject(vnpParams);
    const signData = querystring.stringify(sorted, { encode: false });

    const hmac = crypto.createHmac("sha512", vnpayConfig.hashSecret);
    const signed = hmac.update(Buffer.from(signData, "utf-8")).digest("hex");

    if (secureHash !== signed) {
      console.warn("⚠️ VNPay checksum invalid (return)");
      return res.redirect(`${process.env.CLIENT_URL}/payment-failed`);
    }

    const orderId = vnpParams["vnp_TxnRef"];
    const order = await Order.findById(orderId);

    if (!order) {
      return res.redirect(`${process.env.CLIENT_URL}/payment-failed`);
    }

    // ✅ RETURN CHỈ REDIRECT – KHÔNG UPDATE DB
    if (vnpParams["vnp_ResponseCode"] === "00") {
      return res.redirect(
        `${process.env.CLIENT_URL}/payment-success?order=${order.orderCode}`
      );
    }

    return res.redirect(`${process.env.CLIENT_URL}/payment-failed`);
  } catch (err) {
    console.error("🔥 VNPay Return Error:", err);
    return res.redirect(`${process.env.CLIENT_URL}/payment-failed`);
  }
};

// ======================= IPN (SERVER → SERVER – CORE LOGIC) =======================
exports.vnpayIPN = async (req, res) => {
  try {
    let vnpParams = req.query;
    let secureHash = vnpParams["vnp_SecureHash"];

    delete vnpParams["vnp_SecureHash"];
    delete vnpParams["vnp_SecureHashType"];

    const sorted = sortObject(vnpParams);
    const signData = querystring.stringify(sorted, { encode: false });

    const hmac = crypto.createHmac("sha512", vnpayConfig.hashSecret);
    const signed = hmac.update(Buffer.from(signData, "utf-8")).digest("hex");

    if (secureHash !== signed) {
      return res.json({ RspCode: "97", Message: "Invalid signature" });
    }

    const orderId = vnpParams["vnp_TxnRef"];
    const order = await Order.findById(orderId);

    if (!order || !order.isTemporary) {
      return res.json({ RspCode: "02", Message: "Order not found" });
    }

    if (vnpParams["vnp_ResponseCode"] === "00") {
      order.status = "paid";
      order.isTemporary = false;
      order.paidAt = new Date();
      order.vnpayTransactionNo = vnpParams["vnp_TransactionNo"];
      order.vnpayResponseCode = vnpParams["vnp_ResponseCode"];

      await finalizeOrder(order); // TRỪ KHO + CỘNG ĐIỂM DUY NHẤT Ở ĐÂY
      await order.save();
    } else {
      order.status = "cancelled";
      await order.save();
    }

    return res.json({ RspCode: "00", Message: "Confirm Success" });
  } catch (err) {
    console.error("VNPay IPN Error:", err);
    return res.json({ RspCode: "99", Message: "Unknown error" });
  }
};

// ======================= EXPORT =======================
module.exports = {
  createVNPayUrl,
  vnpayPayment: exports.vnpayPayment,
  vnpayReturn: exports.vnpayReturn,
  vnpayIPN: exports.vnpayIPN,
};
