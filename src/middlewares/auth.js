// src/middlewares/auth.js
const jwt = require("jsonwebtoken");
const { User } = require("../models/User");

exports.protect = async (req, res, next) => {
  try {
    const token = req.cookies.token;
    if (!token) return res.redirect("/admin/login");

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select("-password");

    if (!req.user) return res.redirect("/admin/login");

    next();
  } catch (err) {
    res.clearCookie("token");
    return res.redirect("/admin/login");
  }
};

exports.adminAuth = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res.redirect("/admin/login");
  }
  next();
};
exports.apiProtect = async (req, res, next) => {
  try {
    const token = req.cookies.token;
    if (!token) {
      return res.status(401).json({ isAuthenticated: false, error: "Chưa đăng nhập!" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select("-password");

    if (!req.user) {
      return res.status(401).json({ isAuthenticated: false });
    }

    next();
  } catch (err) {
    res.clearCookie("token");
    return res.status(401).json({ isAuthenticated: false, error: "Token hết hạn!" });
  }
};

// Middleware kiểm tra role (dùng chung)
exports.requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Chưa đăng nhập" });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Không có quyền truy cập" });
    }
    next();
  };
};

exports.allowRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).render("admin/403", { title: "Không có quyền truy cập" });
    }
    next();
  };
};

