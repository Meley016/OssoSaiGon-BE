const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const Order = require("../models/Order");
const Product = require("../models/Product");
const { User } = require("../models/User");
const Promotion = require("../models/Promotion");
const Cart = require("../models/Cart");

// ✅ TỶ GIÁ VND → USD
const VND_TO_USD = 30000;

/* ============================
✅ FINALIZE ORDER SAU KHI THANH TOÁN
============================ */
async function finalizeOrder(order) {
  for (const item of order.items) {
    await Product.updateOne(
      { "variants.sku": item.sku },
      { $inc: { "variants.$.stockQuantity": -item.quantity } }
    );
  }

  if (order.promotionId) {
    await Promotion.findByIdAndUpdate(order.promotionId, { $inc: { usedCount: 1 } });
  }

  await Cart.findOneAndUpdate({ userId: order.userId }, { items: [] });

  const points = Math.floor(order.total / 10000);
  await User.findByIdAndUpdate(order.userId, { $inc: { "loyalty.points": points } });
}

/* ============================
✅ TẠO PAYMENT INTENT CHO ORDER
============================ */
exports.createPaymentIntent = async (req, res) => {
  try {
    const { orderId } = req.body;
    const order = await Order.findById(orderId);

    if (!order) return res.status(400).json({ error: "Order không tồn tại" });
    if (!order.isTemporary || order.status !== "pending") {
      return res.status(400).json({ error: "Order đã được xử lý hoặc không hợp lệ" });
    }

    const usdAmount = Math.round((order.total / VND_TO_USD) * 100);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: usdAmount,
      currency: "usd",
      metadata: { orderId: order._id.toString() },
    });

    res.json({ clientSecret: paymentIntent.client_secret, orderId: order._id });
  } catch (err) {
    console.error("❌ Stripe createPaymentIntent error:", err);
    res.status(500).json({ error: "Lỗi server khi tạo PaymentIntent" });
  }
};

/* ============================
✅ WEBHOOK STRIPE - LUỒNG ĐẦY ĐỦ
============================ */
exports.handleWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("❌ Webhook verify failed:", err.message);
    return res.status(400).send("Webhook signature invalid");
  }

  try {
    const paymentIntent = event.data.object;
    const orderId = paymentIntent.metadata?.orderId;
    const order = await Order.findById(orderId);

    if (!order) return res.json({ received: true });

    switch (event.type) {
      case "payment_intent.succeeded":
        if (order.status !== "pending") return res.json({ received: true });

        const usdAmount = Math.round((order.total / VND_TO_USD) * 100);
        if (paymentIntent.amount !== usdAmount) {
          order.status = "fraud";
          await order.save();
          return res.json({ received: true });
        }

        order.status = "completed";
        order.isTemporary = false;
        
        order.paymentIntentId = paymentIntent.id;
        await order.save();
        await finalizeOrder(order);
        break;

      case "payment_intent.payment_failed":
        order.status = "failed";
        order.isTemporary = false;
        await order.save();
        break;

      case "payment_intent.canceled":
        order.status = "cancelled";
        order.isTemporary = false;
        await order.save();
        break;

      default:
        console.log("Unhandled event type", event.type);
    }

    res.json({ received: true });
  } catch (err) {
    console.error("❌ Stripe webhook error:", err);
    res.status(500).json({ error: "Webhook xử lý lỗi server" });
  }
};

/* ============================
✅ PAYMENT METHODS ĐA NỀN TẢNG
============================ */

// Stripe PaymentIntent tự hỗ trợ card + Apple Pay + Google Pay thông qua frontend
// Backend chỉ cần create PaymentIntent 1 lần (createPaymentIntent)

exports.payWithCard = async (req, res) => {
  // Gọi createPaymentIntent trước
  res.json({ message: "Stripe card payment sẽ dùng clientSecret từ createPaymentIntent" });
};

exports.payWithApplePay = async (req, res) => {
  // Apple Pay sẽ dùng PaymentRequestButton frontend, backend vẫn dùng clientSecret
  res.json({ message: "Apple Pay sử dụng clientSecret từ createPaymentIntent" });
};

exports.payWithGooglePay = async (req, res) => {
  // Google Pay cũng tương tự
  res.json({ message: "Google Pay sử dụng clientSecret từ createPaymentIntent" });
};
