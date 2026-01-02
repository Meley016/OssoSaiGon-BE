// controllers/newsletterController.js
const NewsletterContact = require("../models/NewLetterContact");
const { Parser } = require("json2csv");

exports.submitNewsletter = async (req, res) => {
  try {
    const { email, name = "", message = "" } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email là bắt buộc" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Email không hợp lệ" });
    }

    const type = message ? "contact" : "newsletter";

    // ❗ tránh spam newsletter
    if (type === "newsletter") {
      const exists = await NewsletterContact.findOne({ email, type });
      if (exists) {
        return res.status(409).json({
          message: "Email đã đăng ký newsletter",
        });
      }
    }

    const record = await NewsletterContact.create({
      email,
      name,
      message,
      type,
    });

    res.status(201).json({
      message:
        type === "newsletter"
          ? "Đăng ký newsletter thành công"
          : "Gửi liên hệ thành công",
      data: record,
    });
  } catch (err) {
    console.error("submitNewsletter error:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
};
/* ===== FILTER ===== */
exports.filterNewsletter = async (req, res) => {
  try {
    const { from, to, type } = req.query;
    const query = {};

    if (type) query.type = type;

    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from + "T00:00:00+07:00");
      if (to) query.createdAt.$lte = new Date(to + "T23:59:59+07:00");
    }

    const items = await NewsletterContact.find(query)
      .sort({ createdAt: -1 })
      .lean();

    res.json(items);
  } catch (e) {
    res.status(500).json({ error: "Không lọc được" });
  }
};

/* ===== MARK READ ===== */
exports.markRead = async (req, res) => {
  try {
    const item = await NewsletterContact.findById(req.params.id);
    if (!item) return res.sendStatus(404);

    item.status = item.status === "new" ? "read" : "new";
    item.isSeen = true;
    await item.save();

    res.json({ status: item.status });
  } catch (e) {
    res.sendStatus(500);
  }
};

/* ===== EXPORT ===== */
exports.exportNewsletter = async (req, res) => {
  const items = await NewsletterContact.find().lean();

  const rows = items.map(i => ({
    email: i.email,
    name: i.name,
    message: i.message,
    type: i.type,
    status: i.status,
    createdAt: i.createdAt.toLocaleString("vi-VN"),
  }));

  const parser = new Parser();
  const csv = parser.parse(rows);

  res.header("Content-Type", "text/csv; charset=UTF-8");
  res.attachment("newsletter.csv");
  res.send("\uFEFF" + csv);
};
