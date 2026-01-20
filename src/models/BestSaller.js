const mongoose = require("mongoose");

const bestSellerSchema = new mongoose.Schema(
  {
    products: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        position: {
          type: Number,
          default: 0,
        },
      },
    ],

    isActive: {
      type: Boolean,
      default: true,
    },

    title: {
      type: String,
      default: "Best Seller",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("BestSeller", bestSellerSchema);
