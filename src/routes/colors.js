// routes/colors.js
const express = require("express");
const router = express.Router();
const colorController = require("../controllers/colorController");

// GET
router.get("/", colorController.getAllColors);

// CRUD
router.post("/", colorController.createColor);
router.put("/:id", colorController.updateColor);
router.delete("/:id", colorController.deleteColor);

module.exports = router;