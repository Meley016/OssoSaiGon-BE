const express = require("express");
const router = express.Router();
const blogCtrl = require("../controllers/blogController");
const upload = require("../middlewares/uploadImagesCloudinary");
const { protect, apiProtect, requireRole } = require("../middlewares/auth");
const Blog = require("../models/Blog");

router.get("/", blogCtrl.getBlogs); // public
router.post("/", protect, requireRole("writer", "admin"), upload, blogCtrl.createBlog);
router.put("/:id", protect, requireRole("writer", "admin"), upload, blogCtrl.updateBlog);
router.delete("/:id", protect, requireRole("writer", "admin"), blogCtrl.deleteBlog);
router.get("/:id", async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) return res.status(404).json({ error: "Không tìm thấy bài viết" });
    res.json(blog);
  } catch (err) {
    console.error("❌ Lỗi lấy bài viết:", err);
    res.status(500).json({ error: "Lỗi khi tải bài viết" });
  }
});

router.get("/interactions/:id", apiProtect, async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id)
      .populate("likes", "name email") // ✅ hiển thị thêm thông tin người đã like
      .lean();

    if (!blog) {
      return res.status(404).json({ error: "Không tìm thấy bài viết" });
    }

    res.json({
      likes: blog.likes || [],
      comments: blog.comments || [],
    });
  } catch (err) {
    console.error("❌ Lỗi lấy tương tác:", err);
    res.status(500).json({ error: "Không thể tải tương tác" });
  }
});



// ==================================================
// 🔹 Like / Unlike bài viết (toggle)
// ==================================================
router.post("/like/:id", apiProtect, async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) {
      return res.status(404).json({ error: "Không tìm thấy bài viết" });
    }

    // Đảm bảo likes luôn là mảng
    if (!Array.isArray(blog.likes)) {
      blog.likes = [];
    }

    const userId = req.user._id.toString();
    const index = blog.likes.findIndex((id) => id.toString() === userId);

    if (index === -1) {
      blog.likes.push(req.user._id); // ✅ Like
    } else {
      blog.likes.splice(index, 1); // ✅ Unlike
    }

    await blog.save();

    res.json({
      likes: blog.likes,
      likedByUser: index === -1, // để FE biết người dùng vừa like hay unlike
      count: blog.likes.length,
    });
  } catch (err) {
    console.error("❌ Lỗi like:", err);
    res.status(500).json({ error: "Không thể like bài viết" });
  }
});

// 🔹 Gửi bình luận
router.post("/comment/:id", apiProtect, async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Nội dung bình luận không được để trống" });
    }

    const blog = await Blog.findById(req.params.id);
    if (!blog) {
      return res.status(404).json({ error: "Không tìm thấy bài viết" });
    }

    blog.comments.push({
      user: req.user.name || req.user.email,
      text: text.trim(),
      createdAt: new Date(),
    });

    await blog.save();

    res.json({
      message: "Đã thêm bình luận",
      comments: blog.comments,
      count: blog.comments.length,
    });
  } catch (err) {
    console.error("❌ Lỗi comment:", err);
    res.status(500).json({ error: "Không thể bình luận" });
  }
});
module.exports = router;
