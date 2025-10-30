//routes/auth.js
const express = require("express");
const router = express.Router();

const {
  register,
  login,
  logout,
  me
} = require("../controllers/authController");

const { protect, adminAuth, apiProtect } = require("../middlewares/auth");
// ✅ Page Login admin (render view)
router.get("/login", (req, res) => {
  res.render("admin/login", { title: "Đăng nhập" });
});

// ✅ Đăng ký
router.post("/register", register);

// ✅ Xử lý login (API JSON)
router.post("/login", login);

// ✅ Logout xoá JWT cookie
router.get("/logout", logout);
router.post("/logout", logout);

// ✅ Lấy thông tin user từ JWT
router.get("/me", apiProtect, me);

// ✅ Admin Dashboard redirect
router.get("/dashboard", protect, adminAuth, (req, res) => {
  res.redirect("/admin/dashboard/product");
});

module.exports = router;
