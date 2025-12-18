const Product = require("../models/Product");
const { sendEmail } = require("../utils/email");

exports.createPreorder = async (req, res) => {
  try {
    const user = req.user;
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({ error: "Thiếu productId" });
    }

    const product = await Product.findById(productId)
      .populate("variants.color", "name")
      .populate("variants.size", "name");

    if (!product) {
      return res.status(404).json({ error: "Không tìm thấy sản phẩm" });
    }

    // 👉 Lấy variant hết hàng (hoặc có thể gửi tất cả variant nếu muốn)
    const outOfStockVariants = product.variants.filter(
      v => v.stockQuantity === 0
    );

    if (outOfStockVariants.length === 0) {
      return res.status(400).json({ error: "Không có variant hết hàng" });
    }

    // ✅ Render HTML variant (bao gồm tồn kho)
    const variantTableHtml = outOfStockVariants
      .map(v => `
        <tr>
          <td>${v.sku || "-"}</td>
          <td>${v.color?.name || "-"}</td>
          <td>${v.size?.name || "-"}</td>
          <td>${v.price?.toLocaleString("vi-VN")} VND</td>
          <td>${v.stockQuantity === 0 ? "HẾT HÀNG" : v.stockQuantity}</td>
        </tr>
      `)
      .join("");

    await sendEmail({
      to: process.env.ADMIN_EMAIL,
      subject: `[PREORDER] ${product.name}`,
      templateName: "preorder",
      variables: {
        userName: user?.name || "Chưa cập nhật",
        userEmail: user?.email || "-",
        productName: product.name,
        variantTable: variantTableHtml,
        time: new Date().toLocaleString("vi-VN"),
      },
    });

    return res.json({ success: true });
  } catch (err) {
    console.error("❌ preorder error:", err);
    return res.status(500).json({ error: "Không thể gửi preorder" });
  }
};
