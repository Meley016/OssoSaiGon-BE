const mongoose = require("mongoose");
const Order = require("../models/Order");
const Product = require("../models/Product");
const { User } = require("../models/User");
const Promotion = require("../models/Promotion");
const { createVNPayUrl } = require("./vnpayController");
const Cart = require("../models/Cart");

async function releaseStock(order) {
  for (const it of order.items) {
    try {
      await Product.updateOne(
        { "variants.sku": it.sku },
        { $inc: { "variants.$.stockQuantity": Number(it.quantity) || 0 } }
      );
    } catch (err) {
      console.warn("releaseStock error for SKU", it.sku, err.message);
    }
  }
}
// Hàm finalize – chỉ gọi khi chắc chắn thanh toán thành công
const finalizeOrder = async (order) => {
  // Trừ stock
  for (const item of order.items) {
    await Product.updateOne(
      { "variants.sku": item.sku },
      { $inc: { "variants.$.stockQuantity": -item.quantity } }
    );
  }

  // Tăng usedCount promotion
  if (order.promotionId) {
    await Promotion.findByIdAndUpdate(order.promotionId, { $inc: { usedCount: 1 } });
  }

  // Xóa giỏ hàng
  await Cart.findOneAndUpdate({ userId: order.userId }, { items: [] });

  // Tích điểm
  const points = Math.floor(order.total / 10000);
  await User.findByIdAndUpdate(order.userId, { $inc: { "loyalty.points": points } });
};

// API DUY NHẤT DÙNG CHO CHECKOUT
exports.preCreateOrder = async (req, res) => {
  const session = await Order.startSession();
  session.startTransaction();

  try {
    const { paymentMethod, shippingAddress, items, promotionId } = req.body;
    const userId = req.user._id;

    // === VALIDATE GIỮ NGUYÊN 100% TỪ CODE CŨ CỦA BẠN ===
    if (!userId || !paymentMethod || !shippingAddress || !items?.length) {
      return res.status(400).json({ error: "Thiếu thông tin bắt buộc" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(400).json({ error: "User không tồn tại" });

    let subtotal = 0;
    const orderItems = [];

    for (const it of items) {
      const product = await Product.findById(it.productId);
      if (!product) return res.status(400).json({ error: `Sản phẩm ${it.productId} không tồn tại` });

      const variant = product.variants.find(v => v.sku === it.sku);
      if (!variant) return res.status(400).json({ error: `SKU ${it.sku} không tồn tại` });
      if (variant.stockQuantity < it.quantity) return res.status(400).json({ error: `Không đủ hàng SKU ${it.sku}` });

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
          images: variant.images || [],
        },
      });
    }

    // Promotion
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

    // Tạo đơn tạm
    const order = await Order.create([{
      userId,
      paymentMethod,
      shippingAddress,
      items: orderItems,
      subtotal,
      discount,
      total,
      promotionId: promotionId || null,
      status: "pending",
      isTemporary: true,
    }], { session });

    const createdOrder = order[0];

    // COD hoặc Bank → finalize ngay
    if (paymentMethod !== "vnpay") {
      createdOrder.status = "preparing";
      createdOrder.isTemporary = false;
      await finalizeOrder(createdOrder);
      await createdOrder.save({ session });
      await session.commitTransaction();

      return res.json({
        success: true,
        order: createdOrder,
        redirectUrl: `/payment-success/${createdOrder._id}`
      });
    }

    // VNPay → chỉ trả URL
    await session.commitTransaction();
    const vnpayUrl = await createVNPayUrl(createdOrder, req);

    res.json({
      success: true,
      order: createdOrder,
      vnpayUrl,
      redirectUrl: "/payment-processing"
    });

  } catch (err) {
    await session.abortTransaction();
    console.error("preCreateOrder error:", err);
    res.status(500).json({ error: err.message || "Lỗi tạo đơn" });
  } finally {
    session.endSession();
  }
};

