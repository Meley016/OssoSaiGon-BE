require("dotenv").config(); // 👈 QUAN TRỌNG

const mongoose = require("mongoose");
const Product = require("./models/Product"); // chú ý path

async function migrateVariantIds() {
  await mongoose.connect(process.env.MONGO_URI);

  const products = await Product.find({
    "variants._id": { $exists: false }
  });

  let total = 0;

  for (const product of products) {
    let changed = false;

    product.variants.forEach(v => {
      if (!v._id) {
        v._id = new mongoose.Types.ObjectId();
        changed = true;
      }
    });

    if (changed) {
      await product.save();
      total++;
    }
  }

  console.log(`✅ Migration done. Updated ${total} products`);
  process.exit(0);
}

migrateVariantIds().catch(err => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
