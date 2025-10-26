// src/routes/products.js
const express = require("express");
const router = express.Router();

const upload = require("../middlewares/uploadImagesCloudinary"); // ĐÚNG
const uploadCSV = require("../middlewares/upload");

const productController = require("../controllers/productController");

// === LOG DEBUG (XÓA SAU KHI OK) ===
console.log("upload type:", typeof upload); // PHẢI IN: function

router.get("/", productController.getAllProducts);
router.get("/:id", productController.getProductById);
router.post("/", upload, productController.createProduct); // DÒNG 15
router.put("/:id", upload, productController.updateProduct);
router.delete("/:id", productController.deleteProduct);
router.post("/import", uploadCSV.single("csvFile"), productController.importProducts);

module.exports = router;