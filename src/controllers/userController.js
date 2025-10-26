/// src/controllers/userController.js
const { User, LoyaltyConfig, LoyaltyHistory } = require("../models/User");
const cloudinary = require("../config/cloudinary");
const bcrypt = require("bcryptjs");

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

// CREATE USER
exports.createUser = async (req, res) => {
  try {
    let avatar = req.body.avatar;
    if (req.files?.avatar?.length) {
      avatar = req.files.avatar[0].path;
    }

    const { email, password, name, role, address, birthday } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Thiếu email hoặc mật khẩu" });

    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ error: "Email đã tồn tại" });

    const user = await User.create({
      email,
      password,
      name,
      role: role || "user",
      address,
      birthday,
      avatar,
      loyalty: { points: Number(req.body.loyaltyPoints || 0), tier: req.body.loyaltyTier || null },
      isBlocked: req.body.isBlocked === "true"
    });

    const safe = user.toObject();
    delete safe.password;
    res.status(201).json(safe);
  } catch (err) {
    console.error("createUser error:", err);
    res.status(500).json({ error: "Lỗi tạo user" });
  }
};

// UPDATE user
exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: "Không tìm thấy user" });

    let avatar = user.avatar;
    if (req.files?.avatar?.length) {
      await deleteCloudinaryImage(user.avatar);
      avatar = req.files.avatar[0].path;
    }

    Object.assign(user, req.body, {
      avatar,
      loyalty: {
        points: Number(req.body.loyaltyPoints) || 0,
        tier: req.body.loyaltyTier || user.loyalty.tier
      },
      isBlocked: req.body.isBlocked === "true"
    });

    if (!req.body.password) delete user.password;

    await user.save();

    const safe = user.toObject();
    delete safe.password;
    res.json({ success: true, data: safe });
  } catch (err) {
    console.error("updateUser error:", err);
    res.status(500).json({ error: "Lỗi cập nhật user" });
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
