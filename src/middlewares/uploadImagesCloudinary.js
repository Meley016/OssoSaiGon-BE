const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    let folder = "osso/products";
    if (file.fieldname === "avatar") {
      folder = "osso/users/avatars";
    } else if (file.fieldname.includes("variantImageFile")) {
      folder = "osso/products/variants";
    }

    return {
      folder,
      resource_type: "image",
      public_id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
  }
});

// ✅ avatar đổi đúng field
const fields = [{ name: "avatar", maxCount: 1 }];

// ✅ giữ nguyên variant
for (let i = 0; i < 20; i++) {
  fields.push({ name: `variantImageFile[${i}][]`, maxCount: 6 });
}

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Chỉ chấp nhận ảnh: jpg, jpeg, png, webp"));
  }
}).fields(fields);

module.exports = upload;
