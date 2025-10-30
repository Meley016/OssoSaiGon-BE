// src/models/Promotion.js
const mongoose = require('mongoose');

const promotionSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  description: String,
  isActive: { type: Boolean, default: true },
  type: { type: String, enum: ['percentage', 'fixed', 'free_shipping', 'buy_x_get_y'], required: true },
  value: { type: Number, required: true },
  maxDiscount: Number,
  minOrderValue: Number,
  minQuantity: Number,
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  usageLimit: Number,
  usedCount: { type: Number, default: 0 },
  applyType: { type: String, enum: ['user', 'product', 'category'], required: true },
  usageLimitPerUser: Number,
  isNewUserOnly: Boolean,
  userLevels: [String],
  productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  categoryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
  usageLimitPerProduct: Number,
  buyQuantity: Number,
  getQuantity: Number,
  getProductId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: function() {
      return this.type === 'buy_x_get_y'; // Chỉ bắt buộc cho buy_x_get_y
    }
  }
});

module.exports = mongoose.model('Promotion', promotionSchema);