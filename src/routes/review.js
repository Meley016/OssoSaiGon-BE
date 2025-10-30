const express = require("express");
const router = express.Router();
const { apiProtect } = require("../middlewares/auth");
const { getReviews, addReview } = require("../controllers/reviewController");

router.get("/:productId", getReviews);
router.post("/:productId", apiProtect, addReview);

module.exports = router;
