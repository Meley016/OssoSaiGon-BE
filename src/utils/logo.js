// utils/logo.js
const Banner = require("../models/Banner");

// Cache logo (10 phút)
let cachedLogoUrl = null;
let cacheTime = 0;
const CACHE_DURATION = 10 * 60 * 1000; // 10 phút

/**
 * Lấy logo đang active (type: "logo", isActive: true)
 * Ưu tiên order thấp nhất
 */
async function getActiveLogo() {
  const now = Date.now();

  // Dùng cache nếu còn hạn
  if (cachedLogoUrl && now - cacheTime < CACHE_DURATION) {
    return cachedLogoUrl;
  }

  try {
    const logo = await Banner.findOne(
      { type: "logo", isActive: true },
      "image"
    ).sort({ order: 1 }); // order nhỏ nhất

    const url = logo?.image || "/images/default-logo.png";

    // Cập nhật cache
    cachedLogoUrl = url;
    cacheTime = now;
    return url;
  } catch (error) {
    console.warn("Lỗi lấy logo từ DB:", error.message);
    return "/images/default-logo.png";
  }
}

module.exports = { getActiveLogo };