const Blog = require("../models/Blog");
const cloudinary = require("../config/cloudinary");

// 📜 Lấy tất cả bài viết
exports.getBlogs = async (req, res) => {
  try {
    const blogs = await Blog.find().sort({ createdAt: -1 });
    res.json(blogs);
  } catch (err) {
    console.error("❌ Lỗi getBlogs:", err);
    res.status(500).json({ error: "Không thể tải danh sách bài viết" });
  }
};

// ➕ Tạo bài viết mới
exports.createBlog = async (req, res) => {
  try {
    const { title, content } = req.body;
    if (!title || !content)
      return res.status(400).json({ error: "Thiếu tiêu đề hoặc nội dung" });

    let images = [];
    if (req.files && req.files.length > 0) {
      const imageFiles = req.files.filter(f => f.fieldname === "blogImages");
      images = imageFiles.map(f => f.path);
    }

    const blog = new Blog({ title, content, images });
    await blog.save();

    res.status(201).json({ success: true, message: "Tạo bài viết thành công", blog });
  } catch (err) {
    console.error("❌ Lỗi createBlog:", err);
    res.status(500).json({ error: "Không thể tạo bài viết" });
  }
};

// ✏️ Cập nhật bài viết
exports.updateBlog = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content } = req.body;

    const blog = await Blog.findById(id);
    if (!blog) return res.status(404).json({ error: "Không tìm thấy bài viết" });

    blog.title = title || blog.title;
    blog.content = content || blog.content;

    // 🧹 Nếu có ảnh mới, xóa ảnh cũ
    if (req.files && req.files.length > 0) {
      if (blog.images && blog.images.length > 0) {
        for (const img of blog.images) {
          const publicId = img.split("/").pop().split(".")[0];
          await cloudinary.uploader.destroy(`osso/blogs/${publicId}`).catch(() => {});
        }
      }
      const newImgs = req.files.filter(f => f.fieldname === "blogImages").map(f => f.path);
      blog.images = newImgs;
    }

    await blog.save();
    res.json({ success: true, message: "Cập nhật thành công", blog });
  } catch (err) {
    console.error("❌ Lỗi updateBlog:", err);
    res.status(500).json({ error: "Không thể cập nhật bài viết" });
  }
};

// 🗑️ Xóa bài viết
exports.deleteBlog = async (req, res) => {
  try {
    const { id } = req.params;
    const blog = await Blog.findByIdAndDelete(id);
    if (!blog) return res.status(404).json({ error: "Không tìm thấy bài viết" });

    if (blog.images && blog.images.length > 0) {
      for (const img of blog.images) {
        const publicId = img.split("/").pop().split(".")[0];
        await cloudinary.uploader.destroy(`osso/blogs/${publicId}`).catch(() => {});
      }
    }

    res.json({ success: true, message: "Đã xóa bài viết" });
  } catch (err) {
    console.error("❌ Lỗi deleteBlog:", err);
    res.status(500).json({ error: "Không thể xóa bài viết" });
  }
};
