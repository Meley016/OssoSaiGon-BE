// models/Preorder.js
const mongoose = require("mongoose");

const PreorderSchema = new mongoose.Schema({
  user: { name: String, email: String },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
  items: [
    {
      sku: { type: String, required: true },
      color: { id: String, name: String },  
      size: { id: String, name: String }, 
      price: Number,
      quantity: Number,
      image: String,
    },
  ],
  isSeen: { type: Boolean, default: false },
  contacted: { type: Boolean, default: false },
}, { timestamps: true });
module.exports = mongoose.model("Preorder", PreorderSchema);