exports.createOrder = async (req, res) => {
  try {
    console.log("Received createOrder payload:", req.body);

    const { userId, promotionId, paymentMethod, shippingAddress, items } = req.body;

    // Validation cơ bản
    if (!userId || !paymentMethod || !shippingAddress || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Thiếu các trường bắt buộc (userId, paymentMethod, shippingAddress, items)" });
    }

    if (!["cash", "bank_transfer", "credit_card", "vnpay"].includes(paymentMethod)) {
      return res.status(400).json({ error: "Phương thức thanh toán không hợp lệ" });
    }

    const user = await User.findById(userId).select("-password");
    if (!user) return res.status(400).json({ error: `Khách hàng với ID ${userId} không tồn tại` });

    // Validate items
    for (const it of items) {
      if (!it.productId || !it.sku) {
        return res.status(400).json({ error: "Mỗi item phải có productId và sku" });
      }
      if (!it.quantity || isNaN(it.quantity) || Number(it.quantity) < 1) {
        return res.status(400).json({ error: "Số lượng item không hợp lệ" });
      }
    }

    // Load products và validate SKU
    const productIds = [...new Set(items.map(i => i.productId))];
    const products = await Product.find({ _id: { $in: productIds } }).lean();

    if (products.length !== productIds.length) {
      const missing = productIds.filter(id => !products.some(p => p._id.toString() === id));
      return res.status(400).json({ error: `Sản phẩm với ID ${missing.join(", ")} không tồn tại` });
    }

    // Validate SKU & stock & build order items
    let subtotal = 0;
    const orderItems = [];

    for (const it of items) {
      const product = products.find(p => p._id.toString() === it.productId);
      if (!product) return res.status(400).json({ error: `Sản phẩm ${it.productId} không tồn tại` });

      const variant = (product.variants || []).find(v => v.sku === it.sku);
      if (!variant) {
        return res.status(400).json({ error: `SKU ${it.sku} không tồn tại trong sản phẩm ${product.name}` });
      }

      const qty = Number(it.quantity);
      if (variant.stockQuantity < qty) {
        return res.status(400).json({ error: `SKU ${it.sku}: Không đủ tồn kho (cần ${qty}, còn ${variant.stockQuantity})` });
      }

      const price = Number(it.price || variant.price || 0);
      if (isNaN(price) || price < 0) {
        return res.status(400).json({ error: `Giá SKU ${it.sku} không hợp lệ` });
      }

      subtotal += price * qty;

      orderItems.push({
        productId: product._id,
        sku: variant.sku,
        quantity: qty,
        price,
        variantInfo: {
          color: variant.color?._id || variant.color,
          size: variant.size?._id || variant.size,
          coverImage: variant.coverImage,
          images: variant.images || [],
        },
      });
    }

    if (isNaN(subtotal) || subtotal <= 0) {
      return res.status(400).json({ error: "Tổng tiền tạm tính không hợp lệ" });
    }

    // Promotion validation
    let promotion = null;
    let discount = 0;
    if (promotionId) {
      promotion = await Promotion.findById(promotionId).lean();
      if (!promotion || !promotion.isActive) {
        return res.status(400).json({ error: "Mã khuyến mãi không hợp lệ hoặc đã hết hiệu lực" });
      }
      if (promotion.type === "percentage") {
        discount = Math.min(subtotal * (promotion.value / 100), promotion.maxDiscount || Infinity);
      } else if (promotion.type === "fixed") {
        discount = Math.min(promotion.value, subtotal);
      } else if (promotion.type === "free_shipping") {
        discount = 0;
      }
    }

    const total = subtotal - (discount || 0);
    if (isNaN(total) || total < 0) {
      return res.status(400).json({ error: "Tổng tiền cuối cùng không hợp lệ" });
    }

    // Generate order code
    const lastOrder = await Order.findOne().sort({ createdAt: -1 }).lean();
    const orderCode = lastOrder
      ? `ORD${(parseInt(lastOrder.orderCode.slice(3)) + 1).toString().padStart(6, "0")}`
      : "ORD000001";

    // Create order
    const order = await Order.create({
      orderCode,
      userId,
      promotionId: promotionId || undefined,
      paymentMethod,
      shippingAddress,
      items: orderItems,
      subtotal,
      discount,
      total,
      status: paymentMethod === "vnpay" ? "processing" : "pending",
      createdAt: new Date(),
    });

    // Giảm stock
    for (const it of orderItems) {
      await Product.updateOne(
        { "variants.sku": it.sku },
        { $inc: { "variants.$.stockQuantity": -it.quantity } }
      );
    }

    // Increment promotion usedCount
    if (promotionId) {
      await Promotion.findByIdAndUpdate(promotionId, { $inc: { usedCount: 1 } });
    }

    // Populate dữ liệu trả về
    const populatedOrder = await Order.findById(order._id)
      .populate("userId", "name email")
      .populate("promotionId", "code name")
      .populate("items.variantInfo.color", "name")
      .populate("items.variantInfo.size", "name")
      .lean();

    // Nếu là VNPay, gọi endpoint vnpayPayment
    if (paymentMethod === "vnpay") {
      try {
        const vnpayUrl = await createVNPayUrl(order, req);
        return res.status(201).json({ order: populatedOrder, vnpayUrl });
      } catch (err) {
        console.error("VNPay URL creation failed:", err);
        await releaseStock(order); // Hoàn stock nếu lỗi
        await order.deleteOne(); // Xóa đơn hàng
        return res.status(500).json({ error: "Lỗi tạo đơn hàng", details: err.message });
      }
    }

    return res.status(201).json(populatedOrder);
  } catch (err) {
    console.error("Lỗi tạo đơn hàng:", err);
    return res.status(500).json({ error: "Lỗi tạo đơn hàng", details: err.message });
  }
};

