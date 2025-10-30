// routes/categories.js
const express = require("express");
const router = express.Router();
const categoryController = require("../controllers/categoryController");
const upload = require("../middlewares/uploadImagesCloudinary");
// GET
router.get("/", categoryController.getAllCategories);
router.get("/:id", categoryController.getCategoryById);
// CRUD
router.post("/", upload, categoryController.createCategory);
router.put("/:id", upload, categoryController.updateCategory);
router.delete("/:id", categoryController.deleteCategory);
router.get("/check/:id", async (req, res) => {
  try {
    const count = await Product.countDocuments({ category: req.params.id });
    res.json({ hasProducts: count > 0 });
  } catch (err) {
    console.error("Lỗi kiểm tra danh mục:", err);
    res.status(500).json({ error: "Lỗi kiểm tra danh mục" });
  }
});
module.exports = router;