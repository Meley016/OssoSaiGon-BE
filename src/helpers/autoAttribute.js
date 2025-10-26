// ✅ FILE: src/helpers/autoAttribute.js
const Color = require("../models/Color");
const Size = require("../models/Size");
const chroma = require("chroma-js");

// ✅ Tự động tạo danh sách màu
exports.getOrCreateColors = async (input) => {
  if (!input) return [];

  const items = input.split("/").map(c => c.trim());
  const ids = [];

  for (const item of items) {
    let hex;

    // ✅ Nếu truyền đúng dạng HEX
    if (/^#([0-9A-F]{6})$/i.test(item)) {
      hex = item.toUpperCase();
    } else {
      try {
        hex = chroma(item).hex().toUpperCase();
      } catch (e) {
        console.warn("⚠️ Màu không hợp lệ:", item);
        continue;
      }
    }

    let color = await Color.findOne({ code: hex });
    if (!color) {
      color = await Color.create({
        name: item.charAt(0).toUpperCase() + item.slice(1),
        code: hex
      });
      console.log("🆕 Auto-created Color:", color.name, hex);
    }

    ids.push(color._id);
  }

  return ids;
};

// ✅ Tự tạo Size nếu chưa tồn tại
exports.getOrCreateSize = async (sizeName) => {
  if (!sizeName) return null;

  sizeName = sizeName.trim().toUpperCase();

  let size = await Size.findOne({ name: sizeName });
  if (!size) {
    size = await Size.create({
      name: sizeName,
      code: sizeName.replace(/\s+/g, "")
    });
    console.log("🆕 Auto-created Size:", sizeName);
  }

  return size._id;
};
