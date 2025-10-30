// models/Wishlist.js
const mongoose = require("mongoose");

const wishlistSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  },
  { timestamps: true }
);

// Đảm bảo 1 user không wishlist trùng 1 sản phẩm nhiều lần
wishlistSchema.index({ user: 1, product: 1 }, { unique: true });

const Wishlist = mongoose.model("Wishlist", wishlistSchema);

module.exports = Wishlist;
