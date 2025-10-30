// src/controllers/dashboardController.js
const { User } = require("../models/User"); // Import đúng User từ object export
const Category = require("../models/Category");
const Size = require("../models/Size");
const Color = require("../models/Color");
const Product = require("../models/Product");
const Order = require("../models/Order");
const Promotion = require("../models/Promotion");
const Shipping = require("../models/Shipping");
const Blog = require("../models/Blog");
const Banner = require("../models/Banner");

exports.renderSection = async (req, res) => {
  const section = req.params.section;
  const valid = ["product", "category", "size",
     "color", "order", "user", "promotion",
      "shipping", "blog", "banner"];

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
      products: [],
      orders: [],
      users: [],
      promotions: [],
      shippings: []
    };

    // Load dữ liệu cho các section
    if (section === "product") {
      data.products = await Product.find().sort({ createdAt: -1 });
      data.categories = await Category.find().sort({ createdAt: -1 });
      data.sizes = await Size.find().sort({ createdAt: -1 });
      data.colors = await Color.find().sort({ createdAt: -1 });
    } else if (section === "category") {
      data.categories = await Category.find().sort({ createdAt: -1 });
    } else if (section === "size") {
      data.sizes = await Size.find().sort({ createdAt: -1 });
    } else if (section === "color") {
      data.colors = await Color.find().sort({ createdAt: -1 });
    } else if (section === "order") {
      data.orders = await Order.find().sort({ createdAt: -1 });
      data.users = await User.find({ role: "user" }).sort({ createdAt: -1 });
      data.products = await Product.find().sort({ createdAt: -1 });
      data.promotions = await Promotion.find({ isActive: true }).sort({ createdAt: -1 });
    } else if (section === "user") {
      data.users = await User.find().sort({ createdAt: -1 });
    } else if (section === "promotion") {
      data.promotions = await Promotion.find().sort({ createdAt: -1 });
      data.users = await User.find({ role: "user" }).sort({ createdAt: -1 });
      data.products = await Product.find().sort({ createdAt: -1 });
      data.categories = await Category.find().sort({ createdAt: -1 });
    } else if (section === "shipping") {
      data.shippings = await Shipping.find().sort({ createdAt: -1 });
    }
      else if (section === "blog") {
      data.blogs = await Blog.find().sort({ createdAt: -1 });
    }
      else if (section === "banner") {
      data.banners = await Banner.find().sort({ order: 1 });
    }


    res.render("admin/dashboard", data);
  } catch (err) {
    console.error("Lỗi hiển thị dashboard:", err);
    res.status(500).render("admin/error", { title: "Lỗi", error: err.message });
  }
};