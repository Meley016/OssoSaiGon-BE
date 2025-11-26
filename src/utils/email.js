const axios = require("axios");
const fs = require("fs");
const path = require("path");

// === [MỚI] Import hàm lấy logo ===
const { getActiveLogo } = require("./logo");  

// === Hàm render HTML template ===
function renderTemplate(templateName, variables) {
  const filePath = path.join(__dirname, "../templates", `${templateName}.html`);
  let html = fs.readFileSync(filePath, "utf8");

  // Replace an toàn bằng split + join
  for (const [key, value] of Object.entries(variables)) {
    html = html.split(`{{${key}}}`).join(value);
  }

  return html;
}

// === Gửi email qua Brevo API ===
async function sendEmail({ to, subject, templateName, variables }) {
  // === [MỚI] Lấy logo từ DB (internal) ===
  const logoUrl = await getActiveLogo();  
  const fullVariables = { ...variables, logo: logoUrl }; // <-- Gộp vào variables

  const html = renderTemplate(templateName, fullVariables); // <-- Dùng fullVariables

  try {
    const res = await axios.post(
      "https://api.brevo.com/v3/smtp/email",
      {
        sender: {
          name: process.env.BREVO_NAME || "Oso Saigon",
          email: process.env.BREVO_SENDER,
        },
        to: [{ email: to }],
        subject,
        htmlContent: html,
      },
      {
        headers: {
          "api-key": process.env.BREVO_API_KEY,
          "content-type": "application/json",
        },
      }
    );

    console.log(`Email gửi thành công tới ${to}`);
  } catch (error) {
    console.error("Lỗi gửi email qua Brevo:", error.response?.data || error.message);
    throw new Error("Không thể gửi email");
  }
}

module.exports = { sendEmail };