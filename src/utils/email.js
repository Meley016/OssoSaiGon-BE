const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || "smtp.gmail.com",
  port: process.env.EMAIL_PORT || 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_SENDER,
    pass: process.env.EMAIL_PASS,
  },
});

// === Hàm render HTML template ===
function renderTemplate(templateName, variables) {
  const filePath = path.join(__dirname, "../templates", `${templateName}.html`);
  let html = fs.readFileSync(filePath, "utf8");
  for (const [key, value] of Object.entries(variables)) {
    html = html.replace(new RegExp(`{{${key}}}`, "g"), value);
  }
  return html;
}

// === Hàm gửi email ===
async function sendEmail({ to, subject, templateName, variables }) {
  const html = renderTemplate(templateName, variables);

  try {
    const info = await transporter.sendMail({
      from: `"Osso Saigon" <${process.env.EMAIL_SENDER}>`,
      to,
      subject,
      html,
    });
    console.log(`✅ Đã gửi email tới ${to}: ${info.messageId}`);
  } catch (error) {
    console.error("❌ Gửi email thất bại:", error);
    throw new Error("Không thể gửi email");
  }
}

module.exports = { sendEmail };
