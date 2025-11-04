const express = require("express");
const router = express.Router();
const promoCtrl = require("../controllers/promotionController");
const { protect, requireRole, apiProtect } = require("../middlewares/auth");

router.get("/", promoCtrl.listPromotions);
router.get("/:id", promoCtrl.getPromotion);
router.post("/", protect, requireRole("admin"), promoCtrl.createPromotion);
router.put("/:id", protect, requireRole("admin"), promoCtrl.updatePromotion);
router.delete("/:id", protect, requireRole("admin"), promoCtrl.deletePromotion);
router.patch("/:id/toggle", protect, requireRole("admin"), promoCtrl.togglePromotion);
router.post("/apply", apiProtect, promoCtrl.applyPromotion);

module.exports = router;
