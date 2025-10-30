const mongoose = require("mongoose");

const cartItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  sku: { type: String, required: true },
  quantity: { type: Number, required: true, min: 1 },
  price: { type: Number, required: true }, // Lưu giá tại thời điểm thêm
  variantInfo: {
    color: { type: mongoose.Schema.Types.ObjectId, ref: "Color", required: true },
    size: { type: mongoose.Schema.Types.ObjectId, ref: "Size", required: true },
    coverImage: String,
  },
}, { _id: false });

const cartSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  items: [cartItemSchema],
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Cart", cartSchema);
