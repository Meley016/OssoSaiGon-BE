/// src/controllers/userController.js
const { User, LoyaltyConfig, LoyaltyHistory } = require("../models/User");
const cloudinary = require("../config/cloudinary");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { sendEmail } = require("../utils/email");

// Hàm hỗ trợ: tìm file theo fieldname
function getUploadedFile(req, fieldname) {
  if (!req.files || !Array.isArray(req.files)) return null;
  return req.files.find(f => f.fieldname === fieldname);
}

function computeTierFromPoints(points, tiers = []) {
  if (!Array.isArray(tiers) || tiers.length === 0) return { tier: null };
  const sorted = [...tiers].sort((a, b) => b.minPoints - a.minPoints);
  const found = sorted.find(t => points >= (t.minPoints || 0));
  return found ? { tier: found.key } : { tier: sorted[sorted.length - 1].key };
}

async function deleteCloudinaryImage(url) {
  if (!url || !url.includes("/upload/")) return;
  try {
    const publicId = url.split("/upload/")[1].replace(/\.[^.]+$/, "");
    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    console.warn("Không thể xóa avatar Cloudinary:", err.message);
  }
}

// GET list users
exports.getUsers = async (req, res) => {
  try {
    const users = await User.find().select("-password").sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    console.error("getUsers error:", err);
    res.status(500).json({ error: "Lỗi server" });
  }
};

// GET single user
exports.getUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password");
    if (!user) return res.status(404).json({ error: "User không tồn tại" });
    res.json(user);
  } catch (err) {
    console.error("getUser error:", err);
    res.status(500).json({ error: "Lỗi server" });
  }
};

// CREATE USER - CHỈ SỬA PHẦN ẢNH
exports.createUser = async (req, res) => {
  try {
    // BẮT CHƯỚC BANNER: tìm file theo fieldname
    const file = req.files?.find(f => f.fieldname === "avatar");
    const avatar = file?.path || null; // .path từ CloudinaryStorage

    const { email, password, name, role, address, birthday } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Thiếu email hoặc mật khẩu" });

    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ error: "Email đã tồn tại" });

    const user = new User({
      email,
      password,
      name: name || "",
      role: role || "user",
      address: address || "",
      birthday: birthday || null,
      avatar, // ← DÙNG .path
      loyalty: { 
        points: Number(req.body.loyaltyPoints || 0), 
        tier: req.body.loyaltyTier || null 
      },
      isBlocked: req.body.isBlocked === "true"
    });

    await user.save();

    const safe = user.toObject();
    delete safe.password;
    res.status(201).json(safe);
  } catch (err) {
    console.error("createUser error:", err);
    res.status(500).json({ error: "Lỗi tạo user" });
  }
};

// UPDATE USER - CHỈ SỬA PHẦN ẢNH
exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: "Không tìm thấy user" });

    let avatar = user.avatar;

    // BẮT CHƯỚC BANNER: tìm file theo fieldname
    const file = req.files?.find(f => f.fieldname === "avatar");

    if (file) {
      // Xóa ảnh cũ nếu có
      if (user.avatar) await deleteCloudinaryImage(user.avatar);
      avatar = file.path; // ← DÙNG .path
    }
    // Giữ nguyên nếu có avatarKeep
    else if (req.body.avatarKeep === "true") {
      // không đổi
    }
    // Xóa avatar nếu frontend gửi rỗng
    else if (req.body.avatar === "" || req.body.avatar === null) {
      if (user.avatar) await deleteCloudinaryImage(user.avatar);
      avatar = null;
    }

    // CẬP NHẬT CÁC TRƯỜNG KHÁC (không động vào password)
    user.name = req.body.name || user.name;
    user.email = req.body.email || user.email;
    user.address = req.body.address ?? user.address;
    user.birthday = req.body.birthday || user.birthday;
    user.role = req.body.role || user.role;
    user.avatar = avatar;
    user.isBlocked = req.body.isBlocked === "true";
    user.loyalty.points = Number(req.body.loyaltyPoints) || user.loyalty.points;
    user.loyalty.tier = req.body.loyaltyTier || user.loyalty.tier;

    // Chỉ gán password nếu có nhập
    if (req.body.password) {
      user.password = req.body.password;
    }

    await user.save();

    const safe = user.toObject();
    delete safe.password;
    res.json({ success: true, data: safe });
  } catch (err) {
    console.error("updateUser error:", err);
    res.status(500).json({ error: "Lỗi cập nhật user" });
  }
};

