// routes/wishlist.js
const express = require("express");
const { apiProtect } = require("../middlewares/auth");
const Wishlist = require("../models/Wishlist");

const router = express.Router();

/**
 * 🟢 Lấy toàn bộ danh sách wishlist của user
 */
router.get("/", apiProtect, async (req, res) => {
  try {
    const lists = await Wishlist.find({ user: req.user._id })
      .populate({
        path: "items.product",
        select: "name variants",
        populate: [
          { path: "variants.color", select: "name code" },
          { path: "variants.size", select: "name" },
        ],
      })
      .sort({ updatedAt: -1 });

    res.json({ apiProtect: true, lists });
  } catch (err) {
    console.error("❌ Error fetching Wishlist lists:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/remove", apiProtect, async (req, res) => {
  try {
    const { productId } = req.body;
    if (!productId) return res.status(400).json({ message: "Thiếu productId" });

    const lists = await Wishlist.find({ user: req.user._id });
    for (const list of lists) {
      list.items = list.items.filter(i => i.product.toString() !== productId);
      await list.save();
    }

    res.json({ success: true, message: "Đã xóa sản phẩm khỏi wishlist" });
  } catch (err) {
    console.error("❌ Lỗi xóa wishlist:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/check", apiProtect, async (req, res) => {
  try {
    const { productId } = req.body;
    if (!productId) return res.status(400).json({ message: "Thiếu productId" });

    const exists = await Wishlist.findOne({
      user: req.user._id,
      "items.product": productId,
    });

    res.json({ isWishlisted: !!exists });
  } catch (err) {
    console.error("❌ Lỗi check wishlist:", err);
    res.status(500).json({ message: "Server error" });
  }
});
/**
 * 🟢 Tạo list mới
 */
router.post("/create", apiProtect, async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: "Tên danh sách là bắt buộc" });

    const list = await Wishlist.create({
      user: req.user._id,
      name: name.trim(),
      description,
      items: [],
    });

    res.json({ apiProtect: true, list });
  } catch (err) {
    console.error("❌ Error creating wishlist list:", err);
    if (err.code === 11000) {
      return res.status(400).json({ message: "Tên list đã tồn tại" });
    }
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * 🟢 Thêm hoặc gỡ sản phẩm khỏi 1 list
 */
router.post("/:listId/toggle", apiProtect, async (req, res) => {
  try {
    const { productId } = req.body;
    if (!productId) return res.status(400).json({ message: "Thiếu productId" });

    const list = await Wishlist.findOne({ _id: req.params.listId, user: req.user._id });
    if (!list) return res.status(404).json({ message: "List không tồn tại" });

    const index = list.items.findIndex(i => i.product.toString() === productId);
    let action;

    if (index >= 0) {
      list.items.splice(index, 1);
      action = "removed";
    } else {
      list.items.push({ product: productId });
      action = "added";
    }

    await list.save();

    // POPULATE ĐẦY ĐỦ
    const populated = await Wishlist.findById(list._id)
      .populate({
        path: "items.product",
        select: "name variants",
        populate: [
          { path: "variants.color", select: "name code" },
          { path: "variants.size", select: "name" },
        ],
      });

    res.json({ success: true, action, list: populated });
  } catch (err) {
    console.error("Error toggling product:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * 🟢 Xóa 1 list
 */
router.delete("/:listId", apiProtect, async (req, res) => {
  try {
    const deleted = await Wishlist.findOneAndDelete({
      _id: req.params.listId,
      user: req.user._id,
    });
    if (!deleted) return res.status(404).json({ message: "List không tồn tại" });
    res.json({ apiProtect: true, message: "Đã xóa list" });
  } catch (err) {
    console.error("❌ Error deleting wishlist list:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.patch("/:listId", apiProtect, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: "Tên không hợp lệ" });

    const list = await Wishlist.findOneAndUpdate(
      { _id: req.params.listId, user: req.user._id },
      { name: name.trim() },
      { new: true }
    );

    if (!list) return res.status(404).json({ message: "List không tồn tại" });

    res.json({ success: true, list });
  } catch (err) {
    console.error("Lỗi rename wishlist:", err);
    if (err.code === 11000) {
      return res.status(400).json({ message: "Tên list đã tồn tại" });
    }
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
