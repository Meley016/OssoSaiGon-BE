const express = require("express");
const router = express.Router();
const { createPreorder } = require("../controllers/preorderController");
const { apiProtect } = require("../middlewares/auth");

router.post("/", apiProtect, createPreorder);

module.exports = router;
