const BestSeller = require("../models/BestSaller");

/* ================= GET ================= */
exports.getBestSeller = async (req, res) => {
  try {
    const best = await BestSeller.findOne({ isActive: true })
      .populate({
        path: "products.product",
        match: { status: "active" },
        populate: [
          { path: "category", select: "name slug" },
          { path: "variants.color", select: "name code" },
          { path: "variants.size", select: "name" },
        ],
      })
      .lean();

    if (!best) {
      return res.json({ data: [] });
    }

    // Trả về product giống /api/products
    const data = best.products
      .filter(p => p.product) // product bị xoá / inactive
      .sort((a, b) => a.position - b.position)
      .map(p => ({
        ...p.product,
        _bestSellerPosition: p.position, // optional
      }));

    res.json({ data });
  } catch (err) {
    console.error("getBestSeller error:", err);
    res.status(500).json({ error: err.message });
  }
};

/* ================= SAVE ================= */
exports.saveBestSeller = async (req, res) => {
  try {
    const { productIds } = req.body;

    if (!Array.isArray(productIds)) {
      return res.status(400).json({ error: "productIds không hợp lệ" });
    }

    if (productIds.length > 16) {
      return res.status(400).json({ error: "Best Seller tối đa 16 sản phẩm" });
    }

    let best = await BestSeller.findOne();
    if (!best) best = new BestSeller();

    best.products = productIds.map((id, index) => ({
      product: id,
      position: index,
    }));

    await best.save();
    res.json({ message: "Lưu Best Seller thành công" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.reorderProducts = async (req, res) => {
  try {
    const { orderedIds } = req.body;

    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({ error: "orderedIds không hợp lệ" });
    }

    const best = await BestSeller.findOne();
    if (!best) return res.status(404).json({ error: "Không tồn tại" });

    best.products.forEach(p => {
      const idx = orderedIds.indexOf(String(p.product));
      if (idx !== -1) {
        p.position = idx;
      }
    });

    await best.save();
    res.json({ message: "Đã cập nhật thứ tự" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ================= REMOVE ================= */
exports.removeProduct = async (req, res) => {
  try {
    const { productId } = req.params;

    const best = await BestSeller.findOne();
    if (!best) return res.status(404).json({ error: "Không tồn tại" });

    best.products = best.products.filter(
      p => String(p.product) !== String(productId)
    );

    await best.save();
    res.json({ message: "Đã xoá khỏi Best Seller" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
