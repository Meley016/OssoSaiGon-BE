const axios = require("axios");
const fs = require("fs");
const path = require("path");

// === Hàm render HTML template ===
function renderTemplate(templateName, variables) {
  const filePath = path.join(__dirname, "../templates", `${templateName}.html`);
  let html = fs.readFileSync(filePath, "utf8");
  for (const [key, value] of Object.entries(variables)) {
    html = html.replace(new RegExp(`{{${key}}}`, "g"), value);
  }
  return html;
}

// === Gửi email qua Brevo API ===
async function sendEmail({ to, subject, templateName, variables }) {
  const html = renderTemplate(templateName, variables);

  try {
    const res = await axios.post(
      "https://api.brevo.com/v3/smtp/email",
      {
        sender: {
          name: process.env.BREVO_NAME || "Osso Saigon",
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

    console.log(`✅ Email gửi thành công tới ${to}`);
  } catch (error) {
    console.error("❌ Lỗi gửi email qua Brevo:", error.response?.data || error.message);
    throw new Error("Không thể gửi email");
  }
}

module.exports = { sendEmail };
