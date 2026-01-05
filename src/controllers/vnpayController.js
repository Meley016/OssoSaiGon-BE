const crypto = require("crypto");
const querystring = require("qs");
const Order = require("../models/Order");
const { User } = require("../models/User");
const Product = require("../models/Product");
const Promotion = require("../models/Promotion");
const Cart = require("../models/Cart");

/* ======================= CONFIG ======================= */
const vnpayConfig = {
  tmnCode: process.env.VNP_TMNCODE,
  hashSecret: process.env.VNP_HASHSECRET,
  url: process.env.VNP_URL || "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html",
  returnUrl: process.env.VNP_RETURN_URL,
};

if (!vnpayConfig.tmnCode || !vnpayConfig.hashSecret || !vnpayConfig.returnUrl) {
  console.error("⚠️ VNPay config missing");
}

/* ======================= HELPERS ======================= */
const formatDateVN = (date) => {
  const vn = new Date(date.getTime() + 7 * 3600 * 1000);
  return vn.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
};

const sortObject = (obj) =>
  Object.keys(obj)
    .sort()
    .reduce((acc, key) => ({ ...acc, [key]: obj[key] }), {});

const generateTxnRef = (order) =>
  `${order.orderCode}_${crypto.randomBytes(4).toString("hex")}`;

const getClientIp = (req) => {
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    req.socket?.remoteAddress ||
    "127.0.0.1";

  return ip.includes("::ffff:") ? ip.replace("::ffff:", "") : ip;
};

const buildSecureHash = (params) => {
  const signData = querystring.stringify(sortObject(params), {
    encode: false,
  });

  return crypto
    .createHmac("sha512", vnpayConfig.hashSecret)
    .update(signData, "utf-8")
    .digest("hex");
};



const verifySecureHash = (params, secureHash) => {
  const calculatedHash = buildSecureHash(params);
  return calculatedHash === secureHash;
};

/* ======================= FINALIZE ORDER ======================= */
const finalizeOrder = async (order) => {
  await Promise.all(
    order.items.map((item) =>
      Product.updateOne(
        { "variants.sku": item.sku },
        { $inc: { "variants.$.stockQuantity": -item.quantity } }
      )
    )
  );

  if (order.promotionId) {
    await Promotion.findByIdAndUpdate(order.promotionId, {
      $inc: { usedCount: 1 },
    });
  }

  await Cart.findOneAndUpdate(
    { userId: order.userId },
    { $set: { items: [] } }
  );

  const points = Math.floor(order.total / 10000);
  await User.findByIdAndUpdate(order.userId, {
    $inc: { "loyalty.points": points },
  });
};

/* ======================= CREATE VNPay URL ======================= */
const createVNPayUrl = async (order, req) => {
  const txnRef = generateTxnRef(order);

  order.vnpayTxnRef = txnRef;
  await order.save();

  const now = new Date();
  const vnpParams = {
    vnp_Version: "2.1.0",
    vnp_Command: "pay",
    vnp_TmnCode: vnpayConfig.tmnCode,
    vnp_Amount: Math.round(order.total * 100),
    vnp_CurrCode: "VND",
    vnp_TxnRef: txnRef,
    vnp_OrderInfo: `Thanh_toan_${order.orderCode}`,
    vnp_OrderType: "other",
    vnp_ReturnUrl: vnpayConfig.returnUrl,
    vnp_IpAddr: getClientIp(req),
    vnp_Locale: "vn",
    vnp_CreateDate: formatDateVN(now),
    vnp_ExpireDate: formatDateVN(new Date(now.getTime() + 15 * 60 * 1000)),
  };

  
    console.log("========= VNPAY FULL DEBUG =========");
    console.log("SIGN STRING:", signData);
    console.log("SECURE HASH:", secureHash);
    console.log("TMN CODE:", vnpayConfig.tmnCode);
    console.log("HASH SECRET LENGTH:", vnpayConfig.hashSecret.length);
    console.log("HASH SECRET RAW:", JSON.stringify(vnpayConfig.hashSecret));
    console.log("RETURN URL:", vnpayConfig.returnUrl);
    console.log("IP:", vnpParams.vnp_IpAddr);
    console.log("VNP URL:", vnpayConfig.url);
    console.log("===================================");

  vnpParams.vnp_SecureHash = buildSecureHash(vnpParams);
  return `${vnpayConfig.url}?${querystring.stringify(vnpParams, { encode: false })}`;
};

/* ======================= FE CALL ======================= */
exports.vnpayPayment = async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId)
      return res.status(400).json({ success: false, msg: "Missing orderId" });

    const order = await Order.findById(orderId);
    if (!order)
      return res.status(404).json({ success: false, msg: "Order not found" });

    if (order.status === "paid")
      return res.status(400).json({ success: false, msg: "Order already paid" });

    const paymentUrl = await createVNPayUrl(order, req);
    res.json({ success: true, paymentUrl });
  } catch (err) {
    console.error("VNPay create error:", err);
    res.status(500).json({ success: false, msg: "VNPay error" });
  }
};

/* ======================= RETURN URL (REDIRECT ONLY) ======================= */
exports.vnpayReturn = async (req, res) => {
  const params = { ...req.query };
  const secureHash = params.vnp_SecureHash;

  delete params.vnp_SecureHash;
  delete params.vnp_SecureHashType;

  if (!verifySecureHash(params, secureHash)) {
    return res.redirect(`${process.env.CLIENT_URL}/payment-failed`);
  }

  const order = await Order.findOne({ vnpayTxnRef: params.vnp_TxnRef });
  if (!order) {
    return res.redirect(`${process.env.CLIENT_URL}/payment-failed`);
  }

  if (params.vnp_ResponseCode === "00") {
    return res.redirect(
      `${process.env.CLIENT_URL}/payment-success?order=${order.orderCode}`
    );
  }

  return res.redirect(`${process.env.CLIENT_URL}/payment-failed`);
};


/* ======================= IPN (CORE LOGIC) ======================= */
exports.vnpayIPN = async (req, res) => {
  try {
    const params = { ...req.query };
    const secureHash = params.vnp_SecureHash;

    delete params.vnp_SecureHash;
    delete params.vnp_SecureHashType;

    if (!verifySecureHash(params, secureHash)) {
      return res.json({ RspCode: "97", Message: "Invalid signature" });
    }

    const order = await Order.findOne({ vnpayTxnRef: params.vnp_TxnRef });
    if (!order) {
      return res.json({ RspCode: "02", Message: "Order not found" });
    }

    if (order.status === "paid") {
      return res.json({ RspCode: "02", Message: "Already confirmed" });
    }

    if (params.vnp_ResponseCode === "00") {
      order.status = "paid";
      order.isTemporary = false;
      order.paidAt = new Date();
      order.vnpayTransactionNo = params.vnp_TransactionNo;

      await finalizeOrder(order);
      await order.save();
    } else {
      order.status = "cancelled";
      await order.save();
    }

    return res.json({ RspCode: "00", Message: "Confirm Success" });
  } catch (err) {
    console.error("VNPay IPN error:", err);
    return res.json({ RspCode: "99", Message: "Unknown error" });
  }
};

module.exports = {
  createVNPayUrl,
  vnpayPayment: exports.vnpayPayment,
  vnpayReturn: exports.vnpayReturn,
  vnpayIPN: exports.vnpayIPN,
};
