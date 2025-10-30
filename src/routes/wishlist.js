// routes/wishlist.js

const express = require("express");
const { apiProtect } = require("../middlewares/auth");
const Wishlist = require("../models/Wishlist");

const router = express.Router();

// 🟢 Check product in wishlist
router.post("/check", apiProtect, async (req, res) => {
  try {
    const { productId } = req.body;
    const exists = await Wishlist.findOne({ user: req.user._id, product: productId });
    res.json({ apiProtect: true, isWishlisted: !!exists });
  } catch (err) {
    console.error("❌ Error checking wishlist:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// 🟢 Toggle wishlist
router.post("/toggle", apiProtect, async (req, res) => {
  try {
    const { productId } = req.body;
    const existing = await Wishlist.findOne({ user: req.user._id, product: productId });

    if (existing) {
      await existing.deleteOne();
      return res.json({ apiProtect: true, isWishlisted: false });
    } else {
      await Wishlist.create({ user: req.user._id, product: productId });
      return res.json({ apiProtect: true, isWishlisted: true });
    }
  } catch (err) {
    console.error("❌ Error toggling wishlist:", err);
    res.status(500).json({ message: "Server error" });
  }
});
// 🟢 Get all wishlist items
router.get("/", apiProtect, async (req, res) => {
  try {
    const items = await Wishlist.find({ user: req.user._id }).populate("product");
    res.json({ apiProtect: true, items });
  } catch (err) {
    console.error("❌ Error fetching wishlist:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
