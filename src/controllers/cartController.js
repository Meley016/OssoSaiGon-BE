// src/controllers/cartController.js
const Cart = require("../models/Cart");
const Product = require("../models/Product");

exports.getCart = async (req, res) => {
  try {
    const cart = await Cart.findOne({ userId: req.user._id })
      .populate({
        path: "items.productId",
        select: "name coverImage brand",
        populate: {
          path: "variants",
          populate: [
            { path: "color", select: "name code" },
            { path: "size", select: "name" }
          ]
        }
      })
      .populate("items.variantInfo.color", "name code")
      .populate("items.variantInfo.size", "name");

    // Nếu không có giỏ → trả về giỏ trống
    res.json({
      isAuthenticated: true,
      cart: cart || { items: [] },
    });
  } catch (err) {
    console.error("Lỗi lấy giỏ hàng:", err);
    res.status(500).json({ error: "Lỗi server" });
  }
};
exports.addToCart = async (req, res) => {
  const { productId, sku, quantity, price, variantInfo } = req.body;

  let cart = await Cart.findOne({ userId: req.user._id });
  if (!cart) cart = await Cart.create({ userId: req.user._id, items: [] });

  const existingItem = cart.items.find(i => i.sku === sku);

  if (existingItem) {
    existingItem.quantity += quantity;
  } else {
    cart.items.push({ productId, sku, quantity, price, variantInfo });
  }

  cart.updatedAt = Date.now();
  await cart.save();

  res.json({ message: "Added!", cart });
  await exports.getCart(req, res);
};

exports.updateCartItem = async (req, res) => {
  const { sku, quantity, newSku } = req.body;
  const userId = req.user._id;

  try {
    const cart = await Cart.findOne({ userId });
    if (!cart) return res.status(404).json({ error: "Cart not found" });

    const itemIndex = cart.items.findIndex(i => i.sku === sku);
    if (itemIndex === -1) return res.status(404).json({ error: "Item not found" });

    if (newSku && newSku !== sku) {
      // TÌM SẢN PHẨM CÓ newSku + POPULATE variants
      const product = await Product.findOne({ "variants.sku": newSku })
        .populate("variants.color")
        .populate("variants.size");
 
      if (!product) return res.status(404).json({ error: "Sản phẩm mới không tồn tại" });

      const newVariant = product.variants.find(v => v.sku === newSku);
      if (!newVariant) return res.status(404).json({ error: "Variant không tồn tại" });

      if (newVariant.stockQuantity < quantity) {
        return res.status(400).json({ error: `Chỉ còn ${newVariant.stockQuantity} sản phẩm` });
      }

      // XÓA ITEM CŨ
      cart.items.splice(itemIndex, 1);

      // TÌM XEM newSku ĐÃ CÓ TRONG GIỎ CHƯA
      const existingNewItem = cart.items.find(i => i.sku === newSku);
      if (existingNewItem) {
        existingNewItem.quantity += quantity;
      } else {
        // THÊM MỚI
        cart.items.push({
          productId: product._id,
          sku: newSku,
          quantity,
          price: newVariant.price,
          variantInfo: {
            color: newVariant.color,
            size: newVariant.size,
            coverImage: newVariant.images?.[0] || product.coverImage
          }
        });
      }
    } else {
      // CHỈ CẬP NHẬT SỐ LƯỢNG
      cart.items[itemIndex].quantity = quantity;
    }

    cart.updatedAt = Date.now();
    await cart.save();

    // GỌI LẠI getCart ĐỂ TRẢ VỀ DỮ LIỆU ĐÃ POPULATE
    await exports.getCart(req, res);
  } catch (err) {
    console.error("Lỗi update cart:", err);
    res.status(500).json({ error: "Lỗi server" });
  }
};

exports.removeItem = async (req, res) => {
  const { sku } = req.params;
  await Cart.updateOne(
    { userId: req.user._id },
    { $pull: { items: { sku } } }
  );
  res.json({ message: "Removed!" });
  await exports.getCart(req, res);
};

exports.clearCart = async (req, res) => {
  await Cart.findOneAndUpdate({ userId: req.user._id }, { items: [] });
  res.json({ message: "Cleared!" });
};
