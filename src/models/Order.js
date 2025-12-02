// src/models/Order.js
const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    orderCode: {
      type: String,
      required: false,
      unique: true,
      index: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    promotionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Promotion",
      default: null,
    },

    paymentMethod: {
      type: String,
      enum: ["cod", "bank_transfer", "vnpay", "paypal", "stripe"], 
      required: true,
    },

    shippingAddress: {
      type: {
        fullName: { type: String, required: true },
        phone: { type: String, required: true },
        street: { type: String, required: true },
        ward: String,
        district: String,
        city: { type: String, required: true },
      },
      required: true,
    },

    items: [
      {
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        sku: { type: String, required: true },
        quantity: { type: Number, required: true, min: 1 },
        price: { type: Number, required: true, min: 0 },
        variantInfo: {
          color: { type: mongoose.Schema.Types.ObjectId, ref: "Color" },
          size: { type: mongoose.Schema.Types.ObjectId, ref: "Size" },
          coverImage: String,
          images: [String],
        },
      },
    ],

    subtotal: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },

    // TRẠNG THÁI ĐƠN HÀNG – RẤT QUAN TRỌNG
    status: {
      type: String,
      enum: [
        "pending",     // Đơn tạm (chưa thanh toán, chưa trừ stock)
        "preparing",   // COD/Bank → đã xác nhận, đang chuẩn bị hàng
        "paid",        // VNPay thanh toán thành công
        "processing",  // Đang xử lý (đã đóng gói, chờ giao)
        "shipped",     // Đã giao cho đơn vị vận chuyển
        "completed",   // Khách đã nhận hàng
        "cancelled",   // Hủy bởi khách/admin
        "expired",     // Hết hạn thanh toán (10 phút)
      ],
      default: "pending",
      index: true,
    },

    // ĐÁNH DẤU ĐÂY LÀ ĐƠN TẠM HAY CHÍNH THỨC
    isTemporary: {
      type: Boolean,
      default: true,
      index: true,
    },

    // Thời gian hết hạn giữ hàng (chỉ áp dụng cho đơn tạm)
    reserveExpiresAt: {
      type: Date,
      default: null,
      index: { expires: "10m" }, // MongoDB tự xóa field sau 10 phút (tùy chọn)
    },

    // Thời điểm thanh toán thành công (VNPay)
    paidAt: { type: Date },

    // Ghi chú từ khách hàng hoặc admin
    note: String,

    // Metadata VNPay (lưu lại để đối soát)
    vnpayTransactionNo: String,
    vnpayResponseCode: String,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Tự động tạo orderCode nếu chưa có (backup)
orderSchema.pre("save", async function (next) {
  if (!this.orderCode) {
    const lastOrder = await this.constructor.findOne({}, {}, { sort: { createdAt: -1 } });
    const nextNumber = lastOrder && lastOrder.orderCode ? parseInt(lastOrder.orderCode.slice(3)) + 1 : 1;
    this.orderCode = `ORD${nextNumber.toString().padStart(6, "0")}`;
  }

  // Nếu là đơn tạm → tự động set thời gian hết hạn
  if (this.isTemporary && this.status === "pending" && !this.reserveExpiresAt) {
    this.reserveExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 phút
  }

  next();
});

// Index để tìm đơn tạm hết hạn nhanh
orderSchema.index({ isTemporary: true, status: "pending", reserveExpiresAt: 1 });

module.exports = mongoose.model("Order", orderSchema);