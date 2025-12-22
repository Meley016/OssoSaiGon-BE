// const Order = require("../models/Order");
// const Preorder = require("../models/Preorder");

// /**
//  * GET /admin/dashboard/notification
//  */
// exports.renderNotification = async (req, res) => {
//   try {
//     const tab = req.query.tab || "order";

//     const [orders, preorders, orderUnseen, preorderUnseen] =
//       await Promise.all([
//         Order.find()
//           .sort({ createdAt: -1 })
//           .limit(20)
//           .lean(),

//         Preorder.find()
//           .sort({ createdAt: -1 })
//           .limit(20)
//           .lean(),

//         Order.countDocuments({ isSeen: false }),
//         Preorder.countDocuments({ isSeen: false }),
//       ]);

//     res.render("admin/dashboard", {
//       activeMenu: "notification",
//       notifyTab: tab,
//       admin: req.admin,

//       orders,
//       preorders,

//       orderUnseen,
//       preorderUnseen,
//     });
//   } catch (err) {
//     console.error("Notification error:", err);
//     res.status(500).render("admin/error", {
//       title: "Lỗi notification",
//       error: err.message,
//     });
//   }
// };
