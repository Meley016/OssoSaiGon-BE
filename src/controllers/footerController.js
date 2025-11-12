const FooterInfo = require("../models/FooterInfo");

// 📜 Lấy nội dung theo loại (public)
exports.getFooterInfo = async (req, res) => {
  try {
    const { type } = req.params;
    const info = await FooterInfo.findOne({ type });
    if (!info)
      return res.status(404).json({ error: `Không tìm thấy nội dung ${type}` });
    res.json(info);
  } catch (err) {
    console.error("❌ Lỗi getFooterInfo:", err);
    res.status(500).json({ error: "Không thể tải nội dung footer" });
  }
};

// 💾 Lưu hoặc cập nhật nội dung (admin)
exports.upsertFooterInfo = async (req, res) => {
  try {
    const { type } = req.params;
    const { title, content } = req.body;

    if (!title || !content)
      return res.status(400).json({ error: "Thiếu tiêu đề hoặc nội dung" });

    const info = await FooterInfo.findOneAndUpdate(
      { type },
      { title, content },
      { upsert: true, new: true }
    );

    res.json({ success: true, message: "Đã lưu nội dung", info });
  } catch (err) {
    console.error("❌ Lỗi upsertFooterInfo:", err);
    res.status(500).json({ error: "Không thể lưu nội dung footer" });
  }
};
