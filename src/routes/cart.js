// ✅ Thêm import middleware
const { apiProtect } = require("../middlewares/auth");

const express = require("express");
const router = express.Router();
const cartCtrl = require("../controllers/cartController");

// ✅ Áp dụng middleware apiProtect cho tất cả route giỏ hàng
router.get("/", apiProtect, cartCtrl.getCart);
router.post("/add", apiProtect, cartCtrl.addToCart);
router.put("/update", apiProtect, cartCtrl.updateCartItem);
router.delete("/:sku", apiProtect, cartCtrl.removeItem);
router.delete("/clear", apiProtect, cartCtrl.clearCart);

module.exports = router;
