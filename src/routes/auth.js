const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");

// Trang login
router.get("/login", authController.getLoginPage);

// Submit login
router.post("/login", authController.login);

// Logout
router.post("/logout", authController.logout);

module.exports = router;
