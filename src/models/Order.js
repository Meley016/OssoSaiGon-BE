// src/models/Order.js
const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    orderCode: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    promotionId: { type: mongoose.Schema.Types.ObjectId, ref: "Promotion" },
    paymentMethod: { type: String, enum: ["cash", "bank_transfer", "credit_card", "vnpay"], default: "cash" },
    shippingAddress: { type: String, required: true },

    items: [
      {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
        sku: { type: String, required: true }, // Đã thay variantId bằng sku
        quantity: { type: Number, required: true, min: 1 },
        price: { type: Number, required: true, min: 0 },
        variantInfo: {
          color: { type: mongoose.Schema.Types.ObjectId, ref: "Color" },
          size: { type: mongoose.Schema.Types.ObjectId, ref: "Size" },
          coverImage: String,
          images: [String]
        }
      }
    ],

    subtotal: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },

    status: {
      type: String,
      enum: ["pending", "processing", "shipped", "completed", "cancelled", "expired"],
      default: "pending"
    },

    reserveExpiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 60 * 60 * 1000)
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);