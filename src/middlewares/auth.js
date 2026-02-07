// src/middlewares/auth.js
const jwt = require("jsonwebtoken");
const { User } = require("../models/User");

exports.protect = (req, res, next) => {
  if (!req.session.admin) {
    return res.redirect("/admin/login");
  }
  req.user = req.session.admin;
  next();
};

exports.adminAuth = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res.redirect("/admin/login");
  }
  next();
};
exports.apiProtect = async (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer "))
    return res.status(401).json({ error: "No token" });

  try {
    const token = auth.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    req.user = await User.findById(decoded.id).select("-password");
    next();
  } catch {
    res.status(401).json({ error: "Token expired" });
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
      return res
        .status(403)
        .render("admin/403", { title: "Không có quyền truy cập" });
    }
    next();
  };
};
exports.requireVNPayRole = (req, res, next) => {
  if (
    !req.session.admin ||
    !["admin", "partner-vnpay"].includes(req.session.admin.role)
  ) {
    req.session.returnTo = req.originalUrl;
    return res.redirect("/admin/login");
  }
  next();
};
