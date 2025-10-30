const Banner = require("../models/Banner");
const cloudinary = require("../config/cloudinary");

// 🟢 Lấy danh sách (admin)
exports.getAll = async (req, res) => {
  try {
    const type = req.query.type || "banner"; // 👈 mặc định banner
    const items = await Banner.find({ type }).sort({ order: 1 });
    res.json(items);
  } catch (err) {
    console.error("Lỗi getAll:", err);
    res.status(500).json({ error: "Lỗi tải danh sách" });
  }
};

// 🟢 Lấy danh sách active (client)
exports.getActive = async (req, res) => {
  try {
    const type = req.query.type || "banner";
    const items = await Banner.find({ type, isActive: true }).sort({ order: 1 });
    res.json(items);
  } catch (err) {
    console.error("Lỗi getActive:", err);
    res.status(500).json({ error: "Lỗi tải dữ liệu hiển thị" });
  }
};

// 🟡 Tạo mới (banner hoặc logo)
exports.create = async (req, res) => {
  try {
    const type = req.body.type || "banner";
    const fieldName = type === "logo" ? "logoImage" : "bannerImage";
    const folder = type === "logo" ? "osso/logos" : "osso/banners";

    const file = req.files?.find(f => f.fieldname === fieldName);
    let imageUrl = file?.path || req.body.image;

    if (!imageUrl) return res.status(400).json({ error: "Vui lòng chọn ảnh" });

    const item = new Banner({
      type,
      image: imageUrl,
      title: req.body.title,
      description: req.body.description,
      link: req.body.link,
      order: req.body.order || 0,
      isActive: req.body.isActive !== "false",
    });

    await item.save();
    res.json(item);
  } catch (err) {
    console.error("Lỗi create:", err);
    res.status(500).json({ error: "Không thể tạo mới" });
  }
};

// 🔵 Cập nhật
exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const item = await Banner.findById(id);
    if (!item) return res.status(404).json({ error: "Không tìm thấy" });

    const type = item.type;
    const fieldName = type === "logo" ? "logoImage" : "bannerImage";
    const folder = type === "logo" ? "osso/logos" : "osso/banners";

    let imageUrl = item.image;
    const file = req.files?.find(f => f.fieldname === fieldName);
    if (file?.path) {
      try {
        const publicId = item.image.split("/").slice(-1)[0].split(".")[0];
        await cloudinary.uploader.destroy(`${folder}/${publicId}`);
      } catch (e) {
        console.warn("Không thể xóa ảnh cũ:", e.message);
      }
      imageUrl = file.path;
    }

    const updated = await Banner.findByIdAndUpdate(
      id,
      {
        title: req.body.title ?? item.title,
        description: req.body.description ?? item.description,
        link: req.body.link ?? item.link,
        order: req.body.order ?? item.order,
        isActive: req.body.isActive ?? item.isActive,
        image: imageUrl,
      },
      { new: true }
    );

    res.json(updated);
  } catch (err) {
    console.error("Lỗi update:", err);
    res.status(500).json({ error: "Lỗi cập nhật" });
  }
};

// 🔴 Xóa
exports.remove = async (req, res) => {
  try {
    const item = await Banner.findById(req.params.id);
    if (!item) return res.status(404).json({ error: "Không tìm thấy" });

    const folder = item.type === "logo" ? "osso/logos" : "osso/banners";
    try {
      const publicId = item.image.split("/").slice(-1)[0].split(".")[0];
      await cloudinary.uploader.destroy(`${folder}/${publicId}`);
    } catch (e) {
      console.warn("Không thể xóa ảnh:", e.message);
    }

    await item.deleteOne();
    res.json({ success: true });
  } catch (err) {
    console.error("Lỗi remove:", err);
    res.status(500).json({ error: "Lỗi xóa" });
  }
};
