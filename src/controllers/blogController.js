const Blog = require("../models/Blog");
const cloudinary = require("../config/cloudinary");

// Lấy tất cả bài viết (giữ nguyên, public)
exports.getBlogs = async (req, res) => {
  try {
    const blogs = await Blog.find().sort({ createdAt: -1 });
    res.json(blogs);
  } catch (err) {
    console.error("❌ Lỗi getBlogs:", err);
    res.status(500).json({ error: "Không thể tải danh sách bài viết" });
  }
};

// Tạo bài viết mới (hỗ trợ song ngữ, vi required)
exports.createBlog = async (req, res) => {
  try {
    const { title, content } = req.body;

    // Parse JSON string từ frontend (nếu có)
    let titleObj = { vi: "" };
    let contentObj = { vi: "" };
    try {
      if (title) titleObj = { ...titleObj, ...JSON.parse(title) };
      if (content) contentObj = { ...contentObj, ...JSON.parse(content) };
    } catch (parseErr) {
      console.error("Lỗi parse JSON:", parseErr);
      return res.status(400).json({ error: "Dữ liệu title/content không hợp lệ" });
    }

    // Kiểm tra required (vi bắt buộc)
    if (!titleObj.vi || !contentObj.vi) {
      return res.status(400).json({ error: "Tiêu đề và nội dung Tiếng Việt là bắt buộc" });
    }

    let images = [];
    if (req.files && req.files.length > 0) {
      const imageFiles = req.files.filter(f => f.fieldname === "blogImages");
      images = imageFiles.map(f => f.path);
    }

    const blog = new Blog({
      title: titleObj,
      content: contentObj,
      images
    });
    await blog.save();

    res.status(201).json({ success: true, message: "Tạo bài viết thành công", blog });
  } catch (err) {
    console.error("❌ Lỗi createBlog:", err);
    res.status(500).json({ error: "Không thể tạo bài viết" });
  }
};

// Cập nhật bài viết (fix CastError + merge song ngữ)
exports.updateBlog = async (req, res) => {
  try {
    const blogId = req.params.id;
    const { title, content } = req.body;

    const blog = await Blog.findById(blogId);
    if (!blog) return res.status(404).json({ error: "Không tìm thấy bài viết" });

    // Parse JSON string từ frontend (nếu có)
    let titleUpdate = {};
    let contentUpdate = {};
    try {
      if (title) titleUpdate = JSON.parse(title);
      if (content) contentUpdate = JSON.parse(content);
    } catch (parseErr) {
      console.error("Lỗi parse JSON:", parseErr);
      return res.status(400).json({ error: "Dữ liệu title/content không hợp lệ" });
    }

    // Merge dữ liệu mới vào cũ (không mất ngôn ngữ cũ)
    blog.title = {
      ...blog.title.toObject(), // giữ vi/en cũ
      ...titleUpdate           // ghi đè ngôn ngữ mới
    };

    blog.content = {
      ...blog.content.toObject(),
      ...contentUpdate
    };

    // Kiểm tra required (vi phải có sau merge)
    if (!blog.title.vi) {
      return res.status(400).json({ error: "Tiêu đề Tiếng Việt là bắt buộc" });
    }
    if (!blog.content.vi) {
      return res.status(400).json({ error: "Nội dung Tiếng Việt là bắt buộc" });
    }

    // Xử lý ảnh mới (replace ảnh cũ nếu upload)
    if (req.files && req.files.length > 0) {
      // Xóa ảnh cũ trên Cloudinary
      if (blog.images && blog.images.length > 0) {
        for (const img of blog.images) {
          const publicId = img.split("/").pop().split(".")[0];
          await cloudinary.uploader.destroy(`oso/blogs/${publicId}`).catch(() => {});
        }
      }
      // Lưu ảnh mới
      const newImgs = req.files.filter(f => f.fieldname === "blogImages").map(f => f.path);
      blog.images = newImgs;
    }

    await blog.save();

    res.json({ success: true, message: "Cập nhật thành công", blog });
  } catch (err) {
    console.error("❌ Lỗi updateBlog:", err);
    res.status(500).json({ error: err.message || "Lỗi server khi cập nhật" });
  }
};

// Xóa bài viết (giữ nguyên)
exports.deleteBlog = async (req, res) => {
  try {
    const { id } = req.params;
    const blog = await Blog.findByIdAndDelete(id);
    if (!blog) return res.status(404).json({ error: "Không tìm thấy bài viết" });

    if (blog.images && blog.images.length > 0) {
      for (const img of blog.images) {
        const publicId = img.split("/").pop().split(".")[0];
        await cloudinary.uploader.destroy(`oso/blogs/${publicId}`).catch(() => {});
      }
    }

    res.json({ success: true, message: "Đã xóa bài viết" });
  } catch (err) {
    console.error("❌ Lỗi deleteBlog:", err);
    res.status(500).json({ error: "Không thể xóa bài viết" });
  }
};