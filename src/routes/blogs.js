const express = require("express");
const router = express.Router();
const blogCtrl = require("../controllers/blogController");
const upload = require("../middlewares/uploadImagesCloudinary"); // dùng .any() như bạn có

// CRUD
router.get("/", blogCtrl.getBlogs);
router.post("/", upload, blogCtrl.createBlog);
router.put("/:id", upload, blogCtrl.updateBlog);
router.delete("/:id", blogCtrl.deleteBlog);

module.exports = router;
