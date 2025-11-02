// src/controllers/promotionController.js
const Promotion = require("../models/Promotion");
const Product = require("../models/Product");
const Category = require("../models/Category");
const { User, LoyaltyConfig } = require("../models/User");

exports.listPromotions = async (req, res) => {
  try {
    const promotions = await Promotion.find()
      .populate("productIds", "name coverImage")
      .populate("categoryIds", "name")
      .populate("getProductId", "name coverImage")
      .sort({ createdAt: -1 })
      .lean();
    res.json(promotions);
  } catch (err) {
    console.error("List promotions error:", err);
    res.status(500).json({ error: "Lỗi tải danh sách khuyến mãi" });
  }
};

exports.getPromotion = async (req, res) => {
  try {
    const promotion = await Promotion.findById(req.params.id)
      .populate("productIds", "name coverImage")
      .populate("categoryIds", "name")
      .populate("getProductId", "name coverImage")
      .lean();
    if (!promotion) return res.status(404).json({ error: "Không tìm thấy khuyến mãi" });
    res.json(promotion);
  } catch (err) {
    console.error("Get promotion error:", err);
    res.status(500).json({ error: "Lỗi tải thông tin khuyến mãi" });
  }
};

exports.createPromotion = async (req, res) => {
  try {
    const data = req.body;
    console.log("Create promotion data:", data);
    delete data._id;
    // Validation - Kiểm tra các trường bắt buộc
    if (!data.code || !data.name || !data.type || !data.value || !data.startDate || !data.endDate || !data.applyType) {
      return res.status(400).json({ error: "Thiếu các trường bắt buộc (code, name, type, value, startDate, endDate, applyType)" });
    }

    // Chuyển đổi số
    data.value = Number(data.value || 0);
    data.maxDiscount = Number(data.maxDiscount || 0);
    data.minOrderValue = Number(data.minOrderValue || 0);
    data.minQuantity = Number(data.minQuantity || 0);
    data.usageLimit = Number(data.usageLimit || 0);
    data.usedCount = Number(data.usedCount || 0);
    data.usageLimitPerUser = Number(data.usageLimitPerUser || 0);
    data.usageLimitPerProduct = Number(data.usageLimitPerProduct || 0);
    data.buyQuantity = Number(data.buyQuantity || 0);
    data.getQuantity = Number(data.getQuantity || 0);

    // Đặt các trường liên quan đến applyType không được chọn thành rỗng/mặc định
    if (data.applyType === "user") {
      data.productIds = [];
      data.categoryIds = [];
      data.usageLimitPerProduct = 0;
    } else if (data.applyType === "product") {
      data.userLevels = [];
      data.categoryIds = [];
      data.usageLimitPerUser = 0;
      data.isNewUserOnly = false;
    } else if (data.applyType === "category") {
      data.userLevels = [];
      data.productIds = [];
      data.usageLimitPerUser = 0;
      data.isNewUserOnly = false;
      data.usageLimitPerProduct = 0;
    } else {
      return res.status(400).json({ error: "applyType không hợp lệ" });
    }

    // Xử lý getProductId
    if (data.type !== "buy_x_get_y" || !data.getProductId) {
      data.getProductId = undefined; // Tránh lỗi CastError
    }

    // Chuyển đổi mảng
    data.productIds = Array.isArray(data.productIds) ? data.productIds : [];
    data.categoryIds = Array.isArray(data.categoryIds) ? data.categoryIds : [];
    data.userLevels = Array.isArray(data.userLevels) ? data.userLevels : [];

    // Kiểm tra mã trùng
    const existingPromo = await Promotion.findOne({ code: data.code });
    if (existingPromo) return res.status(400).json({ error: "Mã khuyến mãi đã tồn tại" });

    // Kiểm tra hợp lệ
    if (data.applyType === "product" && data.productIds.length) {
      const products = await Product.find({ _id: { $in: data.productIds } });
      if (products.length !== data.productIds.length) {
        return res.status(400).json({ error: "Một số sản phẩm không hợp lệ" });
      }
    }
    if (data.applyType === "category" && data.categoryIds.length) {
      const categories = await Category.find({ _id: { $in: data.categoryIds } });
      if (categories.length !== data.categoryIds.length) {
        return res.status(400).json({ error: "Một số danh mục không hợp lệ" });
      }
    }
    if (data.type === "buy_x_get_y" && data.getProductId) {
      const product = await Product.findById(data.getProductId);
      if (!product) return res.status(400).json({ error: "Sản phẩm tặng không hợp lệ" });
    }

    const promotion = await Promotion.create(data);
    res.status(201).json(promotion);
  } catch (err) {
    console.error("Create promotion error:", err);
    res.status(400).json({ error: err.message || "Lỗi tạo khuyến mãi" });
  }
};

