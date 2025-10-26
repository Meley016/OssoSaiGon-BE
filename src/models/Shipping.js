const mongoose = require("mongoose");

const shippingSchema = new mongoose.Schema({
  name: { type: String, required: true },
  fee: { type: Number, required: true },
  freeThreshold: { type: Number, default: null }
}, { timestamps: true });

module.exports = mongoose.model("Shipping", shippingSchema);
