const express = require("express");
const router = express.Router();
const shippingController = require("../controllers/shippingController");
const { protect, adminAuth } = require("../middlewares/auth");

router.get("/", protect, adminAuth, shippingController.getShipping);
router.post("/", protect, adminAuth, shippingController.createShipping);
router.delete("/:id", protect, adminAuth, shippingController.deleteShipping);

module.exports = router;
