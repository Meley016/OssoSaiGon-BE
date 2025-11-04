require("dotenv").config();
const { sendEmail } = require("./utils/email");

(async () => {
  await sendEmail({
    to: "abc160cba@gmail.com",
    subject: "Test gửi Gmail qua Nodemailer",
    html: "<h3>Xin chào từ Osso Saigon 💌</h3><p>Mail này gửi thành công!</p>",
  });
})();