// === USER SELF UPDATE (CLIENT) ===
exports.updateMe = async (req, res) => {
  try {
    const user = req.user;

    // === AVATAR ===
    let avatar = user.avatar;
    const file = req.files?.find(f => f.fieldname === "avatar");
    if (file) {
      if (user.avatar) await deleteCloudinaryImage(user.avatar);
      avatar = file.path;
    } else if (req.body.avatar === "") {
      if (user.avatar) await deleteCloudinaryImage(user.avatar);
      avatar = null;
    }

    // === CÁC TRƯỜNG CẬP NHẬT NGAY ===
    const updates = {
      name: req.body.name?.trim() || user.name,
      address: req.body.address?.trim() || user.address,
      birthday: req.body.birthday || user.birthday,
      avatar,
    };

    // === EMAIL MỚI ===
    if (req.body.email && req.body.email !== user.email) {
      const emailExists = await User.findOne({ email: req.body.email });
      if (emailExists) return res.status(400).json({ error: "Email đã được sử dụng" });

      const emailToken = crypto.randomBytes(32).toString("hex");
      const emailTokenExpire = Date.now() + 15 * 60 * 1000;

      user.emailPending = req.body.email;
      user.emailToken = emailToken;
      user.emailTokenExpire = emailTokenExpire;

      const confirmUrl = `${process.env.CLIENT_URL}/confirm-email/${emailToken}`;
      await sendEmail({
        to: req.body.email,
        subject: "Xác nhận thay đổi email - Osso Saigon",
        html: `
          <h3>Xin chào ${user.name},</h3>
          <p>Bạn đã yêu cầu thay đổi email thành: <strong>${req.body.email}</strong></p>
          <p>Nhấn vào nút để xác nhận:</p>
          <a href="${confirmUrl}" style="background:#1677ff;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;">
            Xác nhận Email
          </a>
          <p>Hết hạn sau 15 phút.</p>
        `,
      });
    }

    // === PASSWORD MỚI ===
    if (req.body.password) {
      const passwordToken = crypto.randomBytes(32).toString("hex");
      const passwordTokenExpire = Date.now() + 15 * 60 * 1000;

      user.passwordPending = req.body.password; // lưu tạm (sẽ hash ở pre-save)
      user.passwordToken = passwordToken;
      user.passwordTokenExpire = passwordTokenExpire;

      const confirmUrl = `${process.env.CLIENT_URL}/confirm-password/${passwordToken}`;
      await sendEmail({
        to: user.email,
        subject: "Xác nhận đổi mật khẩu - Osso Saigon",
        html: `
          <h3>Xin chào ${user.name},</h3>
          <p>Bạn đã yêu cầu đổi mật khẩu.</p>
          <p>Nhấn vào nút để xác nhận:</p>
          <a href="${confirmUrl}" style="background:#52c41a;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;">
            Xác nhận Đổi Mật Khẩu
          </a>
          <p>Hết hạn sau 15 phút.</p>
        `,
      });
    }

    // === LƯU CÁC TRƯỜNG KHÔNG CẦN XÁC NHẬN ===
    Object.assign(user, updates);
    await user.save();

    const safe = user.toObject();
    delete safe.password;
    delete safe.emailToken;
    delete safe.passwordToken;
    delete safe.emailPending;
    delete safe.passwordPending;

    res.json({
      success: true,
      data: safe,
      message: req.body.email || req.body.password
        ? "Vui lòng kiểm tra email để xác nhận thay đổi."
        : "Cập nhật thành công!",
    });
  } catch (err) {
    console.error("updateMe error:", err);
    res.status(500).json({ error: "Lỗi cập nhật thông tin" });
  }
};

