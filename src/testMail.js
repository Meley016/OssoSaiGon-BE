require("dotenv").config();
const { sendEmail } = require("./utils/email");

(async () => {
  await sendEmail({
    to: "abc160cba@gmail.com",
    subject: "Test gửi Gmail qua Nodemailer",
    templateName: "resetPassword",
    variables: { time: new Date().toLocaleString() },
  });
})();
