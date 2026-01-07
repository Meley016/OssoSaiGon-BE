const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { User } = require("../models/User");
const { sendEmail } = require("../utils/email");

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

exports.sendForgotOtp = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: "Email không tồn tại trong hệ thống" });

    const otp = generateOtp();
    user.passwordToken = otp; // dùng lại field sẵn có
    user.passwordTokenExpire = Date.now() + 15 * 60 * 1000; // hết hạn 15 phút
    await user.save();

    await sendEmail({
      to: email,
      subject: "Mã xác nhận quên mật khẩu - Oso Saigon",
      templateName: "otpVerify",
      variables: { name: user.name || "bạn", code: otp },
    });

    res.json({ success: true, message: "Đã gửi mã xác nhận đến email của bạn" });
  } catch (err) {
    console.error("sendForgotOtp error:", err);
    res.status(500).json({ error: "Không thể gửi mã xác nhận" });
  }
};

exports.verifyForgotOtp = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: "Không tìm thấy user" });

    if (!user.passwordToken || user.passwordTokenExpire < Date.now())
      return res.status(400).json({ error: "Mã OTP đã hết hạn" });
    if (user.passwordToken !== otp)
      return res.status(400).json({ error: "Mã OTP không đúng" });

    user.password = newPassword;
    user.passwordToken = undefined;
    user.passwordTokenExpire = undefined;
    await user.save();

    res.json({ success: true, message: "Đổi mật khẩu thành công!" });
  } catch (err) {
    console.error("verifyForgotOtp error:", err);
    res.status(500).json({ error: "Lỗi xác nhận mã OTP" });
  }
};

// ---------------- LOGIN ----------------
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ success: false, error: "Thiếu email hoặc mật khẩu" });

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user)
      return res.status(401).json({ success: false, error: "Sai email hoặc chưa đăng ký!" });

    // ✅ Block login
    if (user.isBlocked) {
      res.clearCookie("token");
      return res.status(403).json({
        success: false,
        error: "Tài khoản đã bị khóa! Vui lòng liên hệ admin."
      });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return res.status(401).json({ success: false, error: "Sai mật khẩu!" });

    const token = jwt.sign(
      { id: user._id.toString(), role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production" ? true : false, // true khi deploy
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax", // none để gửi cross-domain HTTPS
      maxAge: 100 * 60 * 60 * 1000, // 8 tiếng
    });

    if (["admin", "writer", "productAdder"].includes(user.role)) {
      req.session.admin = {
        id: user._id,
        email: user.email,
        role: user.role,
        token
      };
    }

    let redirectUrl = "/";
    if (user.role === "admin") redirectUrl = "/admin/dashboard/product";
    else if (user.role === "writer") redirectUrl = "/admin/dashboard/blog";
    else if (user.role === "productAdder") redirectUrl = "/admin/dashboard/product";

    return res.json({
      success: true,
      message: "Đăng nhập thành công!",
      redirect: redirectUrl
    });

  } catch (err) {
    console.error("Login Error:", err);
    return res.status(500).json({ success: false, error: "Lỗi hệ thống!" });
  }
};

// ---------------- REGISTER ----------------
exports.register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password)
      return res.status(400).json({
        success: false,
        error: "Vui lòng nhập đầy đủ thông tin!"
      });

    const emailLower = email.trim().toLowerCase();
    const existing = await User.findOne({ email: emailLower });

    if (existing)
      return res.status(400).json({
        success: false,
        error: "Email đã tồn tại!"
      });

    const user = await User.create({
      name: name.trim(),
      email: emailLower,
      password,
      role: "user",
      loyalty: { points: 0, tier: "bronze" },
      isBlocked: false
    });

    const token = jwt.sign(
      { id: user._id.toString(), role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production" ? true : false, // true khi deploy
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax", // none để gửi cross-domain HTTPS
      maxAge: 8 * 60 * 60 * 1000, // 8 tiếng
    });

    return res.status(201).json({
      success: true,
      message: "Đăng ký thành công!",
      user: {
        id: user._id,
        name: user.name,
        email: user.email
      }
    });

  } catch (err) {
    console.error("Register Error:", err);
    return res.status(500).json({ success: false, error: "Lỗi server!" });
  }
};

// ---------------- LOGOUT ----------------
exports.logout = (req, res) => {
  try {
    // Xóa cookie JWT
    res.clearCookie("token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production" ? true : false,
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    });

    // Xóa session express
    if (req.session) {
      req.session.destroy(err => {
        if (err) {
          console.error("Session destroy error:", err);
          // Nếu lỗi, vẫn cố gắng xóa cookie
          res.clearCookie("connect.sid");
          return res.redirect("/admin/login");
        }

        // Xóa cookie session
        res.clearCookie("connect.sid", {
          path: "/",
        });

        console.log("✅ Logout: Session & cookie cleared");
        return res.redirect("/admin/login");
      });
    } else {
      // Không có session vẫn redirect bình thường
      console.log("✅ Logout: No active session found");
      res.clearCookie("connect.sid", { path: "/" });
      return res.redirect("/admin/login");
    }
  } catch (e) {
    console.error("Logout exception:", e);
    res.clearCookie("token");
    res.clearCookie("connect.sid");
    return res.redirect("/admin/login");
  }
};

// ---------------- ME ----------------
exports.me = async (req, res) => {
  try {
    const token = req.cookies.token;
    if (!token)
      return res.status(401).json({ success: false, isAuthenticated: false });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("-password");

    if (!user || user.isBlocked) {
      res.clearCookie("token");
      return res.status(403).json({
        success: false,
        isAuthenticated: false,
        error: "Tài khoản bị khóa hoặc không tồn tại!"
      });
    }

    return res.json({
      success: true,
      isAuthenticated: true,
      user
    });

  } catch (err) {
    res.clearCookie("token");
    return res.status(401).json({ success: false, isAuthenticated: false });
  }
};
