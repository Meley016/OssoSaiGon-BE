const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const { protect, apiProtect, requireRole } = require("../middlewares/auth");
const upload = require("../middlewares/uploadImagesCloudinary");

// 🏆 Loyalty routes
// 👉 Client cũng được xem config (không cần quyền admin)
router.get("/loyalty/config", userController.getLoyaltyConfig);

// 👉 Admin có quyền chỉnh sửa config & quản lý điểm
router.put("/loyalty/config", protect, requireRole("admin"), userController.updateLoyaltyConfig);
router.get("/loyalty/history", protect, requireRole("admin"), userController.getLoyaltyHistory);
router.put("/:id/loyalty/adjust", protect, requireRole("admin"), userController.adjustUserPoints);
router.put("/:id/loyalty/set-tier", protect, requireRole("admin"), userController.setUserTier);

// 👤 Client tự cập nhật thông tin cá nhân
router.put("/me", apiProtect, upload, userController.updateMe);
router.get("/confirm-email/:token", userController.confirmEmailChange);
router.get("/confirm-password/:token", userController.confirmPasswordChange);

// 👮‍♂️ Admin quản lý user
router.get("/", protect, requireRole("admin"), userController.getUsers);
router.get("/:id", protect, requireRole("admin"), userController.getUser);
router.post("/", protect, requireRole("admin"), upload, userController.createUser);
router.put("/:id", protect, requireRole("admin"), upload, userController.updateUser);
router.delete("/:id", protect, requireRole("admin"), userController.deleteUser);

// 🔒 Đổi mật khẩu (Admin)
router.put("/:id/password", protect, requireRole("admin"), userController.changePassword);

module.exports = router;