exports.updateOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, paymentMethod, shippingAddress, items, status, promotionId } = req.body;

    console.log("Received payload:", req.body); // Debug payload

    // Tìm đơn hàng
    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ error: "Không tìm thấy đơn hàng" });
    }

    // Cập nhật userId nếu có
    if (userId) {
      const user = await User.findById(userId);
      if (!user) {
        return res.status(400).json({ error: "Khách hàng không tồn tại" });
      }
      order.userId = userId;
    }

    // Cập nhật paymentMethod nếu có
    if (paymentMethod) {
      if (!["cash", "bank_transfer", "credit_card", "vnpay"].includes(paymentMethod)) {
        return res.status(400).json({ error: "Phương thức thanh toán không hợp lệ" });
      }
      order.paymentMethod = paymentMethod;
    }

    // Cập nhật shippingAddress nếu có
    if (shippingAddress) {
      order.shippingAddress = shippingAddress;
    }

    // Xử lý promotionId
    if (typeof promotionId !== "undefined") {
      if (promotionId) {
        const promotion = await Promotion.findById(promotionId).lean();
        if (!promotion || !promotion.isActive) {
          return res.status(400).json({ error: "Mã khuyến mãi không hợp lệ hoặc không hoạt động" });
        }
        order.promotionId = promotionId;
      } else {
        order.promotionId = null;
      }
    }

    // Xử lý items nếu có
    if (Array.isArray(items) && items.length > 0) {
      // Lấy danh sách SKU từ items mới và cũ
      const oldItems = order.items.map(i => ({
        productId: i.productId.toString(),
        sku: i.sku,
        quantity: Number(i.quantity),
      }));
      const newItems = items.map(i => ({
        productId: String(i.productId),
        sku: String(i.sku),
        quantity: Number(i.quantity),
        price: Number(i.price),
      }));

      // Load products cho tất cả SKU
      const skus = [...new Set([...newItems.map(i => i.sku), ...oldItems.map(i => i.sku)])];
      const products = await Product.find({ "variants.sku": { $in: skus } }).lean();

      // Kiểm tra tính hợp lệ của items
      for (const item of newItems) {
        const product = products.find(p => p._id.toString() === item.productId);
        if (!product) {
          return res.status(400).json({ error: `Sản phẩm ${item.productId} không tồn tại` });
        }
        const variant = product.variants.find(v => String(v.sku) === item.sku);
        if (!variant) {
          return res.status(400).json({ error: `SKU ${item.sku} không tồn tại` });
        }
        if (variant.stockQuantity < item.quantity) {
          return res.status(400).json({ error: `SKU ${item.sku}: Không đủ tồn kho (cần ${item.quantity}, còn ${variant.stockQuantity})` });
        }
      }

      // Tính toán diff để cập nhật stock
      const oldMap = {};
      for (const o of oldItems) {
        oldMap[o.sku] = (oldMap[o.sku] || 0) + o.quantity;
      }
      const newMap = {};
      for (const n of newItems) {
        newMap[n.sku] = (newMap[n.sku] || 0) + n.quantity;
      }

      // Cập nhật stock theo diff
      const allSkus = [...new Set([...Object.keys(oldMap), ...Object.keys(newMap)])];
      for (const sku of allSkus) {
        const oldQty = oldMap[sku] || 0;
        const newQty = newMap[sku] || 0;
        const diff = newQty - oldQty;
        if (diff !== 0) {
          await Product.updateOne(
            { "variants.sku": sku },
            { $inc: { "variants.$.stockQuantity": -diff } }
          );
        }
      }

      // Cập nhật items
      let subtotal = 0;
      const newOrderItems = [];
      for (const item of newItems) {
        const product = products.find(p => p._id.toString() === item.productId);
        const variant = product.variants.find(v => String(v.sku) === item.sku);
        const price = Number(item.price || variant.price || 0);
        subtotal += price * item.quantity;
        newOrderItems.push({
          productId: item.productId,
          sku: item.sku,
          quantity: item.quantity,
          price,
          variantInfo: {
            color: variant.color?._id || variant.color,
            size: variant.size?._id || variant.size,
            coverImage: variant.coverImage,
            images: variant.images || [],
          },
        });
      }
      order.items = newOrderItems;
      order.subtotal = subtotal;
    }

    // Tính toán discount và total
    let discount = 0;
    if (order.promotionId) {
      const promotion = await Promotion.findById(order.promotionId).lean();
      if (promotion) {
        if (promotion.type === "percentage") {
          discount = Math.min((order.subtotal * promotion.value) / 100, promotion.maxDiscount || Infinity);
        } else if (promotion.type === "fixed") {
          discount = Math.min(promotion.value, order.subtotal);
        } else if (promotion.type === "free_shipping") {
          discount = 0;
        }
      }
    }
    order.discount = discount;
    order.total = order.subtotal - discount;

    // Cập nhật status nếu có
    if (status && status !== order.status) {
      if (!["pending", "processing", "shipped", "completed", "cancelled", "expired"].includes(status)) {
        return res.status(400).json({ error: "Trạng thái không hợp lệ" });
      }
      if (status === "cancelled" && order.status === "pending") {
        await releaseStock(order);
      }
      if (status === "completed" && order.status !== "completed") {
        await User.findByIdAndUpdate(order.userId, {
          $inc: { "loyalty.points": Math.floor(order.total / 10000) },
        });
      }
      order.status = status;
    }

    // Nếu chuyển sang VNPay, tạo URL thanh toán
    if (paymentMethod === "vnpay" && order.paymentMethod !== "vnpay") {
      order.status = "processing";
      const vnpayUrl = await createVNPayUrl(order, req);
      order.paymentMethod = "vnpay";
    }

    // Cập nhật thời gian
    order.updatedAt = new Date();
    if (order.status === "pending") {
      order.reserveExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
    } else {
      order.reserveExpiresAt = null;
    }

    // Lưu đơn hàng
    await order.save();

    // Populate dữ liệu trả về
    const populated = await Order.findById(order._id)
      .populate("userId", "name email")
      .populate("promotionId", "code name")
      .populate("items.variantInfo.color", "name")
      .populate("items.variantInfo.size", "name")
      .lean();

    console.log("Updated order:", populated); // Debug đơn hàng sau cập nhật

    // Trả về vnpayUrl nếu có
    if (paymentMethod === "vnpay" && order.paymentMethod === "vnpay") {
      const vnpayUrl = await createVNPayUrl(order, req);
      return res.status(200).json({ order: populated, vnpayUrl });
    }

    return res.status(200).json(populated);
  } catch (err) {
    console.error("updateOrder error:", err);
    return res.status(500).json({ error: "Lỗi cập nhật đơn hàng", details: err.message });
  }
};

