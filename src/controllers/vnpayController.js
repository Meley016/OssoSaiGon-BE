// controllers/vnpayController.js
const crypto = require("crypto");
const querystring = require("qs");
const Order = require("../models/Order");
const { User } = require("../models/User");

const vnpayConfig = {
  tmnCode: process.env.VNP_TMNCODE,
  hashSecret: process.env.VNP_HASHSECRET,
  url: process.env.VNP_URL || "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html",
  returnUrl: process.env.VNP_RETURN_URL,
  ipnUrl: process.env.VNP_IPN_URL,
};

// Validate config early
if (!vnpayConfig.tmnCode || !vnpayConfig.hashSecret || !vnpayConfig.returnUrl) {
  console.error("⚠️ VNPay configuration missing. Check VNP_TMNCODE, VNP_HASHSECRET, VNP_RETURN_URL in .env");
  // don't throw here if you prefer server still runs for non-payment flows,
  // but it's useful to know in logs. You can optionally throw to prevent start.
}

/**
 * Helpers
 */
function formatDate(date) {
  const yyyy = date.getFullYear().toString();
  const MM = (date.getMonth() + 1).toString().padStart(2, "0");
  const dd = date.getDate().toString().padStart(2, "0");
  const hh = date.getHours().toString().padStart(2, "0");
  const mm = date.getMinutes().toString().padStart(2, "0");
  const ss = date.getSeconds().toString().padStart(2, "0");
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
  // try common headers then fallback to req.ip or connection
  const forwarded = (req.headers["x-forwarded-for"] || "").split(",").map(s => s.trim()).filter(Boolean);
  if (forwarded.length) return forwarded[0];
  if (req.ip) return req.ip;
  if (req.connection && req.connection.remoteAddress) return req.connection.remoteAddress;
  return "";
}

/**
 * Tạo URL thanh toán VNPay
 * order: mongoose order document (should contain .total and .orderCode)
 * req: express request (used for IP)
 */
async function createVNPayUrl(order, req) {
  if (!vnpayConfig.tmnCode || !vnpayConfig.hashSecret || !vnpayConfig.returnUrl) {
    throw new Error("VNPay not configured properly");
  }

  const date = new Date();
  const createDate = formatDate(date);
  const expireDate = formatDate(new Date(date.getTime() + 15 * 60 * 1000));

  const vnpParams = {
    vnp_Version: "2.1.0",
    vnp_Command: "pay",
    vnp_TmnCode: vnpayConfig.tmnCode,
    vnp_Locale: "vn",
    vnp_CurrCode: "VND",
    vnp_TxnRef: order._id.toString(),
    vnp_OrderInfo: `Thanh toan cho don hang ${order.orderCode}`,
    vnp_OrderType: "other",
    vnp_Amount: Math.round(Number(order.total || 0) * 100), // VNPay expects amount in cents (x100)
    vnp_ReturnUrl: vnpayConfig.returnUrl,
    vnp_IpAddr: getClientIp(req),
    vnp_CreateDate: createDate,
    vnp_ExpireDate: expireDate,
  };

  // sắp xếp params theo key rồi stringify (encode: false) để tạo chữ ký
  const sorted = sortObject(vnpParams);
  const signData = querystring.stringify(sorted, { encode: false });
  const hmac = crypto.createHmac("sha512", vnpayConfig.hashSecret);
  const signed = hmac.update(Buffer.from(signData, "utf-8")).digest("hex");
  sorted["vnp_SecureHash"] = signed;

  const vnpUrl = `${vnpayConfig.url}?${querystring.stringify(sorted, { encode: true })}`;
  console.log("✅ VNPay checkout URL:", vnpUrl);
  return vnpUrl;
}

/**
 * Endpoint: khởi tạo payment và trả về URL cho frontend (POST /api/payment/vnpay)
 * body: { orderId }
 */
exports.vnpayPayment = async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ success: false, msg: "Thiếu orderId" });

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, msg: "Không tìm thấy đơn hàng" });
    }

    // Optionally ensure order.status is correct before allowing payment
    // e.g. if already completed, return error.
    if (order.status === "completed") {
      return res.status(400).json({ success: false, msg: "Đơn hàng đã được thanh toán" });
    }

    const paymentUrl = await createVNPayUrl(order, req);

    // trả về link để FE redirect
    return res.json({ success: true, paymentUrl });
  } catch (err) {
    console.error("🔥 VNPay Payment Error:", err);
    return res.status(500).json({ success: false, msg: "Lỗi khởi tạo thanh toán VNPay", error: err.message });
  }
};

/**
 * Xử lý khi VNPay redirect về client (GET /api/payment/vnpay-return)
 * VNPay sẽ gửi query params, trong đó có vnp_SecureHash để verify.
 */
async function vnpayReturn(req, res) {
  try {
    const vnpParams = { ...req.query };
    const secureHash = vnpParams["vnp_SecureHash"];

    // remove secure hash fields before sign
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

    const txnRef = vnpParams["vnp_TxnRef"];
    const order = await Order.findById(txnRef);
    if (!order) {
      console.warn("⚠️ VNPay return: order not found", txnRef);
      return res.redirect(`${process.env.CLIENT_URL}/payment-failed`);
    }

    if (vnpParams["vnp_ResponseCode"] === "00") {
      // success
      order.status = "completed";
      await order.save();

      // add loyalty points (example)
      try {
        await User.findByIdAndUpdate(order.userId, {
          $inc: { "loyalty.points": Math.floor(order.total / 10000) },
        });
      } catch (e) {
        console.warn("Could not update loyalty points:", e.message);
      }

      return res.redirect(`${process.env.CLIENT_URL}/payment-success?order=${order.orderCode}`);
    }

    // not successful
    order.status = "cancelled";
    await order.save();
    return res.redirect(`${process.env.CLIENT_URL}/payment-failed`);
  } catch (err) {
    console.error("🔥 VNPay Return Error:", err);
    return res.redirect(`${process.env.CLIENT_URL}/payment-failed`);
  }
}

/**
 * Xử lý IPN (server -> server)
 * VNPay có thể gọi IPN để notify status (GET). Trả về JSON response with RspCode.
 */
async function vnpayIPN(req, res) {
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
      console.warn("⚠️ VNPay IPN checksum invalid");
      return res.json({ RspCode: "97", Message: "Checksum failed" });
    }

    const txnRef = vnpParams["vnp_TxnRef"];
    const order = await Order.findById(txnRef);
    if (!order) {
      console.warn("⚠️ VNPay IPN: order not found", txnRef);
      return res.json({ RspCode: "01", Message: "Order not found" });
    }

    if (vnpParams["vnp_ResponseCode"] === "00") {
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

module.exports = {
  createVNPayUrl,
  vnpayPayment: exports.vnpayPayment || (async () => {}), // ensure export exists for older usage
  vnpayReturn,
  vnpayIPN,
  // ALSO export function directly:
  // Note: createVNPayUrl already defined as function above
};
