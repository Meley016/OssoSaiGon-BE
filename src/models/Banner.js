const mongoose = require("mongoose");

const bannerSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["banner", "logo"], required: true }, // 👈 phân biệt loại
    image: { type: String, required: true },
    title: { type: String },
    description: { type: String },
    link: { type: String },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Banner", bannerSchema);
