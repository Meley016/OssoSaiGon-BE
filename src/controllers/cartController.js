// src/controllers/cartController.js
const Cart = require("../models/Cart");

exports.getCart = async (req, res) => {
  const cart = await Cart.findOne({ userId: req.user._id });
  res.json({ isAuthenticated: true, cart });
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
};

exports.updateCartItem = async (req, res) => {
  const { sku, quantity } = req.body;
  const cart = await Cart.findOne({ userId: req.user._id });
  if (!cart) return res.status(404).json({ error: "Cart not found" });

  const item = cart.items.find(i => i.sku === sku);
  if (!item) return res.status(404).json({ error: "Item not found" });

  item.quantity = quantity;
  await cart.save();
  res.json({ message: "Updated!", cart });
};

exports.removeItem = async (req, res) => {
  const { sku } = req.params;
  await Cart.updateOne(
    { userId: req.user._id },
    { $pull: { items: { sku } } }
  );
  res.json({ message: "Removed!" });
};

exports.clearCart = async (req, res) => {
  await Cart.findOneAndUpdate({ userId: req.user._id }, { items: [] });
  res.json({ message: "Cleared!" });
};
