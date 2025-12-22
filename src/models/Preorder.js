// models/Preorder.js
const mongoose = require("mongoose");

const PreorderSchema = new mongoose.Schema(
  {
    user: {
      name: String,
      email: String,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
    },
    variants: [
      {
        sku: String,
        color: String,
        size: String,
        price: Number,
      },
    ],
    isSeen: { type: Boolean, default: false },
    contacted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Preorder", PreorderSchema);
