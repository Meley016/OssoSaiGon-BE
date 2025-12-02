const paypalClient = require('../config/paypal');
const checkoutNodeJssdk = require('@paypal/checkout-server-sdk');
const Order = require("../models/Order"); 

// ✅ TỶ GIÁ MẶC ĐỊNH: 30,000 VND = 1 USD
const VND_TO_USD_RATE = 30000;

exports.createPaypalPayment = async (req, res) => {
  try {
    const { orderId } = req.query;
    if (!orderId) return res.status(400).send("Thiếu orderId");

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).send("Không tìm thấy đơn hàng");

    const request = new checkoutNodeJssdk.orders.OrdersCreateRequest();
    request.prefer("return=representation");

    const usdAmount = (order.total / VND_TO_USD_RATE).toFixed(2);

    request.requestBody({
      intent: "CAPTURE",
      purchase_units: [{
        reference_id: order._id.toString(),
        amount: { currency_code: "USD", value: usdAmount },
      }],
      application_context: {
        return_url: `${process.env.SERVER_URL}/api/payment/paypal/success`,
        cancel_url: `${process.env.SERVER_URL}/api/payment/paypal/cancel`,
      },
    });

    const response = await paypalClient.execute(request);

    const approveUrl = response.result.links.find(l => l.rel === "approve")?.href;
    if (!approveUrl) return res.status(500).send("Không lấy được link PayPal");

    // ✅ Redirect trực tiếp sang PayPal
    return res.redirect(approveUrl);

  } catch (err) {
    console.error("createPaypalPayment error:", err);
    return res.status(500).send("Lỗi tạo PayPal");
  }
};


// ✅ CAPTURE TIỀN
exports.capturePaypal = async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.redirect(`${process.env.CLIENT_URL}/payment-failed`);
    }

    const request = new checkoutNodeJssdk.orders.OrdersCaptureRequest(token);
    request.requestBody({});

    const capture = await paypalClient.execute(request);

    const orderId = capture.result.purchase_units[0].reference_id;
    const order = await Order.findById(orderId);

    if (!order) {
      return res.redirect(`${process.env.CLIENT_URL}/payment-failed`);
    }

    // ✅ CHỐNG CAPTURE 2 LẦN
    if (order.status === "completed") {
      return res.redirect(
        `${process.env.CLIENT_URL}/payment-success/${order._id}`
      );
    }

    // ✅ CHỈ CẬP NHẬT TRẠNG THÁI
    order.status = "completed";
    order.isTemporary = false;

    await order.save();

    res.redirect(
      `${process.env.CLIENT_URL}/payment-success/${order._id}`
    );

  } catch (err) {
    console.error("capturePaypal error:", err);
    res.redirect(`${process.env.CLIENT_URL}/payment-failed`);
  }
};

