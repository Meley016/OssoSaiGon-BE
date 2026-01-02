// middlewares/notificationCount.js
const Order = require("../models/Order");
const Preorder = require("../models/Preorder");
const NewsletterContact = require("../models/NewLetterContact");

module.exports = async (req, res, next) => {
  try {
    const [
      orderUnseen,
      preorderUnseen,
      newsletterUnseen,
      contactUnseen,
    ] = await Promise.all([
      Order.countDocuments({ isSeen: false }),
      Preorder.countDocuments({ isSeen: false }),
      NewsletterContact.countDocuments({
        type: "newsletter",
        status: "new",
      }),
      NewsletterContact.countDocuments({
        type: "contact",
        status: "new",
      }),
    ]);

    res.locals.orderUnseen = orderUnseen;
    res.locals.preorderUnseen = preorderUnseen;
    res.locals.newsletterUnseen = newsletterUnseen;
    res.locals.contactUnseen = contactUnseen;
    res.locals.totalUnseen =
      orderUnseen + preorderUnseen + newsletterUnseen + contactUnseen;

    next();
  } catch (err) {
    console.error("notificationCount error:", err);
    next();
  }
};