exports.getOrders = async (req, res) => {
  try {
    const orders = await Order.find()
      .populate("userId", "name email")
      .populate("promotionId", "code name")
      .populate("items.variantInfo.color", "name")
      .populate("items.variantInfo.size", "name")
      .sort({ createdAt: -1 })
      .lean();
    res.json(orders);
  } catch (err) {
    console.error("getOrders error:", err);
    res.status(500).json({ error: "Lỗi tải danh sách đơn" });
  }
};

exports.getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("userId", "name email")
      .populate("promotionId", "code name")
      .populate("items.variantInfo.color", "name")
      .populate("items.variantInfo.size", "name")
      .lean();
    if (!order) return res.status(404).json({ error: "Không tìm thấy đơn hàng" });
    res.json(order);
  } catch (err) {
    console.error("getOrderById error:", err);
    res.status(500).json({ error: "Lỗi tải đơn hàng" });
  }
};

exports.updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: "Không tìm thấy đơn hàng" });

    if (status && !["pending", "processing", "shipped", "completed", "cancelled", "expired"].includes(status)) {
      return res.status(400).json({ error: "Trạng thái không hợp lệ" });
    }

    if (status === "cancelled" && order.status === "pending") {
      await releaseStock(order);
    }

    if (status === "completed" && order.status !== "completed") {
      await User.findByIdAndUpdate(order.userId, {
        $inc: { "loyalty.points": Math.floor(order.total / 10000) },
      });
    }

    order.status = status;
    order.updatedAt = new Date();
    if (order.status === "pending") {
      order.reserveExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
    } else {
      order.reserveExpiresAt = null;
    }

    await order.save();

    const populated = await Order.findById(order._id)
      .populate("userId", "name email")
      .populate("promotionId", "code name")
      .populate("items.variantInfo.color", "name")
      .populate("items.variantInfo.size", "name")
      .lean();
    res.json(populated);
  } catch (err) {
    console.error("updateOrderStatus error:", err);
    res.status(500).json({ error: "Lỗi cập nhật trạng thái đơn" });
  }
};

