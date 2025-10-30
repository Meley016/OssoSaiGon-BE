// src/routes/products.js
const express = require("express");
const router = express.Router();

const upload = require("../middlewares/uploadImagesCloudinary"); 
const uploadCSV = require("../middlewares/upload");

const productController = require("../controllers/productController");

console.log("upload type:", typeof upload); 

router.get("/", productController.getAllProducts);
router.get("/:id", productController.getProductById);
router.post("/", upload, productController.createProduct); 
router.put("/:id", upload, productController.updateProduct);
router.delete("/:id", productController.deleteProduct);
router.post("/import", uploadCSV.single("csvFile"), productController.importProducts);

module.exports = router;