// XÁC NHẬN EMAIL MỚI
exports.confirmEmailChange = async (req, res) => {
  try {
    const user = await User.findOne({
      emailToken: req.params.token,
      emailTokenExpire: { $gt: Date.now() },
    });

    if (!user) {
      console.warn(`[ConfirmEmail] Token sai hoặc hết hạn: ${req.params.token}`);
      return res.status(400).json({ error: "Xác nhận thành công cho user !" });
    }

    console.log(`[ConfirmEmail] Xác nhận thành công cho user: ${user.email} → ${user.emailPending}`);

    user.email = user.emailPending;
    user.emailPending = undefined;
    user.emailToken = undefined;
    user.emailTokenExpire = undefined;

    await user.save();

    res.json({ success: true, message: "Email đã được cập nhật thành công!" });
  } catch (err) {
    console.error("[ConfirmEmail] Lỗi server:", err);
    res.status(500).json({ error: "Lỗi server." });
  }
};

// XÁC NHẬN MẬT KHẨU MỚI
exports.confirmPasswordChange = async (req, res) => {
  try {
    const user = await User.findOne({
      passwordToken: req.params.token,
      passwordTokenExpire: { $gt: Date.now() },
    });

    if (!user || !user.passwordPending) {
      console.warn(`[ConfirmPassword] Token sai hoặc thiếu passwordPending: ${req.params.token}`);
      return res.status(400).json({ error: "Đổi mật khẩu thành công!" });
    }

    console.log(`[ConfirmPassword] Đổi mật khẩu thành công cho user: ${user.email}`);

    user.password = user.passwordPending;
    user.passwordPending = undefined;
    user.passwordToken = undefined;
    user.passwordTokenExpire = undefined;

    await user.save();

    res.json({ success: true, message: "Mật khẩu đã được thay đổi thành công!" });
  } catch (err) {
    console.error("[ConfirmPassword] Lỗi server:", err);
    res.status(500).json({ error: "Lỗi server." });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "Không tìm thấy user" });

    await deleteCloudinaryImage(user.avatar);
    await user.deleteOne();

    res.json({ success: true });
  } catch (err) {
    console.error("deleteUser error:", err);
    res.status(500).json({ error: "Lỗi xóa user" });
  }
};

/* ----------------
   PASSWORD (admin change)
   ---------------- */
exports.changePassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;
    if (!newPassword) return res.status(400).json({ error: "Chưa nhập mật khẩu mới" });

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: "Không tìm thấy user" });

    user.password = newPassword; // hash in pre save
    await user.save();

    res.json({ success: true, message: "Đổi mật khẩu thành công" });
  } catch (err) {
    console.error("changePassword error:", err);
    res.status(500).json({ error: "Lỗi server" });
  }
};

/* ----------------
   LOYALTY CONFIG + ACTIONS
   - getLoyaltyConfig
   - updateLoyaltyConfig (replace tiers + pointRate) => auto apply to users
   - adjustUserPoints (delta)
   - setUserTier (manual override)
   - getLoyaltyHistory
   ---------------- */

// GET loyalty config
exports.getLoyaltyConfig = async (req, res) => {
  try {
    let cfg = await LoyaltyConfig.findOne();
    if (!cfg) {
      // default config if none
      cfg = {
        tiers: [
          { key: "bronze", name: "Bronze", emoji: "🥉", minPoints: 0 },
          { key: "silver", name: "Silver", emoji: "🥈", minPoints: 5000 },
          { key: "gold", name: "Gold", emoji: "🥇", minPoints: 20000 },
          { key: "diamond", name: "Diamond", emoji: "💎", minPoints: 50000 }
        ],
        pointRate: 10000
      };
    }
    res.json(cfg);
  } catch (err) {
    console.error("getLoyaltyConfig error:", err);
    res.status(500).json({ error: "Lỗi tải cấu hình loyalty" });
  }
};

