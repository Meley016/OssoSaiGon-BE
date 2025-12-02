const express = require("express");
const cors = require("cors");
const session = require("express-session");
const path = require("path");
const fs = require("fs");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
require("dotenv").config();
const cron = require("node-cron");
const cancelExpiredOrders = require("./utils/cancelExpired");

const connectDB = require("./config/database");
const MongoStore = require("connect-mongo");
// === ROUTES ===
const authRoutes = require("./routes/auth");
const productRoutes = require("./routes/products");
const categoryRoutes = require("./routes/categories");
const colorRoutes = require("./routes/colors");
const sizeRoutes = require("./routes/sizes");
const promotionRoutes = require("./routes/promotions");
const orderRoutes = require("./routes/orders");
const userRoutes = require("./routes/user");
const shippingRoutes = require("./routes/shipping");
const cartRoutes = require("./routes/cart");
const reviewRoutes = require("./routes/review");
const wishlistRoutes = require("./routes/wishlist");
const statisticsRoutes = require("./routes/statistics");
const blogRoutes = require("./routes/blogs");
const bannerRoutes = require("./routes/banner");
const mainCategoryRoutes = require("./routes/mainCategories");
const paymentRoutes = require("./routes/payment")
const footerRoutes = require("./routes/footer")
const stripeRoutes = require("./routes/stripe");
// === CONTROLLER ===
const dashboardController = require("./controllers/dashboardController");

// === CONNECT DB ===
connectDB();

const app = express();

// === CSP FOR VNPAY ===
app.use("/api/payment/vnpay", helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: [
      "'self'",
      "'unsafe-inline'",
      "'unsafe-eval'",
      "https://sandbox.vnpayment.vn",
      "https://pay.vnpayment.vn"
    ],
    styleSrc: [
      "'self'",
      "'unsafe-inline'",
      "https://sandbox.vnpayment.vn",
      "https://pay.vnpayment.vn"
    ],
    imgSrc: [
      "'self'",
      "data:",
      "https://sandbox.vnpayment.vn",
      "https://pay.vnpayment.vn"
    ],
    frameSrc: [
      "https://sandbox.vnpayment.vn",
      "https://pay.vnpayment.vn"
    ],
    connectSrc: [
      "'self'",
      "https://sandbox.vnpayment.vn",
      "https://pay.vnpayment.vn"
    ]
  }
}));
app.use(helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: [
      "'self'",
      "'unsafe-inline'",
      "https://www.paypal.com",
      "https://www.sandbox.paypal.com"
    ],
    frameSrc: [
      "https://www.paypal.com",
      "https://www.sandbox.paypal.com"
    ],
  },
}));

const PORT = process.env.PORT || 3000;


const allowedOrigins = [
  "https://ososaigon.com",
  "http://localhost:5173",
  "https://ososaigon-user.vercel.app",
  "http://localhost:3000",
  "https://ososaigon-admin.onrender.com", // THÊM URL RENDER (sẽ thay sau)
];

cron.schedule("*/5 * * * *", cancelExpiredOrders); // mỗi 5 phút tự động hủy đơn tạm hết hạn

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`❌ Blocked by CORS: ${origin}`);
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
};
// === SETUP VIEW ENGINE ===
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// === STATIC FILES ===
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

app.use(cors(corsOptions));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());
 
// === SESSION: DÙNG CHO ADMIN PANEL ===
app.set("trust proxy", 1); // ✅ BẮT BUỘC CHO HTTPS (Render)

app.use( 
  session({
    secret: process.env.SESSION_SECRET || "your-session-secret-key-2025",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
      collectionName: "sessions",
      ttl: 24 * 60 * 60,
    }),
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // ✅ cookie chỉ gửi qua HTTPS
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax", // ✅ cho phép FE khác domain
      maxAge: 24 * 60 * 60 * 1000, // 1 ngày
    },
  })
);
// === ADMIN MIDDLEWARE ===
const requireAdmin = (req, res, next) => {
  if (!req.session.admin) {
    return res.redirect("/admin/login");
  }
  next();
};


// === API ROUTES ===
app.use("/api/auth", authRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/products", productRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/colors", colorRoutes);
app.use("/api/sizes", sizeRoutes);
app.use("/api/users", userRoutes);
app.use("/api/shipping", shippingRoutes);
app.use("/api/promotions", promotionRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/wishlist", wishlistRoutes);
app.use("/api/statistics", statisticsRoutes);
app.use("/api/blogs", blogRoutes);
app.use("/api/banners", bannerRoutes); // ĐÃ SỬA: "banners" không phải "banner"
app.use("/api/main-categories", mainCategoryRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/footer", footerRoutes)
// === ADMIN ROUTES ===
app.use("/admin", authRoutes);
app.get("/admin/dashboard/:section", requireAdmin, dashboardController.renderSection);
app.use("/api/stripe", stripeRoutes);

// === FILE TEMPLATE DOWNLOAD ===
const templatePath = path.join(__dirname, "public/templates");
app.get("/templates/:file", (req, res) => {
  const file = path.join(templatePath, req.params.file);
  fs.existsSync(file)
    ? res.download(file)
    : res.status(404).send("Không tìm thấy file!");
});

// === ROOT REDIRECT ===
app.get("/", (req, res) => {
  req.session.admin
    ? res.redirect("/admin/dashboard/product")
    : res.redirect("/admin/login");
});

// === 404 HANDLER ===
app.use((req, res) => {
  const isHTML = req.headers.accept?.includes("text/html");
  if (isHTML) return res.render("admin/404", { title: "404" });
  res.status(404).json({ error: "Không tìm thấy route!" });
});

// === GLOBAL ERROR HANDLER ===
app.use((err, req, res, next) => {
  console.error("GLOBAL ERROR:", err);
  if (res.headersSent) return next(err);
  res
  .status(err.status || 500)
  .json({ error: err.message || "Server Error!" });
});

const server = app.listen(PORT, "0.0.0.0", () => {
  const port = server.address().port;
  console.log(`Server đang chạy tại: http://localhost:${port}`);
  console.log(`Production URL: https://ososaigon-admin.onrender.com`);
});

module.exports = app;