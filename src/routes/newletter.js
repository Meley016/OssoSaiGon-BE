// routes/newsletter.js
const express = require("express");
const router = express.Router();
const {
  submitNewsletter,
  filterNewsletter,
  exportNewsletter,
  markRead,
} = require("../controllers/newsletterController");

router.post("/", submitNewsletter);
router.get("/filter", filterNewsletter);
router.get("/export", exportNewsletter);
router.patch("/:id/read", markRead);

module.exports = router;
