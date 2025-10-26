const Category = require("../models/Category"); 
const Size = require("../models/Size");   
const Color = require("../models/Color"); 
const Product = require("../models/Product");

exports.renderSection = async (req, res) => {
  const section = req.params.section;
  const valid = ["product", "category", "size", "color", "order", "user", "promotion", "shipping"];

  if (!valid.includes(section)) {
    return res.status(404).render("admin/404", { title: "404" });
  }

  try {
    const data = {
      activeMenu: section,
      admin: req.session.admin,
      categories: [],
      sizes: [],
      colors: [],
    };

    // Load dữ liệu
    if (section === "category") {
      data.categories = await Category.find().sort({ createdAt: -1 });
    } else if (section === "size") {
      data.sizes = await Size.find().sort({ createdAt: -1 });
    } else if (section === "color") {
      data.colors = await Color.find().sort({ createdAt: -1 });
    }

    res.render("admin/dashboard", data);
  } catch (err) {
    console.error("Lỗi hiển thị dashboard:", err);
    res.status(500).render("admin/error", { title: "Lỗi", error: err.message });
  }
};