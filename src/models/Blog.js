const mongoose = require("mongoose");

const commentSchema = new mongoose.Schema({
  user: { type: String, required: true },
  text: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const blogSchema = new mongoose.Schema(
  {
    title: {
      vi: { type: String, required: true },
      en: { type: String, default: "" },
    },
    content: {
      vi: { type: String, required: true },
      en: { type: String, default: "" },
    },
    images: [{ type: String }], // danh sách ảnh Cloudinary
    likes: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
      default: [], // ✅ đảm bảo không bị undefined khi findIndex
    },

    comments: {
      type: [commentSchema],
      default: [], // ✅ đảm bảo luôn có mảng
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Blog", blogSchema);
