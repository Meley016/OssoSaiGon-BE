const express = require("express");
const router = express.Router();
const upload = require("../middlewares/uploadImagesCloudinary");
const uploadCSV = require("../middlewares/upload");
const { protect, requireRole } = require("../middlewares/auth");
const productController = require("../controllers/productController");

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
router.post("/delete-multiple", apiProtect, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: "Chưa có sản phẩm nào để xóa" });

    await Product.deleteMany({ _id: { $in: ids } });

    res.json({ success: true, deletedCount: ids.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi server khi xóa nhiều sản phẩm" });
  }
});

router.delete(
  "/:id",
  protect,
  requireRole("productAdder", "admin"),
  productController.deleteProduct
);

module.exports = router;
