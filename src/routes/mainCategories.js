const express = require("express");
const router = express.Router();
const mainCategoryController = require("../controllers/mainCategoryController");
const upload = require("../middlewares/uploadImagesCloudinary");
const { protect, requireRole } = require("../middlewares/auth");

// 🟢 CRUD cơ bản
router.get("/", mainCategoryController.getAllMainCategories);
router.get("/:id", mainCategoryController.getMainCategoryById);
router.post("/", protect, requireRole("productAdder", "admin"), upload, mainCategoryController.createMainCategory);
router.put("/:id", protect, requireRole("productAdder", "admin"), upload, mainCategoryController.updateMainCategory);
router.delete("/:id", protect, requireRole("productAdder", "admin"), mainCategoryController.deleteMainCategory);

// 🧭 Gắn Category con
router.post("/assign", protect, requireRole("productAdder", "admin"), mainCategoryController.assignCategoryToMain);

module.exports = router;
