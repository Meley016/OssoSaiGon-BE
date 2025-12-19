const { User } = require("../models/User");
const Order = require("../models/Order");

/**
 * =========================
 * USER STATISTICS
 * GET /api/report/users
 * =========================
 */
exports.getUserStats = async (req, res) => {
  try {
    const now = new Date();

    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );

    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfDay.getDate() - startOfDay.getDay());

    const startOfMonth = new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    );

    const startOfYear = new Date(
      now.getFullYear(),
      0,
      1
    );

    const [
      totalUsers,
      todayUsers,
      weekUsers,
      monthUsers,
      yearUsers,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ createdAt: { $gte: startOfDay } }),
      User.countDocuments({ createdAt: { $gte: startOfWeek } }),
      User.countDocuments({ createdAt: { $gte: startOfMonth } }),
      User.countDocuments({ createdAt: { $gte: startOfYear } }),
    ]);

    res.json({
      totalUsers,
      todayUsers,
      weekUsers,
      monthUsers,
      yearUsers,
    });
  } catch (err) {
    console.error("User stats error:", err);
    res.status(500).json({ message: "Cannot get user stats" });
  }
};

/**
 * =========================
 * REVENUE STATISTICS
 * GET /api/report/revenue
 * =========================
 */
exports.getRevenueStats = async (req, res) => {
  try {
    const { type = "month" } = req.query;

    let groupId = {};
    let sortStage = {};

    switch (type) {
      case "day":
        groupId = {
          year: { $year: "$createdAt" },
          month: { $month: "$createdAt" },
          day: { $dayOfMonth: "$createdAt" },
        };
        sortStage = {
          "_id.year": 1,
          "_id.month": 1,
          "_id.day": 1,
        };
        break;

      case "week":
        groupId = {
          year: { $year: "$createdAt" },
          week: { $isoWeek: "$createdAt" },
        };
        sortStage = {
          "_id.year": 1,
          "_id.week": 1,
        };
        break;

      case "year":
        groupId = {
          year: { $year: "$createdAt" },
        };
        sortStage = {
          "_id.year": 1,
        };
        break;

      default: // month
        groupId = {
          year: { $year: "$createdAt" },
          month: { $month: "$createdAt" },
        };
        sortStage = {
          "_id.year": 1,
          "_id.month": 1,
        };
    }

    const data = await Order.aggregate([
      {
        $match: {
          status: { $nin: ["cancelled", "expired"] },
        },
      },
      {
        $group: {
          _id: groupId,
          totalOrders: { $sum: 1 },
          revenue: { $sum: "$total" },
        },
      },
      { $sort: sortStage },
    ]);

    res.json({ type, data });
  } catch (err) {
    console.error("Revenue stats error:", err);
    res.status(500).json({ message: "Cannot get revenue stats" });
  }
};
