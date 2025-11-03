// routes/banner.js
const express = require("express");
const router = express.Router();
const upload = require("../middlewares/uploadImagesCloudinary");
const bannerCtrl = require("../controllers/bannerController");
const { protect, adminAuth, apiProtect } = require("../middlewares/auth");

// 🟢 LẤY DANH SÁCH CHO CLIENT (không cần đăng nhập)
router.get("/active", bannerCtrl.getActive);

// 🟢 LẤY DANH SÁCH CHO ADMIN DASHBOARD (phải đăng nhập)
router.get("/", bannerCtrl.getAll);

// 🟡 TẠO MỚI (ADMIN)
router.post("/", upload, bannerCtrl.create);

// 🔵 CẬP NHẬT (ADMIN)
router.put("/:id", upload, bannerCtrl.update);

// 🔴 XÓA (ADMIN)
router.delete("/:id", bannerCtrl.remove);

module.exports = router;
