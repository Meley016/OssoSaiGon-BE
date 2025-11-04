const express = require("express");
const router = express.Router();
const sizeController = require("../controllers/sizeController");
const { protect, requireRole } = require("../middlewares/auth");

router.get("/", sizeController.getAllSizes);
router.post("/", protect, requireRole("productAdder", "admin"), sizeController.createSize);
router.put("/:id", protect, requireRole("productAdder", "admin"), sizeController.updateSize);
router.delete("/:id", protect, requireRole("productAdder", "admin"), sizeController.deleteSize);

module.exports = router;
