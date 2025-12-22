const express = require("express");
const router = express.Router();

const Order = require("../models/Order");
const Preorder = require("../models/Preorder");

router.get("/unseen-count", async (req, res) => {
  try {
    const [orderUnseen, preorderUnseen] = await Promise.all([
      Order.countDocuments({ isSeen: false }),  
      Preorder.countDocuments({ isSeen: false })
    ]);

    const total = orderUnseen + preorderUnseen;

    res.json({
      order: orderUnseen,
      preorder: preorderUnseen,
      total
    });
  } catch (err) {
    console.error("unseen-count error:", err);
    res.status(500).json({ total: 0 });
  }
});

module.exports = router;
