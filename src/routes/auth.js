//routes/auth.js
const express = require("express");
const router = express.Router();

const {
  register,
  login,
  logout,
  me
} = require("../controllers/authController");
const requireRole = require("../middlewares/requireRole");
const { protect, apiProtect } = require("../middlewares/auth");
const dashboardCtrl = require("../controllers/dashboardController");
const authController = require("../controllers/authController");


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
router.get("/dashboard",
  protect,
  requireRole("admin", "writer", "productAdder"),
  (req, res) => {
    const role = req.user.role;

    if (role === "admin") return res.redirect("/admin/dashboard/product");
    if (role === "writer") return res.redirect("/admin/dashboard/blog");
    if (role === "productAdder") return res.redirect("/admin/dashboard/product");

    // fallback nếu role lạ
    res.redirect("/");
  }
);

router.post("/forgot-password/send-otp", authController.sendForgotOtp);
router.post("/forgot-password/verify", authController.verifyForgotOtp);


module.exports = router;
