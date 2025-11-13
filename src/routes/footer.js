//routes/footer
const express = require("express");
const router = express.Router();
const footerCtrl = require("../controllers/footerController");
const { protect, requireRole } = require("../middlewares/auth");

// 🟣 Public routes (client)
router.get("/:type/:lang", footerCtrl.getFooterInfo);
// type = shipping | returns | terms | privacy

// 🔐 Admin routes
router.post("/:type/:lang", protect, requireRole("admin"), footerCtrl.upsertFooterInfo);
router.put("/:type/:lang", protect, requireRole("admin"), footerCtrl.upsertFooterInfo);

// Render admin footer management page
router.get("/", protect, requireRole("admin"), async (req, res, next) => {
  try {
    // Lấy tất cả footer từ DB
    const footer = await footerCtrl.getAllFooters();
    res.render("admin/footer", { footer });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
