// routes/sizes.js
const express = require("express");
const router = express.Router();
const sizeController = require("../controllers/sizeController");

// GET
router.get("/", sizeController.getAllSizes);

// CRUD
router.post("/", sizeController.createSize);
router.put("/:id", sizeController.updateSize);
router.delete("/:id", sizeController.deleteSize);

module.exports = router;