//src/index.js

const express = require("express");
const cors = require("cors");
const session = require("express-session");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const connectDB = require("./config/database");

// === IMPORT ROUTES ===
const authRoutes = require("./routes/auth");
const productRoutes = require("./routes/products");
const categoryRoutes = require("./routes/categories");
const colorRoutes = require("./routes/colors");
const sizeRoutes = require("./routes/sizes");
const promotionRoutes = require("./routes/promotions");
const orderRoutes = require("./routes/orders");
const userRoutes = require("./routes/user");
const shippingRoutes = require("./routes/shipping");

// === IMPORT CONTROLLER ===
const dashboardController = require("./controllers/dashboardController");

// === KẾT NỐI DB ===
connectDB();

const app = express();
const PORT = process.env.PORT || 3000;

// === CẤU HÌNH VIEWS & STATIC ===
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views")); // ĐÚNG: src/views

app.use(express.static(path.join(__dirname, "public")));           // ĐÚNG: src/public
app.use("/uploads", express.static(path.join(__dirname, "../uploads"))); // ĐÚNG: server/uploads

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// === SESSION ===
app.use(
  session({
    secret: process.env.SESSION_SECRET || "supersecret_123456",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000
    }
  })
);

app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true
  })
);

// === MIDDLEWARE: BẢO VỆ DASHBOARD ===
const requireAdmin = (req, res, next) => {
  if (!req.session.admin) {
    return res.redirect("/admin/login");
  }
  next();
};

// === API ROUTES (JSON) ===
app.use("/api/products", productRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/colors", colorRoutes);
app.use("/api/sizes", sizeRoutes);
// === NEW CRUD API (Users - Shipping - Promotions - Orders) ===
app.use("/api/users", userRoutes);
app.use("/api/shipping", shippingRoutes);
app.use("/api/promotions", promotionRoutes);
app.use("/api/orders", orderRoutes);


// === ADMIN AUTH ROUTES ===
app.use("/admin", authRoutes); // /admin/login, /admin/logout

// === DASHBOARD RENDER ROUTU
app.get("/admin/dashboard/:section", requireAdmin, dashboardController.renderSection);

// === TẢI MẪU IMPORT ===
const templatePath = path.join(__dirname, "public/templates");

app.get("/templates/import-product.xlsx", (req, res) => {
  const file = path.join(templatePath, "import-product.xlsx");
  fs.existsSync(file)
    ? res.download(file, "import-product-template.xlsx")
    : res.status(404).send("Không tìm thấy file mẫu Excel");
});

app.get("/templates/import-product.csv", (req, res) => {
  const file = path.join(templatePath, "import-product.csv");
  fs.existsSync(file)
    ? res.download(file, "import-product-template.csv")
    : res.status(404).send("Không tìm thấy file mẫu CSV");
});

// === HOME ROOT ===
app.get("/", (req, res) => {
  req.session.admin
    ? res.redirect("/admin/dashboard/product")
    : res.redirect("/admin/login");
});

// === 404 HANDLER ===
app.use((req, res, next) => {
  const isHTML = req.headers.accept?.includes("text/html");
  const isJSON = req.headers.accept?.includes("application/json");

  if (isJSON) return res.status(404).json({ error: "Route không tồn tại!" });
  if (isHTML) return res.status(404).render("admin/404", { title: "404" });
  res.status(404).send("Không tìm thấy");
});

// === GLOBAL ERROR HANDLER ===
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  console.error("GLOBAL ERROR:", err);

  const status = err.status || 500;
  const message = err.message || "Lỗi server!";

  const isJSON = req.headers.accept?.includes("application/json");
  if (isJSON) return res.status(status).json({ error: message });

  res.status(status).render("admin/error", { title: "Lỗi", error: message });
});

// === START SERVER ===
app.listen(PORT, () => {
  console.log(`Server chạy tại http://localhost:${PORT}`);
  console.log(`Views: ${path.join(__dirname, "views")}`);
  console.log(`Public: ${path.join(__dirname, "public")}`);
  console.log(`Uploads: ${path.join(__dirname, "../uploads")}`);
});