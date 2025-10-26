// src/middlewares/upload.js
const multer = require("multer");
const path = require("path");

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    console.log("Multer received file:", file.originalname, file.mimetype); // Debug
    const ext = path.extname(file.originalname).toLowerCase();
    if ([".csv", ".xlsx", ".xls"].includes(ext)) {
      return cb(null, true);
    }
    cb(new Error("Chỉ chấp nhận .csv, .xlsx, .xls"));
  }
});

module.exports = upload;