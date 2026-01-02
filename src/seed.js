// src/seed.js
const mongoose = require("mongoose");
require("dotenv").config(); // nếu muốn dùng .env cho MONGO_URI

// ==== Connect MongoDB ====
const uri = process.env.MONGO_URI || "mongodb://localhost:27017/mydb";
mongoose.connect(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const db = mongoose.connection;
db.on("error", console.error.bind(console, "MongoDB connection error:"));
db.once("open", async () => {
  console.log("✅ MongoDB connected");

  try {
    // ==== Newsletter/Contact Schema ====
    const newsletterSchema = new mongoose.Schema(
      {
        email: { type: String, required: true }, // email người dùng
        name: { type: String, default: "" },     // tên người dùng nếu có
        message: { type: String, default: "" },  // tin nhắn hoặc thông báo
        type: { type: String, enum: ["newsletter", "contact"], required: true },
        status: { type: String, enum: ["new", "read"], default: "new" },
        isSeen: { type: Boolean, default: false }, // đánh dấu đã xem trong admin
      },
      { timestamps: true }
    );

    const Newsletter = mongoose.model("NewsletterContact", newsletterSchema);

    // ==== Clear old data ====
    await Newsletter.deleteMany({});

    // ==== Insert sample data ====
    const items = [
      {
        email: "user1@example.com",
        type: "newsletter",
        status: "new",
        message: "Xin chào! Đây là thông báo đầu tiên.",
      },
      {
        email: "user2@example.com",
        type: "contact",
        status: "read",
        message: "Bạn có một yêu cầu hỗ trợ từ người dùng.",
      },
      {
        email: "user3@example.com",
        type: "newsletter",
        status: "new",
        message: "Thông báo quan trọng!",
      },
      {
        email: "user4@example.com",
        type: "contact",
        status: "new",
        message: "Người dùng gửi yêu cầu hỗ trợ kỹ thuật.",
      },
    ];

    await Newsletter.insertMany(items);
    console.log("Inserted newsletter/contact documents:", items.length);

    console.log("✅ Seeding completed successfully!");
  } catch (err) {
    console.error("❌ Error seeding data:", err);
  } finally {
    mongoose.connection.close();
  }
});
