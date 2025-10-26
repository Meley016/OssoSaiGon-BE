// testCloudinary.js
const cloudinary = require("./config/cloudinary");
const path = require("path");

// Chuyển đường dẫn tương đối thành tuyệt đối
const imagePath = path.resolve(__dirname, "src/public/imgs/logo.png");

cloudinary.uploader.upload(
  imagePath,
  { folder: "osso/test" },
  (err, result) => {
    if (err) {
      console.error("Cloudinary upload error:", err);
    } else {
      console.log("Upload success:", result);
    }
  }
);