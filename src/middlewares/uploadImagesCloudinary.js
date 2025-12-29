const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    let folder = "oso/products";
    let public_id = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // ✅ Avatar người dùng
    if (file.fieldname === "avatar") {
      folder = "oso/users/avatars";
    }

    // ✅ Ảnh variant của sản phẩm
    else if (file.fieldname.includes("variantImageFile")) {
      const productName = req.body.name || req.body.SKU || "unknown";
      const safeName = productName.replace(/[^a-z0-9]/gi, "_").toLowerCase();
      folder = `oso/products/${safeName}`;
    }

    // ✅ Ảnh danh mục
    else if (file.fieldname === "categoryImage") {
      folder = "oso/categories";
    }

    // ✅ Ảnh blog
    else if (file.fieldname === "blogImages") {
      folder = "oso/blogs";
    }
    else if (file.fieldname === "quillImage") {
      folder = "oso/blogs/content";
    }

    // ✅ Ảnh banner
    else if (file.fieldname === "bannerImage") {
      folder = "oso/banners";
    }

    // ✅ Ảnh logo
    else if (file.fieldname === "logoImage") {
      folder = "oso/logos";
    }

    return {
      folder,
      resource_type: "image",
      public_id,
    };
  },
});

// ✅ Khai báo các field upload
const fields = [{ name: "avatar", maxCount: 1 }];

// ✅ Ảnh variant (20 variants, mỗi variant tối đa 6 ảnh)
for (let i = 0; i < 20; i++) {
  fields.push({ name: `variantImageFile[${i}]`, maxCount: 6 });
}

// ✅ Các loại ảnh khác
fields.push({ name: "categoryImage", maxCount: 1 });
fields.push({ name: "bannerImage", maxCount: 1 });
fields.push({ name: "logoImage", maxCount: 1 });
fields.push({ name: "blogImages", maxCount: 10 });

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Chỉ chấp nhận ảnh: jpg, jpeg, png, webp"));
  },
}).any();

module.exports = upload;
