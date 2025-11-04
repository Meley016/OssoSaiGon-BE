const express = require("express");
const router = express.Router();
const colorController = require("../controllers/colorController");
const { protect, requireRole } = require("../middlewares/auth");

router.get("/", colorController.getAllColors);
router.post("/", protect, requireRole("productAdder", "admin"), colorController.createColor);
router.put("/:id", protect, requireRole("productAdder", "admin"), colorController.updateColor);
router.delete("/:id", protect, requireRole("productAdder", "admin"), colorController.deleteColor);

module.exports = router;
