// models/Wishlist.js
const mongoose = require("mongoose");

// Schema cho từng sản phẩm trong wishlist
const wishlistItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

// Schema cho wishlist (1 user có thể có nhiều list)
const wishlistSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true }, // VD: “Mua sau”, “Quà Noel”
    description: { type: String },
    items: [wishlistItemSchema], // Danh sách sản phẩm trong list
  },
  { timestamps: true }
);

// Không cho trùng tên list trong cùng user
wishlistSchema.index({ user: 1, name: 1 }, { unique: true });

const Wishlist = mongoose.model("Wishlist", wishlistSchema);
module.exports = Wishlist;
