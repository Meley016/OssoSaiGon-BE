const csv = require('csv-parser');
const fs = require('fs');
const XLSX = require('xlsx');

exports.parseProductsCSV = (filePath) => {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => {
        // Convert CSV data to product format
        const products = results.map(row => ({
          name: row.name,
          description: row.description,
          category: row.categoryId,
          basePrice: parseFloat(row.basePrice),
          variants: JSON.parse(row.variants || '[]'),
          status: row.status || 'active'
        }));
        resolve(products);
      })
      .on('error', reject);
  });
};

exports.generateCSVProducts = async (products) => {
  return new Promise((resolve, reject) => {
    let csv = 'Name,Description,Category,Base Price,Status,SKU,Price,Stock\n';
    
    products.forEach(product => {
      product.variants.forEach(variant => {
        csv += `"${product.name}","${product.description}","${product.category.name}",${product.basePrice},"${product.status}","${variant.sku}",${variant.price},${variant.stock}\n`;
      });
    });

    resolve(csv);
  });
};

exports.generateExcelProducts = async (products) => {
  const wb = XLSX.utils.book_new();
  const wsData = [];

  wsData.push(['Name', 'Description', 'Category', 'Base Price', 'Status', 'SKU', 'Price', 'Stock']);
  
  products.forEach(product => {
    product.variants.forEach(variant => {
      wsData.push([
        product.name,
        product.description,
        product.category?.name,
        product.basePrice,
        product.status,
        variant.sku,
        variant.price,
        variant.stock
      ]);
    });
  });

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, 'Products');
  
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
};