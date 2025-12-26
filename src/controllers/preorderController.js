// controllers/preorderController.js
const Preorder = require("../models/Preorder");
const Product = require("../models/Product");
const { sendEmail } = require("../utils/email");
const { Parser } = require("json2csv");

exports.createPreorder = async (req, res) => {
  try {
    const user = req.user;
    const { productId, items } = req.body;

    // validate email
    if (!user?.email) {
      return res.status(400).json({ error: "Vui lòng nhập email để preorder" });
    }

    // validate product + items
    if (!productId || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Thiếu dữ liệu preorder" });
    }

    const product = await Product.findById(productId)
      .populate({
        path: "variants.color",
        select: "name"
      })
      .populate({
        path: "variants.size",
        select: "name"
      })
      .lean();
      
    if (!product) return res.status(404).json({ error: "Product không tồn tại" });

    // validate mỗi item phải có color + size
    for (const item of items) {
      const variant = product.variants.find(v => v.sku === item.variantId);
      if (!variant) return res.status(400).json({ error: "Variant không tồn tại" });
      if (!variant.color && !item.color?.name) return res.status(400).json({ error: "Vui lòng chọn màu" });
      if (!variant.size && !item.size?.name) return res.status(400).json({ error: "Vui lòng chọn size" });
    }

    const itemsWithInfo = items.map(item => {
      const variant = product.variants.find(v => v.sku === item.variantId);
      const color = variant.color || item.color || { id: "", name: "-" };
      const size  = variant.size  || item.size  || { id: "", name: "-" };
      return {
        ...item,
        sku: variant.sku,
        color: { id: color._id || color.id || "", name: color.name || "-" },
        size:  { id: size._id  || size.id  || "-", name: size.name  || "-" },
        price: variant.price || 0,
        image: variant.coverImage || product.coverImage || "",
      };
    });



    // tạo preorder
    const preorder = await Preorder.create({
      user: {
        name: user?.name || "Chưa cập nhật",
        email: user.email,
      },
      productId,
      items: itemsWithInfo,
    });

    // Tính tổng tiền
    const totalPrice = itemsWithInfo.reduce(
      (sum, item) => sum + (item.price || 0) * (item.quantity || 0),
      0
    );

    // Render bảng variant VND
    const variantTableHtml = itemsWithInfo.map(v => `
      <tr>
        <td>${v.sku}</td>
        <td>${v.color?.name || "-"}</td>
        <td>${v.size?.name || "-"}</td>
        <td>${v.quantity}</td>
        <td>${(v.price || 0).toLocaleString("vi-VN")} VND</td>
        <td>${((v.price || 0) * (v.quantity || 0)).toLocaleString("vi-VN")} VND</td>
      </tr>
    `).join("");

  // **Tính USD**
  const exchangeRate = 30000; // 1 USD = 30k VND

  const variantTableUSD = itemsWithInfo.map(v => {
    const priceUSD = (v.price / exchangeRate).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const totalUSD = ((v.price * v.quantity) / exchangeRate).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `
      <tr>
        <td>${v.sku}</td>
        <td>${v.color?.name || "-"}</td>
        <td>${v.size?.name || "-"}</td>
        <td>${v.quantity}</td>
        <td>$${priceUSD}</td>
        <td>$${totalUSD}</td>
      </tr>
    `;
  }).join("");

  const totalPriceUSD = (totalPrice / exchangeRate).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // Gửi email
    await sendEmail({
      to: process.env.ADMIN_EMAIL,
      subject: `[PREORDER] ${user?.email}`,
      templateName: "preorder",
      variables: {
        userName: preorder.user.name,
        userEmail: preorder.user.email,
        productName: product.name,
        productImage: itemsWithInfo[0]?.image || product.coverImage || "", 
        variantTable: variantTableHtml,
        totalPrice: totalPrice.toLocaleString("vi-VN") + " VND",
        variantTableUSD,
        totalPriceUSD,
        time: new Date().toLocaleString("vi-VN"),
      },
    });


    res.json({ success: true });

  } catch (err) {
    console.error("❌ preorder error:", err);
    res.status(500).json({ error: "Không thể tạo preorder" });
  }
};

/**
 * Lấy tất cả preorder
 */
exports.getPreorders = async (req, res) => {
  try {
    const preorders = await Preorder.find()
      .sort({ createdAt: -1 })
      .lean();

    res.json(preorders);
  } catch (err) {
    console.error("❌ getPreorders error:", err);
    res.status(500).json({ error: "Không thể lấy preorder" });
  }
};

exports.exportPreorders = async (req, res) => {
  try {
    const preorders = await Preorder.find().lean();

    const rows = preorders.flatMap(p =>
      p.items.map(i => ({
        customer: p.user.email,
        sku: i.sku,
        color: i.color.name,
        size: i.size.name,
        quantity: i.quantity,
        price: i.price,
        createdAt: p.createdAt,
      }))
    );

    const parser = new Parser();
    const csv = parser.parse(rows);

   
    res.header("Content-Type", "text/csv; charset=UTF-8");
    res.attachment("preorders.csv");
    res.send('\uFEFF' + csv); 
  } catch (err) {
    console.error("❌ exportPreorders error:", err);
    res.status(500).json({ error: "Không thể xuất preorder" });
  }
};
