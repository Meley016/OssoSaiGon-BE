const mongoose = require("mongoose");

const itemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  name: String,
  quantity: Number,
  price: Number
});

const orderSchema = new mongoose.Schema({
  orderId: String,
  customerName: String,
  customerEmail: String,
  status: {
    type: String,
    enum: ["pending", "processing", "shipped", "cancelled"],
    default: "pending"
  },
  items: [itemSchema],
  total: Number
}, { timestamps: true });

module.exports = mongoose.model("Order", orderSchema);
