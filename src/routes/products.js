const express = require("express");
const router = express.Router();
const upload = require("../middlewares/uploadImagesCloudinary");
const uploadCSV = require("../middlewares/upload");
const { protect, requireRole } = require("../middlewares/auth");
const productController = require("../controllers/productController");


router.get(
  "/by-categories",
  productController.getProductsByCategories
);
router.get("/by-brand", productController.getProductsByBrand);

router.get(
  "/categories-by-brand",
  productController.getCategoriesByBrand
);
router.get(
  "/colors-by-brand-category",
  productController.getColorsByBrandCategory
);
router.get("/brands", productController.getAllBrands);
router.get("/filter", productController.filterProducts);

router.get("/search", productController.searchProducts);
router.get("/", productController.getAllProducts);

router.get("/:id", productController.getProductById);

router.post("/", protect, requireRole("productAdder", "admin"), upload, productController.createProduct);
router.put("/:id", protect, requireRole("productAdder", "admin"), upload, productController.updateProduct);
router.delete("/:id", protect, requireRole("productAdder", "admin"), productController.deleteProduct);
router.post("/import", protect, requireRole("productAdder", "admin"), uploadCSV.single("csvFile"), productController.importProducts);

module.exports = router;
