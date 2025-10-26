// src/routes/api/promotions.js
const express = require("express");
const router = express.Router();
const promoCtrl = require("../controllers/promotionController");
const { protect, adminAuth } = require("../middlewares/auth");

router.get("/", protect, adminAuth, promoCtrl.getPromotions);
router.post("/", protect, adminAuth, promoCtrl.createPromotion);
router.put("/:id", protect, adminAuth, promoCtrl.updatePromotion);
router.delete("/:id", protect, adminAuth, promoCtrl.deletePromotion);

module.exports = router;
