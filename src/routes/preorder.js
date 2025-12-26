const express = require("express");
const router = express.Router();
const { createPreorder, exportPreorders } = require("../controllers/preorderController");
const { apiProtect } = require("../middlewares/auth");
const Preorder = require("../models/Preorder");

router.post("/", apiProtect, createPreorder);

router.get("/my", apiProtect, async (req, res) => {
  try {
    const preorders = await Preorder.find({
      "user.email": req.user.email,
    })
      .populate("productId", "name images")
      .sort({ createdAt: -1 });

    res.json(preorders);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});
router.patch("/:id/contacted", apiProtect, async (req, res) => {
  try {
    const preorder = await Preorder.findById(req.params.id);
    if (!preorder) return res.sendStatus(404);

    preorder.contacted = !preorder.contacted;
    await preorder.save();

    res.json({ contacted: preorder.contacted });
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

router.get("/export", apiProtect, exportPreorders);

module.exports = router;
