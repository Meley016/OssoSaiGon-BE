const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const Order = require("../models/Order");
const Product = require("../models/Product");
const { User } = require("../models/User");
const Promotion = require("../models/Promotion");
const Cart = require("../models/Cart");

// ✅ TỶ GIÁ
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
    await Promotion.findByIdAndUpdate(order.promotionId, {
      $inc: { usedCount: 1 },
    });
  }

  await Cart.findOneAndUpdate(
    { userId: order.userId },
    { items: [] }
  );

  const points = Math.floor(order.total / 10000);
  await User.findByIdAndUpdate(order.userId, {
    $inc: { "loyalty.points": points },
  });
}

/* ============================
✅ TẠO PAYMENT INTENT
============================ */
exports.createPaymentIntent = async (req, res) => {
  try {
    const { userId, items, shippingAddress, promotionId } = req.body;

    if (!userId || !items?.length) {
      return res.status(400).json({ error: "Thiếu thông tin thanh toán" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(400).json({ error: "User không tồn tại" });

    let subtotal = 0;
    const orderItems = [];

    for (const it of items) {
      const product = await Product.findById(it.productId);
      if (!product) return res.status(400).json({ error: "Sản phẩm không tồn tại" });

      const variant = product.variants.find(v => v.sku === it.sku);
      if (!variant) return res.status(400).json({ error: "SKU không tồn tại" });

      if (variant.stockQuantity < it.quantity)
        return res.status(400).json({ error: "Không đủ hàng" });

      const price = it.price || variant.price;
      subtotal += price * it.quantity;

      orderItems.push({
        productId: product._id,
        sku: variant.sku,
        quantity: it.quantity,
        price,
        variantInfo: {
          color: variant.color,
          size: variant.size,
          coverImage: variant.coverImage,
        },
      });
    }

    // ✅ Promotion
    let discount = 0;
    if (promotionId) {
      const promo = await Promotion.findById(promotionId);
      if (promo?.isActive) {
        if (promo.type === "percentage") {
          discount = Math.min(subtotal * (promo.value / 100), promo.maxDiscount || Infinity);
        } else if (promo.type === "fixed") {
          discount = Math.min(promo.value, subtotal);
        }
      }
    }

    const total = subtotal - discount;

    // ✅ TẠO ORDER TẠM
    const order = await Order.create({
      userId,
      items: orderItems,
      subtotal,
      discount,
      total,
      promotionId: promotionId || null,
      shippingAddress,
      paymentMethod: "stripe",
      status: "pending",
      isTemporary: true,
    });

    // ✅ ĐỔI VND → USD (đơn vị CENT)
    const usdAmount = Math.round((total / VND_TO_USD) * 100);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: usdAmount,
      currency: "usd",
      metadata: { orderId: order._id.toString() },
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      orderId: order._id,
    });

  } catch (err) {
    console.error("❌ Stripe Payment Error:", err);
    res.status(500).json({ error: "Lỗi server khi tạo thanh toán" });
  }
};

/* ============================
✅ WEBHOOK STRIPE - ĐẦY ĐỦ LUỒNG
============================ */
exports.handleWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("❌ Webhook verify failed:", err.message);
    return res.status(400).send("Webhook signature invalid");
  }

  console.log("✅ STRIPE EVENT:", event.type);

  try {
    /* ======================
    ✅ THANH TOÁN THÀNH CÔNG
    ====================== */
    if (event.type === "payment_intent.succeeded") {
      const paymentIntent = event.data.object;
      const orderId = paymentIntent.metadata.orderId;

      const order = await Order.findById(orderId);

      if (!order || order.status !== "pending") {
        console.warn("⚠️ Order không hợp lệ hoặc đã xử lý:", orderId);
        return res.json({ received: true });
      }

      // ✅ ĐỐI SOÁT TIỀN (CHỐNG GIAN LẬN)
      const usdAmount = Math.round((order.total / VND_TO_USD) * 100);
      if (paymentIntent.amount !== usdAmount) {
        console.error("❌ Sai số tiền thanh toán:", orderId);
        order.status = "fraud";
        await order.save();
        return res.json({ received: true });
      }

      order.status = "completed";
      order.isTemporary = false;
      order.paymentIntentId = paymentIntent.id;

      await order.save();
      await finalizeOrder(order);

      console.log("✅ ORDER COMPLETED:", orderId);
    }

    /* ======================
    ❌ THANH TOÁN THẤT BẠI
    ====================== */
    if (event.type === "payment_intent.payment_failed") {
      const paymentIntent = event.data.object;
      const orderId = paymentIntent.metadata.orderId;

      await Order.findByIdAndUpdate(orderId, {
        status: "failed",
        isTemporary: false,
      });

      console.warn("❌ PAYMENT FAILED:", orderId);
    }

    /* ======================
    🔴 USER HỦY THANH TOÁN
    ====================== */
    if (event.type === "payment_intent.canceled") {
      const paymentIntent = event.data.object;
      const orderId = paymentIntent.metadata.orderId;

      await Order.findByIdAndUpdate(orderId, {
        status: "cancelled",
        isTemporary: false,
      });

      console.warn("🔴 PAYMENT CANCELED:", orderId);
    }

    res.json({ received: true });

  } catch (err) {
    console.error("❌ STRIPE WEBHOOK SERVER ERROR:", err);
    res.status(500).json({ error: "Webhook xử lý lỗi server" });
  }
};
