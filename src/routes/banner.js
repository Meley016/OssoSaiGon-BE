const express = require("express");
const router = express.Router();
const upload = require("../middlewares/uploadImagesCloudinary");
const bannerCtrl = require("../controllers/bannerController");
const { protect, adminAuth } = require("../middlewares/auth");

// Cho admin
router.get("/", protect, adminAuth, bannerCtrl.getAll);
router.post("/", protect, adminAuth, upload, bannerCtrl.create);
router.put("/:id", protect, adminAuth, upload, bannerCtrl.update);
router.delete("/:id", protect, adminAuth, bannerCtrl.remove);

// Cho client
router.get("/active", bannerCtrl.getActive);

module.exports = router;
