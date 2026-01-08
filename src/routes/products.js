const express = require("express");
const router = express.Router();
const upload = require("../middlewares/uploadImagesCloudinary");
const uploadCSV = require("../middlewares/upload");
const { protect, requireRole } = require("../middlewares/auth");
const productController = require("../controllers/productController");
const Product = require("../models/Product");


// ===== EXPORT / IMPORT =====
router.get(
  "/export",
  protect,
  requireRole("productAdder", "admin"),
  productController.exportProducts
);

router.post(
  "/import",
  protect,
  requireRole("productAdder", "admin"),
  uploadCSV.single("csvFile"),
  productController.importProducts
);

// ===== FILTER / QUERY =====
router.get("/facets", productController.getProductFacets);
router.get("/advanced", productController.getAllProductsAdvanced);
router.get("/by-categories", productController.getProductsByCategories);
router.get("/by-brand", productController.getProductsByBrand);
router.get("/categories-by-brand", productController.getCategoriesByBrand);
router.get("/colors-by-brand-category", productController.getColorsByBrandCategory);
router.get("/brands", productController.getAllBrands);
router.get("/filter", productController.filterProducts);
router.get("/search", productController.searchProducts);

// ===== BASE =====
router.get("/", productController.getAllProducts);

// ⚠️ LUÔN ĐẶT CUỐI
router.get("/:id", productController.getProductById);

// ===== CRUD =====
router.post(
  "/",
  protect,
  requireRole("productAdder", "admin"),
  upload,
  productController.createProduct
);

router.put(
  "/:id",
  protect,
  requireRole("productAdder", "admin"),
  upload,
  productController.updateProduct
);

router.post(
  "/delete-multiple",
  protect,
  requireRole("productAdder", "admin"),
  productController.deleteMultipleProducts
);

module.exports = router;
