// src/cron/releaseStockJob.js
const cron = require("node-cron");
const Order = require("../models/Order");

cron.schedule("*/5 * * * *", async () => {
  const expiredOrders = await Order.find({
    status: "pending",
    holdExpireAt: { $lt: new Date() }
  });

  for (const order of expiredOrders) {
    await releaseStock(order);
    order.status = "cancelled";
    await order.save();
  }
});
