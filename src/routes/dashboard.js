// // src/routes/dashboard.js
// const express = require("express");
// const router = express.Router();

// const {
//   renderDashboard,
//   renderSectionPartial
// } = require("../controllers/dashboardController");

// const { protect, apiProtect, requireRole } = require("../middlewares/auth");

// // DASHBOARD LAYOUT (load 1 lần)
// router.get("/", renderDashboard);

// // LOAD SECTION THEO NHU CẦU (AJAX)
// router.get(
//   "/section/:section",
//   renderSectionPartial
// );

// module.exports = router;
