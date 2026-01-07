const crypto = require("crypto");
const querystring = require("qs");
const Order = require("../models/Order");
const { User } = require("../models/User");
const Product = require("../models/Product");
const Promotion = require("../models/Promotion");
const Cart = require("../models/Cart");
const IPNLog = require('../models/IPNLog');
 
const { VNPay } = require('vnpay');

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

const vnpay = new VNPay({
  tmnCode: vnpayConfig.tmnCode,
  secureSecret: vnpayConfig.hashSecret,
  vnpayHost: 'https://sandbox.vnpayment.vn', // production: 'https://pay.vnpayment.vn'
  testMode: true,                    // true = sandbox, false = production
  hashAlgorithm: 'SHA512',   
  enableLog: true,                   // bật log để debug (có thể tắt ở production)
  // loggerFn: console.log,       // tùy chỉnh hàm log nếu cần
});

/* ======================= HELPERS ======================= */
const formatDateVN = (date) => {
  const vn = new Date(date.getTime() + 7 * 3600 * 1000);
  return vn.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
};

const generateTxnRef = (order) =>
  `${order.orderCode}_${crypto.randomBytes(4).toString("hex")}`;

const getClientIp = (req) => {
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    req.socket?.remoteAddress ||
    "127.0.0.1";
  return ip.includes("::ffff:") ? ip.replace("::ffff:", "") : ip;
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

  await Cart.findOneAndUpdate({ userId: order.userId }, { $set: { items: [] } });

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

  // Sử dụng buildPaymentUrl của thư viện - tự sort, hash, nối raw đúng chuẩn
  const paymentUrl = vnpay.buildPaymentUrl({
    vnp_Amount: Math.round(order.total * 100), // ×100
    vnp_TxnRef: txnRef,
    vnp_OrderInfo: `Thanh_toan_${order.orderCode}`,
    vnp_OrderType: "other",
    vnp_ReturnUrl: vnpayConfig.returnUrl,
    vnp_IpAddr: getClientIp(req),
    vnp_Locale: "vn",
    vnp_CreateDate: formatDateVN(now),
    vnp_ExpireDate: formatDateVN(new Date(now.getTime() + 15 * 60 * 1000)),
    // vnp_CurrCode: "VND",               // mặc định là VND, có thể bỏ
    // vnp_BankCode: "VNPAYQR",               // optional: redirect thẳng ngân hàng
  });

  console.log(">>> VNPay Payment URL (từ thư viện):", paymentUrl);

  return paymentUrl;
};

/* ======================= FE CALL ======================= */
exports.vnpayPayment = async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ success: false, msg: "Missing orderId" });

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ success: false, msg: "Order not found" });

    if (order.status === "paid") return res.status(400).json({ success: false, msg: "Order already paid" });

    const paymentUrl = await createVNPayUrl(order, req);
    res.json({ success: true, paymentUrl });
  } catch (err) {
    console.error("VNPay create error:", err);
    res.status(500).json({ success: false, msg: "VNPay error" });
  }
};

/* ======================= RETURN URL ======================= */
exports.vnpayReturn = async (req, res) => {
  try {
    const params = req.query;
    console.log(">>> VNPay Return Params:", params);

    const verification = vnpay.verifyReturnUrl(params);

    if (!verification.isSuccess) {
      console.error("Verify return failed:", verification.message);
      return res.redirect(`${process.env.CLIENT_URL}/payment-failed`);
    }

    // Chỉ khi chữ ký hợp lệ mới tìm order và kiểm tra amount
    const order = await Order.findOne({ vnpayTxnRef: verification.vnp_TxnRef });
    if (!order) {
      console.error("Order not found for TxnRef:", verification.vnp_TxnRef);
      return res.redirect(`${process.env.CLIENT_URL}/payment-failed`);
    }

    // Kiểm tra số tiền (vnp_Amount từ VNPAY là ×100)
    const receivedAmount = verification.vnp_Amount / 100;  // chia 100 để so với order.total
    console.log("Số tiền VNPAY trả về (sau chia 100):", receivedAmount);
    console.log("Số tiền order mong đợi:", order.total);

    if (receivedAmount !== Math.round(order.total)) {
      console.error("Amount mismatch! Received:", receivedAmount, "Expected:", order.total);
      return res.redirect(`${process.env.CLIENT_URL}/payment-failed`);
    }

    // Nếu success → redirect success (không update order ở đây, để IPN xử lý chính)
    // Nhưng nếu muốn an toàn hơn (IPN delay), có thể update ở đây với check duplicate
  return verification.vnp_ResponseCode === "00"
    ? res.redirect(`${process.env.CLIENT_URL}/payment-success?order=${order.orderCode}`)
    : res.redirect(`${process.env.CLIENT_URL}/payment-failed`);
  } catch (err) {
    console.error("VNPay return error:", err);
    res.redirect(`${process.env.CLIENT_URL}/payment-failed`);
  }
};