exports.updatePromotion = async (req, res) => {
  try {
    const data = req.body;
    console.log("Update promotion data:", data);

    // Validation
    if (!data.code || !data.name || !data.type || !data.value || !data.startDate || !data.endDate || !data.applyType) {
      return res.status(400).json({ error: "Thiếu các trường bắt buộc (code, name, type, value, startDate, endDate, applyType)" });
    }

    // Chuyển đổi số
    data.value = Number(data.value || 0);
    data.maxDiscount = Number(data.maxDiscount || 0);
    data.minOrderValue = Number(data.minOrderValue || 0);
    data.minQuantity = Number(data.minQuantity || 0);
    data.usageLimit = Number(data.usageLimit || 0);
    data.usageLimitPerUser = Number(data.usageLimitPerUser || 0);
    data.usageLimitPerProduct = Number(data.usageLimitPerProduct || 0);
    data.buyQuantity = Number(data.buyQuantity || 0);
    data.getQuantity = Number(data.getQuantity || 0);

    // Chuyển đổi mảng
    data.productIds = Array.isArray(data.productIds) ? data.productIds : [];
    data.categoryIds = Array.isArray(data.categoryIds) ? data.categoryIds : [];
    data.userLevels = Array.isArray(data.userLevels) ? data.userLevels : [];

    // Kiểm tra mã trùng
    const existingPromo = await Promotion.findOne({ code: data.code, _id: { $ne: req.params.id } });
    if (existingPromo) return res.status(400).json({ error: "Mã khuyến mãi đã tồn tại" });

    // Kiểm tra hợp lệ
    if (data.applyType === "product" && data.productIds.length) {
      const products = await Product.find({ _id: { $in: data.productIds } });
      if (products.length !== data.productIds.length) {
        return res.status(400).json({ error: "Một số sản phẩm không hợp lệ" });
      }
    }
    if (data.applyType === "category" && data.categoryIds.length) {
      const categories = await Category.find({ _id: { $in: data.categoryIds } });
      if (categories.length !== data.categoryIds.length) {
        return res.status(400).json({ error: "Một số danh mục không hợp lệ" });
      }
    }
    if (data.type === "buy_x_get_y" && data.getProductId) {
      const product = await Product.findById(data.getProductId);
      if (!product) return res.status(400).json({ error: "Sản phẩm tặng không hợp lệ" });
    }

    const promotion = await Promotion.findByIdAndUpdate(req.params.id, data, { new: true })
      .populate("productIds", "name coverImage")
      .populate("categoryIds", "name")
      .populate("getProductId", "name coverImage");
    if (!promotion) return res.status(404).json({ error: "Không tìm thấy khuyến mãi" });
    res.json(promotion);
  } catch (err) {
    console.error("Update promotion error:", err);
    res.status(400).json({ error: err.message || "Lỗi cập nhật khuyến mãi" });
  }
};

exports.deletePromotion = async (req, res) => {
  try {
    const promotion = await Promotion.findByIdAndDelete(req.params.id);
    if (!promotion) return res.status(404).json({ error: "Không tìm thấy khuyến mãi" });
    res.json({ success: true, message: "Xóa khuyến mãi thành công" });
  } catch (err) {
    console.error("Delete promotion error:", err);
    res.status(500).json({ error: "Lỗi xóa khuyến mãi" });
  }
};

exports.togglePromotion = async (req, res) => {
  try {
    const promotion = await Promotion.findById(req.params.id);
    if (!promotion) return res.status(404).json({ error: "Không tìm thấy khuyến mãi" });
    console.log(`Before toggle: promotion ${promotion.code}, isActive = ${promotion.isActive}`);
    promotion.isActive = !promotion.isActive;
    await promotion.save();
    console.log(`After toggle: promotion ${promotion.code}, isActive = ${promotion.isActive}`);
    res.json({ success: true, isActive: promotion.isActive });
  } catch (err) {
    console.error("Toggle promotion error:", err);
    res.status(500).json({ error: "Lỗi bật/tắt khuyến mãi" });
  }
};

