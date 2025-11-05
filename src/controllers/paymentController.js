exports.createPayment = async (req, res) => {
  try {
    const { method, amount, orderId } = req.body;

    switch (method) {
      case "vnpay":
        return res.redirect(`/api/payment/vnpay?amount=${amount}&orderId=${orderId}`);
      case "paypal":
        return res.redirect(`/api/payment/paypal?amount=${amount}&orderId=${orderId}`);
      case "cod":
        return res.json({ success: true, message: "Thanh toán khi nhận hàng (COD)" });
      default:
        return res.status(400).json({ success: false, msg: "Phương thức không hợp lệ" });
    }
  } catch (err) {
    console.error("Payment create error:", err);
    res.status(500).json({ success: false, msg: "Lỗi server" });
  }
};