function isVnpaySuccess(params = {}) {
  return (
    params.vnp_ResponseCode === '00' &&
    params.vnp_TransactionStatus === '00'
  );
}
/* ======================= IPN ======================= */
exports.vnpayIPN = async (req, res) => {
  const params = req.query;
  const clientIP = getClientIp(req);
  let log;

  try {
    /* ================== 1. LOG RAW IPN ================== */
    log = await IPNLog.create({
      txnRef: params.vnp_TxnRef || 'unknown',
      vnpParams: params,
      clientIP,
      status: 'pending',
      vnpResponseCode: params.vnp_ResponseCode,
      vnpTransactionStatus: params.vnp_TransactionStatus,
    });

    /* ================== 2. VERIFY CHECKSUM ================== */
    const verify = vnpay.verifyIpnCall(params);
    if (!verify.isSuccess) {
      log.status = 'error';
      log.response = { RspCode: '97', Message: 'Invalid signature' };
      await log.save();
      return res.json(log.response);
    }

    /* ================== 3. VERIFY TMN ================== */
    if (verify.vnp_TmnCode !== process.env.VNP_TMNCODE) {
      log.status = 'error';
      log.response = { RspCode: '97', Message: 'Invalid TMN code' };
      await log.save();
      return res.json(log.response);
    }

    /* ================== 4. FIND ORDER ================== */
    const order = await Order.findOne({ vnpayTxnRef: verify.vnp_TxnRef });
    if (!order) {
      log.status = 'error';
      log.response = { RspCode: '01', Message: 'Order not found' };
      await log.save();
      return res.json(log.response);
    }

    /* ================== 5. DUPLICATE IPN ================== */
    if (order.status === 'paid') {
      log.status = 'duplicate';
      log.response = { RspCode: '00', Message: 'Already confirmed' };
      await log.save();
      return res.json(log.response);
    }

    /* ================== 6. CHECK AMOUNT (❗ KHÔNG CHIA 100) ================== */
    const vnpAmount = Number(verify.vnp_Amount);       // VNPay unit
    const orderAmount = Math.round(order.total * 100); // System → VNPay unit

    if (vnpAmount !== orderAmount) {
      log.status = 'error';
      log.response = { RspCode: '04', Message: 'Invalid amount' };
      await log.save();
      return res.json(log.response);
    }

    /* ================== 7. CHECK RESULT ================== */
    const isSuccess =
      verify.vnp_ResponseCode === '00' &&
      verify.vnp_TransactionStatus === '00';

    if (isSuccess) {
      // ===== SUCCESS =====
      order.status = 'paid';
      order.paidAt = new Date();
      order.vnpayTransactionNo = verify.vnp_TransactionNo;
      order.vnpayResponseCode = verify.vnp_ResponseCode;
      order.isTemporary = false;

      await order.save();
      await finalizeOrder(order);

      log.status = 'success';
    } else {
      // ===== FAIL / CANCEL =====
      order.status =
        verify.vnp_ResponseCode === '24' ? 'cancelled' : 'expired';
      order.vnpayResponseCode = verify.vnp_ResponseCode;

      await order.save();
      log.status = 'failed';
    }

    /* ================== 8. CONFIRM TO VNPAY ================== */
    log.response = { RspCode: '00', Message: 'Confirm Success' };
    await log.save();
    return res.json(log.response);

  } catch (err) {
    console.error('VNPay IPN ERROR:', err);

    if (log) {
      log.status = 'error';
      log.response = { RspCode: '99', Message: 'Unknown error' };
      await log.save();
    }

    return res.json({ RspCode: '99', Message: 'Unknown error' });
  }
};

module.exports = {
  createVNPayUrl,
  vnpayPayment: exports.vnpayPayment,
  vnpayReturn: exports.vnpayReturn,
  vnpayIPN: exports.vnpayIPN,
};