exports.applyPromotion = async (req, res) => {
  try {
    const { code, userId, orderTotal, productIds, quantities } = req.body;
    
    const promotion = await Promotion.findOne({ code, isActive: true })
      .populate("productIds", "name coverImage")
      .populate("categoryIds", "name")
      .populate("getProductId", "name coverImage")
      .lean();
    if (!promotion) return res.json({ valid: false, msg: "Mã không tồn tại hoặc đã bị tắt" });

    const now = new Date();
    if (promotion.startDate > now || promotion.endDate < now)
      return res.json({ valid: false, msg: "Mã đã hết hạn" });

    if (promotion.minOrderValue > 0 && orderTotal < promotion.minOrderValue)
      return res.json({ valid: false, msg: `Đơn hàng cần tối thiểu ${promotion.minOrderValue} VNĐ` });

    if (promotion.usageLimit > 0 && promotion.usedCount >= promotion.usageLimit)
      return res.json({ valid: false, msg: "Mã đã hết lượt sử dụng" });

    const user = await User.findById(userId);
    if (!user) return res.json({ valid: false, msg: "User không hợp lệ" });

    const usedByUser = user.promotionsUsed?.[promotion.code] || 0;

    // USER
    if (promotion.applyType === "user") {
      if (promotion.isNewUserOnly && user.createdAt < promotion.startDate)
        return res.json({ valid: false, msg: "Chỉ dành cho người dùng mới" });
      if (promotion.userLevels.length > 0 && !promotion.userLevels.includes(user.loyalty.tier))
        return res.json({ valid: false, msg: "Không đủ hạng loyalty" });
      if (promotion.usageLimitPerUser > 0 && usedByUser >= promotion.usageLimitPerUser)
        return res.json({ valid: false, msg: "Bạn đã dùng hết lượt" });
    }

    // PRODUCT
    if (promotion.applyType === "product") {
      let matched = false;
      let totalQuantity = 0;
      if (quantities) totalQuantity = Object.values(quantities).reduce((sum, q) => sum + Number(q), 0);

      if (promotion.minQuantity > 0 && totalQuantity < promotion.minQuantity)
        return res.json({ valid: false, msg: `Cần tối thiểu ${promotion.minQuantity} sản phẩm` });

      for (let id of productIds) {
        if (promotion.productIds.map((p) => p._id.toString()).includes(id)) {
          const usedCount = promotion.productUsedCount.get(id.toString()) || 0;
          if (promotion.usageLimitPerProduct > 0 && usedCount >= promotion.usageLimitPerProduct)
            return res.json({ valid: false, msg: `Khuyến mãi ${id} đã hết lượt sử dụng` });
          matched = true;
          break;
        }
      }
      if (!matched) return res.json({ valid: false, msg: "Không áp dụng cho sản phẩm này" });
    }

    // CATEGORY
    if (promotion.applyType === "category") {
      let matched = false;
      let totalQuantity = 0;
      if (quantities) totalQuantity = Object.values(quantities).reduce((sum, q) => sum + Number(q), 0);

      if (promotion.minQuantity > 0 && totalQuantity < promotion.minQuantity)
        return res.json({ valid: false, msg: `Cần tối thiểu ${promotion.minQuantity} sản phẩm` });

      const productsInCategories = await Product.find({
        category: { $in: promotion.categoryIds.map((c) => c._id) },
      }).lean();
      const productIdsInCategories = productsInCategories.map((p) => p._id.toString());
      for (let id of productIds) {
        if (productIdsInCategories.includes(id)) {
          const usedCount = promotion.productUsedCount.get(id.toString()) || 0;
          if (promotion.usageLimitPerProduct > 0 && usedCount >= promotion.usageLimitPerProduct)
            return res.json({ valid: false, msg: `Khuyến mãi ${id} đã hết lượt sử dụng` });
          matched = true;
          break;
        }
      }
      if (!matched) return res.json({ valid: false, msg: "Không áp dụng cho danh mục này" });
    }

    // Tính giảm giá
    let discount = 0;
    let giftProduct = null;
    if (promotion.type === "percentage") {
      discount = (orderTotal * promotion.value) / 100;
      if (promotion.maxDiscount > 0) discount = Math.min(discount, promotion.maxDiscount);
    } else if (promotion.type === "fixed") {
      discount = promotion.value;
    } else if (promotion.type === "free_shipping") {
      discount = 0;
    } else if (promotion.type === "buy_x_get_y") {
      const totalQuantity = Object.values(quantities || {}).reduce((sum, q) => sum + Number(q), 0);
      if (totalQuantity >= promotion.buyQuantity) {
        giftProduct = { productId: promotion.getProductId, quantity: promotion.getQuantity };
      } else {
        return res.json({ valid: false, msg: `Cần mua tối thiểu ${promotion.buyQuantity} sản phẩm` });
      }
    }

    res.json({
      valid: true,
      discount,
      giftProduct,
      msg: "Áp dụng khuyến mãi thành công!",
      promotion,
    });
  } catch (err) {
    console.error("Apply promotion error:", err);
    res.status(500).json({ valid: false, msg: "Lỗi xử lý mã khuyến mãi" });
  }
};

exports.confirmOrderPromotion = async (userId, code, productIds = []) => {
  try {
    const promotion = await Promotion.findOne({ code });
    if (!promotion) throw new Error("Mã không tồn tại");

    if (promotion.usageLimit > 0 && promotion.usedCount >= promotion.usageLimit) {
      throw new Error("Hết lượt sử dụng khuyến mãi");
    }
    promotion.usedCount += 1;

    if (promotion.applyType === "product" && productIds.length > 0) {
      productIds.forEach((id) => {
        const currentCount = promotion.productUsedCount.get(id.toString()) || 0;
        if (promotion.usageLimitPerProduct > 0 && currentCount >= promotion.usageLimitPerProduct) {
          throw new Error(`Hết lượt sử dụng cho sản phẩm ${id}`);
        }
        promotion.productUsedCount.set(id.toString(), currentCount + 1);
      });
    }

    await promotion.save();

    await User.updateOne(
      { _id: userId },
      { $inc: { [`promotionsUsed.${code}`]: 1 } }
    );
  } catch (err) {
    console.error("Confirm order promotion error:", err);
    throw err;
  }
};