// src/controllers/dashboardController.js

const { User } = require("../models/User");
const Category = require("../models/Category");
const Size = require("../models/Size");
const Color = require("../models/Color");
const Product = require("../models/Product");
const Order = require("../models/Order");
const Promotion = require("../models/Promotion");
const Shipping = require("../models/Shipping");
const Blog = require("../models/Blog");
const Banner = require("../models/Banner");
const Footer = require("../models/FooterInfo")
// CẤU HÌNH QUYỀN TRUY CẬP THEO ROLE
const PERMISSIONS = {
  admin: ["product", "category", "size", "color", "order", "user", "promotion", "shipping", "blog", "banner","footer"],
  writer: ["blog", "banner"],
  productAdder: ["product", "category", "size", "color", "promotion"]
};

exports.renderSection = async (req, res) => {
  const section = req.params.section;
  const validSections = Object.values(PERMISSIONS).flat();

  //  Kiểm tra section hợp lệ
  if (!validSections.includes(section)) {
    return res.status(404).render("admin/404", { title: "404 - Không tìm thấy" });
  }

  //  LẤY ROLE TỪ req.user HOẶC req.session.admin
  const role = req.user?.role || req.session?.admin?.role;

  //  KIỂM TRA QUYỀN
  if (!role || !PERMISSIONS[role]?.includes(section)) {
    return res.status(403).render("admin/403", {
      title: "403 - Không có quyền",
      message: "Bạn không có quyền truy cập khu vực này."
    });
  }

  try {
    const data = {
      activeMenu: section,
      admin: req.session.admin || { role }, // fallback nếu không có session
      categories: [],
      sizes: [],
      colors: [],
      products: [],
      orders: [],
      users: [],
      promotions: [],
      shippings: [],
      blogs: [],
      banners: [],
      footer: [],
    };

    // LOAD DỮ LIỆU THEO SECTION
    switch (section) {
      case "product":
        data.products = await Product.find().sort({ createdAt: -1 });
        data.categories = await Category.find().sort({ createdAt: -1 });
        data.sizes = await Size.find().sort({ createdAt: -1 });
        data.colors = await Color.find().sort({ createdAt: -1 });
        break;

      case "category":
        data.categories = await Category.find().sort({ createdAt: -1 });
        break;

      case "size":
        data.sizes = await Size.find().sort({ createdAt: -1 });
        break;

      case "color":
        data.colors = await Color.find().sort({ createdAt: -1 });
        break;

      case "order":
        data.orders = await Order.find().sort({ createdAt: -1 });
        data.users = await User.find({ role: "user" }).sort({ createdAt: -1 });
        data.products = await Product.find().sort({ createdAt: -1 });
        data.promotions = await Promotion.find({ isActive: true }).sort({ createdAt: -1 });
        break;

      case "user":
        data.users = await User.find().sort({ createdAt: -1 });
        break;

      case "promotion":
        data.promotions = await Promotion.find().sort({ createdAt: -1 });
        data.users = await User.find({ role: "user" }).sort({ createdAt: -1 });
        data.products = await Product.find().sort({ createdAt: -1 });
        data.categories = await Category.find().sort({ createdAt: -1 });
        break;

      case "shipping":
        data.shippings = await Shipping.find().sort({ createdAt: -1 });
        break;

      case "blog":
        data.blogs = await Blog.find().sort({ createdAt: -1 });
        break;

      case "banner":
        data.banners = await Banner.find().sort({ order: 1 });
        break;
      case "footer":
        data.footer = await Footer.find().sort({ createdAt: -1});
        break;
    }

    res.render("admin/dashboard", data);
  } catch (err) {
    console.error("Lỗi render dashboard:", err);
    res.status(500).render("admin/error", {
      title: "Lỗi hệ thống",
      error: err.message
    });
  }
};