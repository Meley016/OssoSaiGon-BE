const crypto = require("crypto");
const qs = require("qs");

const Order = require("../models/Order");
const { User } = require("../models/User");
const Product = require("../models/Product");
const Promotion = require("../models/Promotion");
const Cart = require("../models/Cart");
const IPNLog = require("../models/IPNLog");

const { VNPay } = require("vnpay");

/* ======================= CONFIG ======================= */

const vnpayConfig = {
  tmnCode: process.env.VNP_TMNCODE,
  hashSecret: process.env.VNP_HASHSECRET,
  returnUrl: process.env.VNP_RETURN_URL,
  ipnUrl: process.env.VNP_IPN_URL,
};

if (
  !vnpayConfig.tmnCode ||
  !vnpayConfig.hashSecret ||
  !vnpayConfig.returnUrl
) {
  console.error("⚠️ Missing VNPay ENV");
}

const vnpay = new VNPay({
  tmnCode: vnpayConfig.tmnCode,
  secureSecret: vnpayConfig.hashSecret,
  vnpayHost: "https://sandbox.vnpayment.vn",
  testMode: true,
  hashAlgorithm: "SHA512",
  enableLog: true,
});

/* ======================= HELPERS ======================= */

const formatDateVN = (date) => {
  const vnDate = new Date(date.getTime() + 7 * 60 * 60 * 1000);

  return vnDate
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 14);
};

const generateTxnRef = (order) => {
  return `${order.orderCode}_${crypto.randomBytes(4).toString("hex")}`;
};

const getClientIp = (req) => {
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    req.socket?.remoteAddress ||
    req.ip ||
    "127.0.0.1";

  return ip.includes("::ffff:")
    ? ip.replace("::ffff:", "")
    : ip;
};

/* ======================= FINALIZE ORDER ======================= */

const finalizeOrder = async (order, vnpParams = {}) => {
  if (order.paymentStatus === "paid") {
    return;
  }

  order.paymentStatus = "paid";
  order.status = "processing";
  order.paymentMethod = "vnpay";

  order.vnpTransactionNo = vnpParams.vnp_TransactionNo || "";
  order.paidAt = new Date();

  await order.save();

  // trừ kho
  await Promise.all(
    order.items.map((item) =>
      Product.updateOne(
        { "variants.sku": item.sku },
        {
          $inc: {
            "variants.$.stockQuantity": -item.quantity,
          },
        }
      )
    )
  );

  // tăng usage promotion
  if (order.promotionId) {
    await Promotion.findByIdAndUpdate(order.promotionId, {
      $inc: { usedCount: 1 },
    });
  }

  // clear cart
  await Cart.findOneAndUpdate(
    { userId: order.userId },
    {
      $set: { items: [] },
    }
  );

  // loyalty points
  const points = Math.floor(order.total / 10000);

  await User.findByIdAndUpdate(order.userId, {
    $inc: {
      "loyalty.points": points,
    },
  });
};

/* ======================= CREATE PAYMENT URL ======================= */

const createVNPayUrl = async (order, req) => {
  const txnRef = generateTxnRef(order);

  order.vnpayTxnRef = txnRef;
  await order.save();

  const now = new Date();

  const paymentUrl = vnpay.buildPaymentUrl({
    vnp_Version: "2.1.0",
    vnp_Command: "pay",
    vnp_TmnCode: vnpayConfig.tmnCode,

    vnp_Amount: Math.round(order.total * 100),

    vnp_CurrCode: "VND",
    vnp_TxnRef: txnRef,

    vnp_OrderInfo: `Thanh_toan_${order.orderCode}`,
    vnp_OrderType: "other",

    vnp_Locale: "vn",

    vnp_ReturnUrl: vnpayConfig.returnUrl,

    vnp_IpAddr: getClientIp(req),

    vnp_CreateDate: formatDateVN(now),

    vnp_ExpireDate: formatDateVN(
      new Date(now.getTime() + 15 * 60 * 1000)
    ),
  });

  console.log("=================================");
  console.log("VNPay URL:");
  console.log(paymentUrl);
  console.log("=================================");

  return paymentUrl;
};

/* ======================= FE CALL ======================= */

