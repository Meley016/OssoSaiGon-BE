const express = require("express");
const router = express.Router();
const {
  getUserStats,
  getRevenueStats,
} = require("./../controllers/adminStatsController.js");


router.get("/users", getUserStats);
router.get("/revenue", getRevenueStats);

router.get("/dashboard", (req, res) => {
  res.render("admin/dashboard");
});

module.exports = router;
