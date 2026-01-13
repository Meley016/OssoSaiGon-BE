// migration-add-salePrice.js
// Chạy bằng lệnh: node migration-add-salePrice.js
// Đặt file này ở thư mục gốc server (cùng cấp với package.json)

require('dotenv').config(); // Load .env (đảm bảo có MONGO_URI)

const mongoose = require('mongoose');
const Product = require('./models/Product'); // Đường dẫn đúng tới model Product

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('LỖI: Không tìm thấy MONGO_URI trong file .env');
  console.log('Vui lòng kiểm tra file .env có dòng: MONGO_URI=mongodb://...');
  process.exit(1);
}

async function migrateSalePrice() {
  try {
    console.log('Đang kết nối tới MongoDB...');
    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Kết nối MongoDB thành công!');

    console.log('Đang quét tất cả sản phẩm...');
    const products = await Product.find({}).lean(); // lean() để nhanh hơn
    console.log(`Tìm thấy ${products.length} sản phẩm.`);

    let updatedProducts = 0;
    let updatedVariantsTotal = 0;

    for (const product of products) {
      let needsUpdate = false;
      let updatedInThisProduct = 0;

      // Duyệt từng variant
      for (const variant of product.variants || []) {
        if (variant.salePrice === undefined) {
          variant.salePrice = null;
          updatedInThisProduct++;
          needsUpdate = true;
        }
      }

      if (needsUpdate) {
        // Cập nhật lại document
        await Product.updateOne(
          { _id: product._id },
          { $set: { "variants": product.variants } }
        );
        updatedProducts++;
        updatedVariantsTotal += updatedInThisProduct;

        console.log(
          `Đã cập nhật sản phẩm: ${product.name || 'Không tên'} ` +
          `(${product._id}) - Thêm salePrice cho ${updatedInThisProduct} biến thể`
        );
      }
    }

    console.log('\n=== KẾT QUẢ MIGRATION ===');
    console.log(`Tổng sản phẩm được cập nhật: ${updatedProducts}`);
    console.log(`Tổng biến thể được thêm salePrice: ${updatedVariantsTotal}`);
    console.log('Hoàn tất! Tất cả variant cũ giờ đã có salePrice (null nếu không có giá trị).');

  } catch (err) {
    console.error('LỖI KHI MIGRATION:');
    console.error(err.stack || err.message);
  } finally {
    console.log('Ngắt kết nối MongoDB...');
    await mongoose.disconnect();
  }
}

// Chạy hàm
migrateSalePrice();