exports.vnpayPayment = async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        msg: "Missing orderId",
      });
    }

    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        msg: "Order not found",
      });
    }

    if (order.paymentStatus === "paid") {
      return res.status(400).json({
        success: false,
        msg: "Order already paid",
      });
    }

    const paymentUrl = await createVNPayUrl(order, req);

    return res.json({
      success: true,
      paymentUrl,
    });
  } catch (err) {
    console.error("VNPay create payment error:", err);

    return res.status(500).json({
      success: false,
      msg: "VNPay error",
    });
  }
};

/* ======================= RETURN URL ======================= */

exports.vnpayReturn = async (req, res) => {
  try {
    const params = req.query;

    console.log("=================================");
    console.log("VNPay Return Params:");
    console.log(params);
    console.log("=================================");

    const verification = vnpay.verifyReturnUrl(params);

    console.log("VNPay Verification:");
    console.log(verification);

    if (!verification.isSuccess) {
      console.error("VNPay verify failed");

      return res.redirect(
        `${process.env.CLIENT_URL}/payment-failed?message=verify_failed`
      );
    }

    const order = await Order.findOne({
      vnpayTxnRef: verification.vnp_TxnRef,
    });

    if (!order) {
      console.error(
        "Order not found:",
        verification.vnp_TxnRef
      );

      return res.redirect(
        `${process.env.CLIENT_URL}/payment-failed?message=order_not_found`
      );
    }

    const receivedAmount =
      Number(verification.vnp_Amount) / 100;

    const expectedAmount = Math.round(order.total);

    console.log("Received:", receivedAmount);
    console.log("Expected:", expectedAmount);

    if (receivedAmount !== expectedAmount) {
      console.error("Amount mismatch");

      return res.redirect(
        `${process.env.CLIENT_URL}/payment-failed?message=amount_invalid`
      );
    }

    const isSuccess =
      verification.vnp_ResponseCode === "00" &&
      verification.vnp_TransactionStatus === "00";

    if (isSuccess) {
      // fallback nếu IPN chưa callback
      if (order.paymentStatus !== "paid") {
        await finalizeOrder(order, verification);
      }

      return res.redirect(
        `${process.env.CLIENT_URL}/payment-success/${order._id}`
      );
    }

    order.paymentStatus = "failed";
    await order.save();

    return res.redirect(
      `${process.env.CLIENT_URL}/payment-failed?message=payment_failed`
    );
  } catch (err) {
    console.error("VNPay return error:", err);

    return res.redirect(
      `${process.env.CLIENT_URL}/payment-failed?message=server_error`
    );
  }
};

/* ======================= IPN ======================= */

exports.vnpayIPN = async (req, res) => {
  try {
    const params = req.query;

    console.log("=================================");
    console.log("VNPay IPN:");
    console.log(params);
    console.log("=================================");

    await IPNLog.create({
      payload: params,
      createdAt: new Date(),
    });

    const verification = vnpay.verifyIpnCall(params);

    console.log("VNPay IPN Verify:");
    console.log(verification);

    if (!verification.isSuccess) {
      return res.json({
        RspCode: "97",
        Message: "Invalid checksum",
      });
    }

    const order = await Order.findOne({
      vnpayTxnRef: verification.vnp_TxnRef,
    });

    if (!order) {
      return res.json({
        RspCode: "01",
        Message: "Order not found",
      });
    }

    const receivedAmount =
      Number(verification.vnp_Amount) / 100;

    const expectedAmount = Math.round(order.total);

    if (receivedAmount !== expectedAmount) {
      return res.json({
        RspCode: "04",
        Message: "Invalid amount",
      });
    }

    if (order.paymentStatus === "paid") {
      return res.json({
        RspCode: "02",
        Message: "Order already confirmed",
      });
    }

    const isSuccess =
      verification.vnp_ResponseCode === "00" &&
      verification.vnp_TransactionStatus === "00";

    if (isSuccess) {
      await finalizeOrder(order, verification);
    } else {
      order.paymentStatus = "failed";
      await order.save();
    }

    return res.json({
      RspCode: "00",
      Message: "Confirm Success",
    });
  } catch (err) {
    console.error("VNPay IPN Error:", err);

    return res.json({
      RspCode: "99",
      Message: "Unknown error",
    });
  }
};

/* ======================= EXPORT ======================= */

module.exports = {
  createVNPayUrl,
  vnpayPayment: exports.vnpayPayment,
  vnpayReturn: exports.vnpayReturn,
  vnpayIPN: exports.vnpayIPN,
};