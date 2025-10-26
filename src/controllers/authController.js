// src/controllers/authController.js
const jwt = require("jsonwebtoken");
const { User, LoyaltyConfig, LoyaltyHistory } = require("../models/User");
const bcrypt = require("bcryptjs");

exports.getLoginPage = (req, res) => {
  if (req.session.admin) {
    return res.redirect("/admin/dashboard/product");
  }
  res.render("admin/login", { error: null }); // ĐÚNG: admin/login
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Vui lòng nhập email và mật khẩu!" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: "Email không tồn tại!" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Sai mật khẩu!" });
    }

    if (user.role !== "admin") {
      return res.status(403).json({ error: "Không có quyền admin!" });
    }

    // Tạo JWT
    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    // LƯU SESSION ĐÚNG
    req.session.admin = {
      id: user._id,
      email: user.email,
      role: user.role,
      token
    };

    console.log("Login thành công:", req.session.admin.email);

    res.json({
      success: true,
      message: "Đăng nhập thành công!",
      redirect: "/admin/dashboard/product"
    });

  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ error: "Lỗi hệ thống!" });
  }
};

exports.logout = (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error("Logout error:", err);
    res.redirect("/admin/login");
  });
};