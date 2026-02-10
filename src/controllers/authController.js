const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { User } = require("../models/User");
const { sendEmail } = require("../utils/email");
const { signAccessToken, signRefreshToken } = require("../utils/token");

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ---------------- REFRESH ----------------
exports.refresh = async (req, res) => {
  const token = req.cookies.refreshToken;
  if (!token) return res.status(401).json({ error: "No refresh token" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.id);

    if (!user || user.refreshToken !== token)
      return res.status(401).json({ error: "Invalid refresh token" });

    const newAccessToken = signAccessToken(user);
    const newRefreshToken = signRefreshToken(user);

    user.refreshToken = newRefreshToken;
    await user.save();

    res.cookie("refreshToken", newRefreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      path: "/api/auth/refresh",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({ accessToken: newAccessToken });
  } catch {
    res.status(401).json({ error: "Refresh expired" });
  }
};

// ---------------- FORGOT PASSWORD ----------------
exports.sendForgotOtp = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user)
      return res
        .status(404)
        .json({ error: "Email không tồn tại trong hệ thống" });

    const otp = generateOtp();
    user.passwordToken = otp;
    user.passwordTokenExpire = Date.now() + 15 * 60 * 1000;
    await user.save();

    await sendEmail({
      to: email,
      subject: "Mã xác nhận quên mật khẩu - Oso Saigon",
      templateName: "otpVerify",
      variables: { name: user.name || "bạn", code: otp },
    });

    res.json({
      success: true,
      message: "Đã gửi mã xác nhận đến email của bạn",
    });
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
  const { email, password } = req.body;

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) return res.status(401).json({ error: "Sai email" });

  if (user.isBlocked)
    return res.status(403).json({ error: "Tài khoản bị khóa" });

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).json({ error: "Sai mật khẩu" });

  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);

  user.refreshToken = refreshToken;
  await user.save();

  const isProd = process.env.NODE_ENV === "production";

  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    path: "/api/auth/refresh",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.json({
    success: true,
    accessToken,
    user: {
      id: user._id,
      role: user.role,
    },
  });
};

// ---------------- REGISTER (NEW FLOW) ----------------
exports.register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password)
      return res.status(400).json({
        success: false,
        error: "Vui lòng nhập đầy đủ thông tin!",
      });

    const emailLower = email.trim().toLowerCase();
    const existing = await User.findOne({ email: emailLower });
    if (existing)
      return res.status(400).json({
        success: false,
        error: "Email đã tồn tại!",
      });

    const user = await User.create({
      name: name.trim(),
      email: emailLower,
      password,
      role: "user",
      loyalty: { points: 0, tier: "bronze" },
      isBlocked: false,
    });

    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);

    user.refreshToken = refreshToken;
    await user.save();

    const isProd = process.env.NODE_ENV === "production";

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "none" : "lax",
      path: "/api/auth/refresh",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(201).json({
      success: true,
      message: "Đăng ký thành công!",
      accessToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (err) {
    console.error("Register Error:", err);
    return res.status(500).json({ success: false, error: "Lỗi server!" });
  }
};

// ---------------- LOGOUT ----------------
exports.logout = async (req, res) => {
  const token = req.cookies.refreshToken;

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
      await User.findByIdAndUpdate(decoded.id, { refreshToken: null });
    } catch {}
  }

  res.clearCookie("refreshToken", {
    path: "/api/auth/refresh",
    sameSite: "none",
    secure: true,
  });

  res.json({ success: true });
};

// ---------------- ME (ACCESS TOKEN) ----------------
exports.me = async (req, res) => {
  try {
    // 👈 user đã được gắn từ apiProtect
    const user = req.user;

    if (!user || user.isBlocked) {
      return res.status(401).json({
        success: false,
        isAuthenticated: false,
      });
    }

    res.json({
      success: true,
      isAuthenticated: true,
      user,
    });
  } catch (err) {
    return res.status(401).json({
      success: false,
      isAuthenticated: false,
    });
  }
};
