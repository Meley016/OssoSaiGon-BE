const express = require("express");
const router = express.Router();
const upload = require("../middlewares/uploadImagesCloudinary");
const bannerCtrl = require("../controllers/bannerController");
const { protect, requireRole } = require("../middlewares/auth");

router.get("/active", bannerCtrl.getActive); // public

router.get("/", protect, requireRole("admin"), bannerCtrl.getAll);
router.post("/", protect, requireRole("admin"), upload, bannerCtrl.create);
router.put("/:id", protect, requireRole("admin"), upload, bannerCtrl.update);
router.delete("/:id", protect, requireRole("admin"), bannerCtrl.remove);

module.exports = router;
