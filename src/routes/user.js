// src/routes/users.js
const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const { protect, adminAuth } = require("../middlewares/auth");
const upload = require("../middlewares/uploadImagesCloudinary");

// Loyalty routes
router.get("/loyalty/config", protect, adminAuth, userController.getLoyaltyConfig);
router.put("/loyalty/config", protect, adminAuth, userController.updateLoyaltyConfig);
router.get("/loyalty/history", protect, adminAuth, userController.getLoyaltyHistory);

router.put("/:id/loyalty/adjust", protect, adminAuth, userController.adjustUserPoints);
router.put("/:id/loyalty/set-tier", protect, adminAuth, userController.setUserTier);

// CRUD
router.get("/", protect, adminAuth, userController.getUsers);
router.get("/:id", protect, adminAuth, userController.getUser);
router.post("/", protect, adminAuth, upload, userController.createUser);
router.put("/:id", protect, adminAuth, upload, userController.updateUser);
router.delete("/:id", protect, adminAuth, userController.deleteUser);

// Password change
router.put("/:id/password", protect, adminAuth, userController.changePassword);

module.exports = router;
