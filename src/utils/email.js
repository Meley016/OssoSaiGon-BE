// src/utils/email.js
const nodemailer = require("nodemailer");

// SỬA: DÙNG createTransport() – ĐÚNG CÁCH NODemailer v7+
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT),
  secure: process.env.EMAIL_SECURE === "true", // true cho 465, false cho 587
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Test transporter (tùy chọn)
transporter.verify((error, success) => {
  if (error) {
    console.error("Transporter config error:", error);
  } else {
    console.log("Email transporter ready!");
  }
});

async function sendEmail({ to, subject, html }) {
  try {
    const info = await transporter.sendMail({
      from: `"Osso Saigon" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
    console.log(`Email sent to ${to} | ID: ${info.messageId}`);
  } catch (err) {
    console.error("Send email failed:", err);
    throw new Error("Không thể gửi email xác nhận");
  }
}

module.exports = { sendEmail };