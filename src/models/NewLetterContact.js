const mongoose = require("mongoose");

const newsletterContactSchema = new mongoose.Schema(
  {
    email: { type: String, required: true },
    name: { type: String, default: "" },
    message: { type: String, default: "" },

    type: {
      type: String,
      enum: ["newsletter", "contact"],
      required: true,
    },

    status: {
      type: String,
      enum: ["new", "read"],
      default: "new",
    },

    isSeen: { type: Boolean, default: false }, // ⭐ thêm
  },
  { timestamps: true }
);
module.exports = mongoose.model(
  "NewsletterContact",
  newsletterContactSchema
);