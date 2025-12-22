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
const Preorder = require("../models/Preorder")

// CẤU HÌNH QUYỀN TRUY CẬP THEO ROLE
const PERMISSIONS = {
  admin: ["product", "category", "size", "color", "order", "user", "promotion", "shipping", "blog", "banner","footer",
    "report","notification"],
  writer: ["blog", "banner"],
  productAdder: ["product", "category", "size", "color", "promotion"]
};

exports.renderSection = async (req, res) => {
  const section = req.params.section;
  const validSections = Object.values(PERMISSIONS).flat();

  // Kiểm tra section hợp lệ
  if (!validSections.includes(section)) {
    return res.status(404).render("admin/404", { title: "404 - Không tìm thấy" });
  }

  const role = req.user?.role || req.session?.admin?.role;

  // Kiểm tra quyền
  if (!role || !PERMISSIONS[role]?.includes(section)) {
    return res.status(403).render("admin/403", {
      title: "403 - Không có quyền",
      message: "Bạn không có quyền truy cập khu vực này."
    });
  }

  try {
    const data = {
      activeMenu: section,
      admin: req.session.admin || { role },
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

    switch (section) {
      case "report":
      // không cần preload data – fetch bằng JS
      break;
      case "product": {
        const [products, categories, sizes, colors] = await Promise.all([
          Product.find().sort({ createdAt: -1 }).lean(),
          Category.find().sort({ createdAt: -1 }).lean(),
          Size.find().sort({ createdAt: -1 }).lean(),
          Color.find().sort({ createdAt: -1 }).lean(),
        ]);
        data.products = products;
        data.categories = categories;
        data.sizes = sizes;
        data.colors = colors;
        break;
      }

      case "category":
        data.categories = await Category.find().sort({ createdAt: -1 }).lean();
        break;

      case "size":
        data.sizes = await Size.find().sort({ createdAt: -1 }).lean();
        break;

      case "color":
        data.colors = await Color.find().sort({ createdAt: -1 }).lean();
        break;

      case "order": {
        const [orders, users, products, promotions] = await Promise.all([
          Order.find().sort({ createdAt: -1 }).lean(),
          User.find({ role: "user" }).sort({ createdAt: -1 }).lean(),
          Product.find().sort({ createdAt: -1 }).lean(),
          Promotion.find({ isActive: true }).sort({ createdAt: -1 }).lean(),
        ]);
        data.orders = orders;
        data.users = users;
        data.products = products;
        data.promotions = promotions;
        break;
      }

      case "user":
        data.users = await User.find().sort({ createdAt: -1 }).lean();
        break;

      case "promotion": {
        const [promotions, users, products, categories] = await Promise.all([
          Promotion.find().sort({ createdAt: -1 }).lean(),
          User.find({ role: "user" }).sort({ createdAt: -1 }).lean(),
          Product.find().sort({ createdAt: -1 }).lean(),
          Category.find().sort({ createdAt: -1 }).lean(),
        ]);
        data.promotions = promotions;
        data.users = users;
        data.products = products;
        data.categories = categories;
        break;
      }

      case "shipping":
        data.shippings = await Shipping.find().sort({ createdAt: -1 }).lean();
        break;

      case "blog":
        data.blogs = await Blog.find().sort({ createdAt: -1 }).lean();
        break;

      case "banner":
        data.banners = await Banner.find().sort({ order: 1 }).lean();
        break;

      case "footer":
        data.footer = await Footer.find().sort({ createdAt: -1 }).lean();
        break;
        
      case "notification": {
        const notifyTab = req.query.tab || "order";

        const orderUnseen = await Order.countDocuments({ isSeen: false });
        const preorderUnseen = await Preorder.countDocuments({ isSeen: false });

        let orders = [];
        let preorders = [];

        if (notifyTab === "order") {
            orders = await Order.find()
            .sort({ createdAt: -1 })
            .limit(20)
            .lean();

          await Order.updateMany(
            { isSeen: false },
            { $set: { isSeen: true } }
          );
        }

        if (notifyTab === "preorder") {
          preorders = await Preorder.find()
            .sort({ createdAt: -1 })
            .limit(20)
            .lean();

          // auto mark seen
          await Preorder.updateMany(
            { isSeen: false },
            { $set: { isSeen: true } }
          );
        }

        data.notifyTab = notifyTab;
        data.orderUnseen = orderUnseen;
        data.preorderUnseen = preorderUnseen;
        data.orders = orders;
        data.preorders = preorders;
        break;
      }
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
