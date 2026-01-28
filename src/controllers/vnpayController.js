const crypto = require("crypto");
const Order = require("../models/Order");
const { VNPay } = require("vnpay");

/* ======================= CONFIG ======================= */
const vnpay = new VNPay({
  tmnCode: process.env.VNP_TMNCODE,
  secureSecret: process.env.VNP_HASHSECRET,
  vnpayHost: "https://sandbox.vnpayment.vn", // prod: https://pay.vnpayment.vn
  testMode: true, // false khi production
  hashAlgorithm: "SHA512",
  enableLog: true,
});

/* ======================= HELPERS ======================= */
const formatDateVN = (date) => {
  const vn = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  return vn
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 14);
};

const getClientIp = (req) =>
  req.headers["x-forwarded-for"]?.split(",")[0] ||
  req.socket?.remoteAddress ||
  "127.0.0.1";

/**
 * TxnRef chỉ dùng cho VNPay – KHÔNG chứa business data
 */
const generateTxnRef = () => `VNP_${Date.now()}`;

/* ======================= CREATE PAYMENT ======================= */
exports.vnpayPayment = async (req, res) => {
  try {
    const { orderId } = req.body;
    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.payment?.status === "paid") {
      return res.status(400).json({ message: "Order already paid" });
    }

    const txnRef = generateTxnRef();

    order.payment = {
      provider: "vnpay",
      txnRef,
      status: "pending",
    };
    await order.save();

    const now = new Date();

    const paymentUrl = vnpay.buildPaymentUrl({
      vnp_Amount: Math.round(order.total * 100),
      vnp_TxnRef: txnRef,
      vnp_OrderInfo: `ORDER_${order.orderCode}`,
      vnp_OrderType: "other",
      vnp_ReturnUrl: process.env.VNP_RETURN_URL,
      vnp_IpAddr: getClientIp(req),
      vnp_Locale: "vn",
      vnp_CreateDate: formatDateVN(now),
      vnp_ExpireDate: formatDateVN(new Date(now.getTime() + 15 * 60 * 1000)),
    });

    return res.json({ success: true, paymentUrl });
  } catch (err) {
    console.error("VNPay create error:", err);
    return res.status(500).json({ message: "VNPay error" });
  }
};

/* ======================= RETURN URL ======================= */
/**
 * Return URL chỉ để hiển thị kết quả cho user
 * KHÔNG update order (IPN mới là nguồn sự thật)
 */
exports.vnpayReturn = async (req, res) => {
  try {
    const verification = vnpay.verifyReturnUrl(req.query);

    if (!verification.isSuccess) {
      return res.redirect(`${process.env.CLIENT_URL}/payment-failed`);
    }

    const order = await Order.findOne({
      "payment.txnRef": verification.vnp_TxnRef,
    });

    if (!order) {
      return res.redirect(`${process.env.CLIENT_URL}/payment-failed`);
    }

    const amount = verification.vnp_Amount / 100;
    if (Number(order.total) !== amount) {
      return res.redirect(`${process.env.CLIENT_URL}/payment-failed`);
    }

    if (
      verification.vnp_ResponseCode === "00" &&
      verification.vnp_TransactionStatus === "00"
    ) {
      return res.redirect(
        `${process.env.CLIENT_URL}/payment-success?order=${order.orderCode}`
      );
    }

    return res.redirect(`${process.env.CLIENT_URL}/payment-failed`);
  } catch (err) {
    console.error("Return error:", err);
    return res.redirect(`${process.env.CLIENT_URL}/payment-failed`);
  }
};

/* ======================= IPN ======================= */
/**
 * IPN là NGUỒN SỰ THẬT
 * BẮT BUỘC trả đúng RspCode cho VNPay
 */
exports.vnpayIPN = async (req, res) => {
  try {
    const verification = vnpay.verifyIpnCall(req.query);

    if (!verification.isVerified) {
      return res.json({ RspCode: "97", Message: "Invalid Checksum" });
    }

    const order = await Order.findOne({
      "payment.txnRef": verification.vnp_TxnRef,
    });

    if (!order) {
      return res.json({ RspCode: "01", Message: "Order Not Found" });
    }

    const amount = verification.vnp_Amount / 100;
    if (Number(order.total) !== amount) {
      return res.json({ RspCode: "04", Message: "Invalid amount" });
    }

    if (order.payment.status === "paid") {
      return res.json({ RspCode: "02", Message: "Already Confirmed" });
    }

    if (
      verification.vnp_ResponseCode === "00" &&
      verification.vnp_TransactionStatus === "00"
    ) {
      order.payment.status = "paid";
      order.payment.transactionNo = verification.vnp_TransactionNo;
      order.payment.paidAt = new Date();
      await order.save();
    } else {
      order.payment.status = "failed";
      await order.save();
    }

    return res.json({ RspCode: "00", Message: "Confirm Success" });
  } catch (err) {
    console.error("IPN error:", err);
    return res.json({ RspCode: "99", Message: "System Error" });
  }
};
