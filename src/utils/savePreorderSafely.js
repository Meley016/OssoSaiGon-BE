const mongoose = require("mongoose");
const Preorder = require("../models/Preorder");

module.exports = async function savePreorderSafely(data) {
  console.log("🟡 savePreorderSafely called");

  // 🔍 kiểm tra DB
  console.log("Mongo readyState:", mongoose.connection.readyState);
  // 1 = connected

  try {
    const doc = await Preorder.create(data);
    console.log("✅ Preorder saved:", doc._id);
    return doc;
  } catch (err) {
    console.error("❌ Preorder DB failed FULL:", err);

    // ❌ Nếu Mongo không connect thì fallback vô nghĩa
    if (mongoose.connection.readyState !== 1) {
      console.error("🚨 MongoDB not connected – abort fallback");
      return null;
    }

    try {
      const fallbackDoc = await Preorder.create({
        user: data.user || {},
        productId: data.productId || null,
        variants: [],
        isSeen: false,
        contacted: false,
      });
      console.log("⚠️ Preorder fallback saved:", fallbackDoc._id);
      return fallbackDoc;
    } catch (fallbackErr) {
      console.error("💥 Preorder fallback failed FULL:", fallbackErr);
      return null;
    }
  }
};