exports.cancelOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: "Không tìm thấy đơn hàng" });

    if (order.status === "pending") await releaseStock(order);

    await order.deleteOne();

    res.json({ message: "Đã hủy đơn hàng" });
  } catch (err) {
    console.error("cancelOrder error:", err);
    res.status(500).json({ error: "Lỗi hủy đơn hàng" });
  }
};
exports.getOrderByIdForUser = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("items.variantInfo.color", "name")
      .populate("items.variantInfo.size", "name")
      .lean();

    if (!order) return res.status(404).json({ error: "Không tìm thấy đơn hàng" });

    // Chỉ trả nếu user là chủ đơn
    if (order.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: "Bạn không có quyền xem đơn hàng này" });
    }

    res.json({ order });
  } catch (err) {
    console.error("getOrderByIdForUser error:", err);
    res.status(500).json({ error: "Lỗi tải đơn hàng" });
  }
};
exports.getOrdersForUser = async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.user._id })
      .populate("items.variantInfo.color", "name")
      .populate("items.variantInfo.size", "name")
      .populate("promotionId", "code name")
      .sort({ createdAt: -1 })
      .lean();
    res.json({ orders });
  } catch (err) {
    console.error("getOrdersForUser error:", err);
    res.status(500).json({ error: "Lỗi tải danh sách đơn của bạn" });
  }
};
