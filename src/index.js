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
const PORT = process.env.PORT || 3000;

// === SETUP VIEW ENGINE ===
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// === STATIC FILES ===
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

app.use(cookieParser());

const allowedOrigins = [
  "http://localhost:5173", // FE React dev
  "https://your-production-domain.com",
  "http://localhost:3000" // FE khi deploy
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
};

app.use(
  cors({
    origin: function (origin, callback) {
      // cho phép Postman hoặc server nội bộ (không có origin)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true, // ✅ Cho phép gửi cookie qua FE
  })
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// === SESSION: only for Admin Panel Views ===
app.use(
  session({
    secret: process.env.SESSION_SECRET || "supersecret_123456",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);


// ✅ ADMIN SESSION AUTH FOR EJS
const requireAdmin = (req, res, next) => {
  if (!req.session.admin) {
    return res.redirect("/admin/login");
  }
  next();
};

app.use("/api", cors(corsOptions));
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
app.use("/api/banners", bannerRoutes);

// === ADMIN AUTH & VIEW ROUTES ===
app.use("/admin", authRoutes);

// ✅ Admin Dashboard Render
app.get("/admin/dashboard/:section", requireAdmin, dashboardController.renderSection);

// === FILE TEMPLATE DOWNLOAD ===
const templatePath = path.join(__dirname, "public/templates");
app.get("/templates/:file", (req, res) => {
  const file = path.join(templatePath, req.params.file);
  fs.existsSync(file)
    ? res.download(file)
    : res.status(404).send("Không tìm thấy file!");
});

// === ROOT ===
app.get("/", (req, res) => {
  req.session.admin
    ? res.redirect("/admin/dashboard/product")
    : res.redirect("/admin/login");
});

// === 404 ===
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

// === START SERVER ===
const server = app.listen(process.env.PORT || 3000, "0.0.0.0", () => {
  const port = server.address().port;
  console.log(`Server chạy tại http://localhost:${port}`);
});
