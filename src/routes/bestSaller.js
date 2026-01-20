const express = require("express");
const router = express.Router();
const controller = require("../controllers/bestSallerController");

router.get("/", controller.getBestSeller);          // FE
router.post("/", controller.saveBestSeller);        // Admin save
router.put("/reorder", controller.reorderProducts); // kéo thả
router.delete("/remove/:productId", controller.removeProduct);

module.exports = router;
