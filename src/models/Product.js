const mongoose = require("mongoose");

const variantSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true},
    color: { type: mongoose.Schema.Types.ObjectId, ref: "Color", required: true },
    size: { type: mongoose.Schema.Types.ObjectId, ref: "Size", required: true },
    stockQuantity: { type: Number, required: true, min: 0 },
    price: { type: Number, required: true, min: 0 },
    importPrice: { type: Number, required: true, min: 0 },
    images: [{ type: String }],
    coverImage: { type: String }
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    groupId: { type: String, index: true },
    name: { type: String, required: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "Category", required: true },
    brand: { type: String },
    description: { type: String },
    variants: [variantSchema],
    
    status: { type: String, enum: ["active", "inactive"], default: "active" }
  },
  { timestamps: true }
);

productSchema.index({ name: "text" });

// Unique SKU theo từng product group
productSchema.index({ groupId: 1, "variants.sku": 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("Product", productSchema);