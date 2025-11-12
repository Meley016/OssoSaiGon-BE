const express = require("express");
const router = express.Router();
const footerCtrl = require("../controllers/footerController");
const { protect, requireRole } = require("../middlewares/auth");

// 🟣 Public routes (client)
router.get("/:type", footerCtrl.getFooterInfo); 
// type = shipping | returns | terms | privacy

// 🔐 Admin routes
router.post("/:type", protect, requireRole("admin"), footerCtrl.upsertFooterInfo);
router.put("/:type", protect, requireRole("admin"), footerCtrl.upsertFooterInfo);

module.exports = router;
