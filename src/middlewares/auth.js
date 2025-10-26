// src/middlewares/auth.js
const jwt = require("jsonwebtoken");
const { User, LoyaltyConfig, LoyaltyHistory } = require("../models/User");

// Xác thực đăng nhập
exports.protect = async (req, res, next) => {
  try {
    console.log('Session:', req.session);
    if (req.session && req.session.admin) {
      const token = req.session.admin.token;
      console.log('Token:', token);
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log('Decoded:', decoded);
      req.user = await User.findById(decoded.id).select("-password");
      if (!req.user) {
        console.log('User not found for ID:', decoded.id);
        return res.redirect("/admin/login");
      }
      console.log('User:', req.user);
      return next();
    }
    console.log('No session.admin, redirecting to login');
    return res.redirect("/admin/login");
  } catch (err) {
    console.error("Auth Error:", err);
    return res.redirect("/admin/login");
  }
};

exports.adminAuth = (req, res, next) => {
  console.log('Checking adminAuth, req.user:', req.user);
  if (req.user && req.user.role === "admin") {
    return next();
  }
  console.log('Access denied: Not admin or no user');
  return res.status(403).json({ error: "Bạn không có quyền truy cập!" });
};