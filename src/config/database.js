const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // === LOG DEBUG ===
    console.log("Đang kết nối MongoDB...");
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI không tồn tại trong Environment Variables!");
    }

    // === KẾT NỐI VỚI TIMEOUT NGẮN (Render yêu cầu) ===
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000, // 5s
      connectTimeoutMS: 10000,
    });

    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error("MongoDB Connection Failed:", error.message);
    process.exit(1); // Dừng server → Render báo lỗi rõ, KHÔNG Timed Out
  }
};

module.exports = connectDB;