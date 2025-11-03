// test-email.js
require("dotenv").config();
const { sendEmail } = require("./utils/email");

sendEmail({
  to: "abc160cba@gmail.com", // ← email nhận thử
  subject: "Test Email từ Osso Saigon",
  html: `
    <h1>Xin chào!</h1>
    <p>Email hệ thống hoạt động hoàn hảo!</p>
    <p>Thời gian: ${new Date().toLocaleString("vi-VN")}</p>
  `,
}).catch(console.error);