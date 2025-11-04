const express = require("express");
const router = express.Router();
const { renderStatisticsPage, getStatisticsData } = require("../controllers/statisticsController");
const { protect, requireRole } = require("../middlewares/auth");

router.get("/", protect, requireRole("admin"), renderStatisticsPage);
router.get("/data", protect, requireRole("admin"), getStatisticsData);

module.exports = router;
