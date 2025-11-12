const mongoose = require("mongoose");

const footerInfoSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["shipping", "returns", "terms", "privacy"],
      required: true,
      unique: true,
    },
    title: { type: String, required: true },
    content: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("FooterInfo", footerInfoSchema);
