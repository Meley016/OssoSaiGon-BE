const express = require("express");
const router = express.Router();
const { renderStatisticsPage, getStatisticsData } = require("../controllers/statisticsController");
const { protect, adminAuth } = require("../middlewares/auth");
// Trang dashboard thống kê (hiển thị EJS)
router.get("/",renderStatisticsPage);

// API trả JSON thống kê (cho biểu đồ)
router.get("/data", getStatisticsData);

module.exports = router;
