// src/routes/promotions.js
const express = require("express");
const router = express.Router();
const promoCtrl = require("../controllers/promotionController");
const { protect, adminAuth, apiProtect } = require("../middlewares/auth");

router.get("/", protect, adminAuth, promoCtrl.listPromotions);
router.get("/:id", protect, adminAuth, promoCtrl.getPromotion);
router.post("/", protect, adminAuth, promoCtrl.createPromotion);
router.put("/:id", protect, adminAuth, promoCtrl.updatePromotion);
router.delete("/:id", protect, adminAuth, promoCtrl.deletePromotion);
router.patch("/:id/toggle", protect, adminAuth, promoCtrl.togglePromotion);
router.post("/apply", apiProtect, promoCtrl.applyPromotion);

module.exports = router;