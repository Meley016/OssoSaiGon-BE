const express = require("express");
const cors = require("cors");
const session = require("express-session");
const path = require("path");
const fs = require("fs");
const cookieParser = require("cookie-parser");
require("dotenv").config();

const connectDB = require("./config/database");

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

// === CONTROLLER ===
const dashboardController = require("./controllers/dashboardController");

// === CONNECT DB ===
connectDB();

const app = express();

// === SỬA 1: LẤY PORT TỪ ENV HOẶC DÙNG 3000 (Render yêu cầu) ===
const PORT = process.env.PORT || 3000;

// === SETUP VIEW ENGINE ===
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// === STATIC FILES ===
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

app.use(cookieParser());

// === SỬA 2: THÊM URL RENDER VÀO ALLOWED ORIGINS (ĐỂ EJS GỌI API) ===
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://your-app.onrender.com", // THÊM URL RENDER (sẽ thay sau)
];

// === CORS: CHO PHÉP GỬI COOKIE + SESSION ===
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true, // BẮT BUỘC ĐỂ GỬI COOKIE/SESSION
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// === SESSION: DÙNG CHO ADMIN PANEL ===
app.use(
  session({
    secret: process.env.SESSION_SECRET || "fallback_secret_2025",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // HTTPS trên Render
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: "lax", // Đảm bảo cookie gửi khi gọi API cùng domain
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

// === SỬA 3: XÓA DÒNG NÀY (TRÙNG LẶP CORS) ===
// app.use("/api", cors(corsOptions)); // XÓA DÒNG NÀY

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

// === ADMIN ROUTES ===
app.use("/admin", authRoutes);
app.get("/admin/dashboard/:section", requireAdmin, dashboardController.renderSection);

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
  res.status(err.status || 500).json({ error: err.message || "Server Error!" });
});

// === SỬA 4: ĐÚNG CÚ PHÁP app.listen() + BIND 0.0.0.0 ===
const server = app.listen(PORT, "0.0.0.0", () => {
  const port = server.address().port;
  console.log(`Server đang chạy tại: http://localhost:${port}`);
  console.log(`Production URL: https://ossosaigon-admin.onrender.com`);
});

module.exports = app;