// utils/cancelExpired.js
const Order = require("../models/Order");

const cancelExpiredOrders = async () => {
  try {
    const result = await Order.updateMany(
      {
        isTemporary: true,
        status: "pending",
        reserveExpiresAt: { $lt: new Date() }
      },
      { status: "expired" }
    );
    if (result.modifiedCount > 0) {
      console.log(`Đã hủy ${result.modifiedCount} đơn hết hạn`);
    }
  } catch (err) {
    console.error("Cron cancel expired orders error:", err);
  }
};

module.exports = cancelExpiredOrders;