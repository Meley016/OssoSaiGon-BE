// src/cron/releaseStockJob.js
const cron = require("node-cron");
const Order = require("../models/Order");
const { releaseStock } = require("../controllers/orderController");

cron.schedule("*/5 * * * *", async () => {
  const expiredOrders = await Order.find({
    status: "pending",
    isTemporary: true,
    reserveExpiresAt: { $lt: new Date() },
  });

  for (const order of expiredOrders) {
    await releaseStock(order);
    order.status = "expired";
    order.isTemporary = false;
    order.reserveExpiresAt = null;
    await order.save();
  }

  console.log("Expired orders processed:", expiredOrders.length);
});
