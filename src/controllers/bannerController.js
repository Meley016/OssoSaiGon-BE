const Banner = require("../models/Banner");
const cloudinary = require("../config/cloudinary");

// 🟢 Lấy danh sách (admin)
exports.getAll = async (req, res) => {
  try {
    const type = req.query.type || "banner";
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
    const folder = type === "logo" ? "oso/logos" : "oso/banners";
    const file = req.files?.find(f => f.fieldname === fieldName);
    const imageUrl = file?.path || req.body.image;

    if (!imageUrl) return res.status(400).json({ error: "Vui lòng chọn ảnh" });

    // === LOGO: chỉ 1 cái active ===
    if (type === "logo" && req.body.isActive !== "false") {
      await Banner.updateMany({ type: "logo" }, { isActive: false });
    }

    // === BANNER: tối đa 5 cái active ===
    if (type === "banner" && req.body.isActive !== "false") {
      const activeCount = await Banner.countDocuments({ type: "banner", isActive: true });
      if (activeCount >= 5) {
        return res.status(400).json({ error: "Chỉ được tối đa 5 banner hiển thị!" });
      }
    }

    // === Gán order ===
    let order = 0;
    if (type === "banner" && req.body.isActive !== "false") {
      const activeBanners = await Banner.find({ type: "banner", isActive: true }).sort({ order: 1 });
      order = activeBanners.length + 1;
    }

    const item = new Banner({
      type,
      image: imageUrl,
      title: req.body.title,
      description: req.body.description,
      link: req.body.link,
      order,
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
// 🔵 Cập nhật trạng thái hiển thị
exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    const item = await Banner.findById(id);
    if (!item) return res.status(404).json({ error: "Không tìm thấy banner/logo!" });

    const type = item.type;
    const newActive = isActive === true || isActive === "true";

    // === LOGO: chỉ 1 cái active ===
    if (type === "logo" && newActive) {
      await Banner.updateMany({ type: "logo" }, { isActive: false });
    }

    // === BANNER: giới hạn 5 active ===
    if (type === "banner" && newActive) {
      const activeCount = await Banner.countDocuments({
        type: "banner",
        isActive: true,
        _id: { $ne: id },
      });
      if (activeCount >= 5)
        return res.status(400).json({ error: "Chỉ được tối đa 5 banner hiển thị!" });

      const order = activeCount + 1;
      item.order = order;
    } else if (type === "banner" && !newActive) {
      item.order = 0;
    }

    item.isActive = newActive;
    await item.save();

    // Cập nhật lại thứ tự cho banner còn lại nếu cần
    if (type === "banner") {
      const actives = await Banner.find({ type: "banner", isActive: true }).sort({ order: 1 });
      for (let i = 0; i < actives.length; i++) {
        actives[i].order = i + 1;
        await actives[i].save();
      }
    }

    res.json(item);
  } catch (err) {
    console.error("Lỗi update:", err);
    res.status(500).json({ error: "Không thể cập nhật trạng thái!" });
  }
};


// 🔴 Xóa banner hoặc logo
exports.remove = async (req, res) => {
  try {
    const item = await Banner.findById(req.params.id);
    if (!item) return res.status(404).json({ error: "Không tìm thấy" });

    const folder = item.type === "logo" ? "oso/logos" : "oso/banners";
    const publicId = item.image.split("/").slice(-1)[0].split(".")[0];

    try {
      await cloudinary.uploader.destroy(`${folder}/${publicId}`);
    } catch (e) {
      console.warn("⚠️ Không thể xóa ảnh trên Cloudinary:", e.message);
    }

    await item.deleteOne();

    // reorder banner
    if (item.type === "banner" && item.isActive) {
      const actives = await Banner.find({ type: "banner", isActive: true }).sort({ order: 1 });
      for (let i = 0; i < actives.length; i++) {
        actives[i].order = i + 1;
        await actives[i].save();
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Lỗi remove:", err);
    res.status(500).json({ error: "Lỗi khi xóa" });
  }
};

