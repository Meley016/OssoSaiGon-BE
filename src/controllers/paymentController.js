exports.createPayment = async (req, res) => {
  try {
    const { method, amount, orderId } = req.body;

    switch (method) {
      case "vnpay":
        return res.redirect(`/api/payment/vnpay?amount=${amount}&orderId=${orderId}`);

      case "paypal":
        return res.json({
          redirectUrl: `/api/payment/paypal?orderId=${orderId}`
        });
        case "bank_transfer":      // <--- hoặc nếu frontend gửi "banking"
        return res.json({ success: true, message: "Thanh toán chuyển khoản ngân hàng" });

      case "stripe":
        // Gọi endpoint tạo PaymentIntent của Stripe và trả về clientSecret
        const stripeResponse = await fetch(`${process.env.SERVER_URL}/api/payment/create-payment-intent`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: req.user._id, items: req.body.items, shippingAddress: req.body.shippingAddress, promotionId: req.body.promotionId })
        });
        const stripeData = await stripeResponse.json();
        return res.json({ clientSecret: stripeData.clientSecret, orderId: stripeData.orderId });

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
