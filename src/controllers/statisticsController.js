const Order = require("../models/Order");
const Promotion = require("../models/Promotion");
const { User } = require("../models/User");

const renderStatisticsPage = async (req, res) => {
  res.render("admin/dashboard", {
    title: "Thống kê doanh thu",
    activeMenu: "statistics",
    admin: req.user,
  });
};

const getStatisticsData = async (req, res) => {
  try {
    const [completedOrders, cancelledOrders, users, promotions] = await Promise.all([
      Order.find({ status: "completed" }),
      Order.find({ status: "cancelled" }),
      User.find(),
      Promotion.find(),
    ]);

    const totalRevenue = completedOrders.reduce((sum, o) => sum + o.total, 0);
    const refund = cancelledOrders.reduce((sum, o) => sum + o.total, 0);
    const netRevenue = totalRevenue - refund;

    const loyaltyTiers = users.reduce((acc, u) => {
      const tier = u.loyalty?.tier || "bronze";
      acc[tier] = (acc[tier] || 0) + 1;
      return acc;
    }, {});

    const promoUsage = promotions.reduce((acc, p) => acc + (p.usedCount || 0), 0);

    res.json({
      totalRevenue,
      refund,
      netRevenue,
      completedOrders: completedOrders.length,
      cancelledOrders: cancelledOrders.length,
      totalUsers: users.length,
      promoUsage,
      loyaltyTiers,
    });
  } catch (err) {
    console.error("Statistics error:", err);
    res.status(500).json({ error: "Lỗi thống kê dữ liệu" });
  }
};

module.exports = {
  renderStatisticsPage,
  getStatisticsData,
};
