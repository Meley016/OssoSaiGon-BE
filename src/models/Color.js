
const mongoose = require("mongoose");

const colorSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    unique: true,
  },
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    validate: {
      validator: (v) => /^#([0-9A-F]{6})$/i.test(v),
      message: "Mã màu phải đúng định dạng #RRGGBB!",
    },
  },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model("Color", colorSchema);