// UPDATE loyalty config (replace tiers). Auto apply to users (3a behavior).
exports.updateLoyaltyConfig = async (req, res) => {
  try {
    const { tiers, pointRate } = req.body;
    if (!Array.isArray(tiers)) return res.status(400).json({ error: "tiers phải là mảng" });

    // Validate and normalize tiers
    const keys = new Set();
    for (const t of tiers) {
      if (!t.key || !t.name) return res.status(400).json({ error: "Mỗi tier cần key và name" });
      if (keys.has(t.key)) return res.status(400).json({ error: "Key tier bị trùng: " + t.key });
      keys.add(t.key);
      t.minPoints = Number(t.minPoints || 0);
      t.emoji = t.emoji || "";
    }

    // Upsert config
    let cfg = await LoyaltyConfig.findOne();
    if (!cfg) {
      cfg = await LoyaltyConfig.create({ tiers, pointRate: Number(pointRate || 10000) });
    } else {
      cfg.tiers = tiers;
      if (typeof pointRate !== "undefined") cfg.pointRate = Number(pointRate);
      cfg.updatedAt = new Date();
      await cfg.save();
    }

    // Apply to users: bulk update tiers based on current points
    const allUsers = await User.find().select("_id loyalty");
    const bulkOps = [];
    const histories = [];

    for (const u of allUsers) {
      const before = { tier: u.loyalty?.tier || null, points: u.loyalty?.points || 0 };
      const computed = computeTierFromPoints(before.points, tiers);
      const newTier = computed.tier || before.tier;
      if (newTier !== before.tier) {
        bulkOps.push({
          updateOne: {
            filter: { _id: u._id },
            update: { $set: { "loyalty.tier": newTier } }
          }
        });
        histories.push({
          userId: u._id,
          changeType: "apply_config",
          delta: 0,
          before,
          after: { tier: newTier, points: before.points },
          reason: "Auto-apply tier after loyalty config update"
        });
      }
    }

    if (bulkOps.length) await User.bulkWrite(bulkOps);
    if (histories.length) await LoyaltyHistory.insertMany(histories);

    res.json({ success: true, data: cfg, appliedTo: bulkOps.length });
  } catch (err) {
    console.error("updateLoyaltyConfig error:", err);
    res.status(500).json({ error: "Lỗi cập nhật cấu hình loyalty" });
  }
};

// Adjust user points (increment or decrement) and recompute tier
// body: { delta: 100, reason: "bonus" }
exports.adjustUserPoints = async (req, res) => {
  try {
    const { id } = req.params;
    const { delta = 0, reason = "Admin adjustment" } = req.body;
    const numDelta = Number(delta);
    if (isNaN(numDelta)) return res.status(400).json({ error: "delta không hợp lệ" });

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: "User không tồn tại" });

    const cfg = await LoyaltyConfig.findOne();
    const tiers = (cfg && cfg.tiers) || [];

    const before = { tier: user.loyalty?.tier || null, points: user.loyalty?.points || 0 };
    const newPoints = Math.max(0, before.points + numDelta);
    user.loyalty.points = newPoints;

    const computed = computeTierFromPoints(newPoints, tiers);
    const newTier = computed.tier || before.tier;
    user.loyalty.tier = newTier;

    await user.save();

    await LoyaltyHistory.create({
      userId: user._id,
      changeType: "points_adjust",
      delta: numDelta,
      before,
      after: { tier: newTier, points: newPoints },
      reason
    });

    res.json({ success: true, data: user });
  } catch (err) {
    console.error("adjustUserPoints error:", err);
    res.status(500).json({ error: "Lỗi điều chỉnh điểm" });
  }
};

// Manually set user tier
// body: { tier: "silver", reason: "manual override" }
exports.setUserTier = async (req, res) => {
  try {
    const { id } = req.params;
    const { tier, reason = "Manual tier change" } = req.body;
    if (!tier) return res.status(400).json({ error: "Thiếu tier" });

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: "User không tồn tại" });

    const before = { tier: user.loyalty?.tier || null, points: user.loyalty?.points || 0 };
    user.loyalty.tier = tier;
    await user.save();

    await LoyaltyHistory.create({
      userId: user._id,
      changeType: "tier_change",
      delta: 0,
      before,
      after: { tier: user.loyalty.tier, points: user.loyalty.points },
      reason
    });

    res.json({ success: true, data: user });
  } catch (err) {
    console.error("setUserTier error:", err);
    res.status(500).json({ error: "Lỗi set tier" });
  }
};

// Get loyalty history (optional filter by userId)
exports.getLoyaltyHistory = async (req, res) => {
  try {
    const { userId } = req.query;
    const q = {};
    if (userId) q.userId = userId;
    const rows = await LoyaltyHistory.find(q).sort({ createdAt: -1 }).limit(500);
    res.json(rows);
  } catch (err) {
    console.error("getLoyaltyHistory error:", err);
    res.status(500).json({ error: "Lỗi tải lịch sử" });
  }
};
