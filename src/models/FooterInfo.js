// models/FooterInfo.js
const mongoose = require("mongoose");

const footerInfoSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["shipping", "returns", "terms", "privacy"],
      required: true,
      unique: true,
    },
    title: {
      vi: { type: String, default: "" },
      en: { type: String, default: "" },
    },
    content: {
      vi: { type: String, default: "" },
      en: { type: String, default: "" },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("FooterInfo", footerInfoSchema);
