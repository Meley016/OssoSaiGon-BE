const FooterInfo = require("../models/FooterInfo");


exports.getAllFooters = async () => {
  const footer = await Footer.find({});
  return footer;
};

// Lấy nội dung theo loại (public)
exports.getFooterInfo = async (req, res) => {
  try {
    const { type, lang } = req.params;
    const info = await FooterInfo.findOne({ type });
    if (!info)
      return res.status(200).json({ title: "", content: "", lang });

    const language = ["vi", "en"].includes(lang) ? lang : "vi";
    res.json({
      type,
      title: info.title[language] || "",
      content: info.content[language] || "",
      lang: language,
    });
  } catch (err) {
    console.error("❌ Lỗi getFooterInfo:", err);
    res.status(500).json({ error: "Không thể tải nội dung footer" });
  }
};

// PUT /api/footer/:type/:lang
exports.upsertFooterInfo = async (req, res) => {
  try {
    const { type, lang } = req.params;
    const { title, content } = req.body;

    if (!["vi", "en"].includes(lang))
      return res.status(400).json({ error: "Ngôn ngữ không hợp lệ" });

    if (!title || !content)
      return res.status(400).json({ error: "Thiếu tiêu đề hoặc nội dung" });

    let info = await FooterInfo.findOne({ type });

    if (!info) {
      info = new FooterInfo({
        type,
        title: { vi: "", en: "" },
        content: { vi: "", en: "" },
      });
    }

    info.title[lang] = title;
    info.content[lang] = content;
    await info.save();

    res.json({ success: true, message: "Đã lưu nội dung", info });
  } catch (err) {
    console.error("❌ Lỗi upsertFooterInfo:", err);
    res.status(500).json({ error: "Không thể lưu nội dung footer" });
  }
};

