/**
 * TEST IPN VNPay – ALL CASES
 * - Tự tạo nhiều ORDER pending
 * - Gửi IPN theo đúng spec VNPay
 * - Test: success, duplicate, cancel, amount fail, invalid hash, fail
 *
 * Chạy:
 * node src/test-vnpay-ipn-all.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const crypto = require('crypto');

const Order = require('./models/Order');
const {User} = require('./models/User');

// ================= CONFIG =================
const IPN_URL = 'http://localhost:3000/api/payment/vnpay-ipn';
const TMN_CODE = process.env.VNP_TMNCODE;
const HASH_SECRET = process.env.VNP_HASHSECRET;
const MONGO_URI = process.env.MONGO_URI;

// ================= DB =================
async function connectDB() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Mongo connected');
}

// ================= HELPERS =================
function formatDate(date = new Date()) {
  const vn = new Date(date.getTime() + 7 * 3600 * 1000);
  return vn.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
}

function signVNPay(params) {
  const raw = Object.keys(params)
    .filter(k => k !== 'vnp_SecureHash')
    .sort()
    .map(k => `${k}=${params[k]}`)
    .join('&');

  return crypto
    .createHmac('sha512', HASH_SECRET)
    .update(raw)
    .digest('hex');
}

function buildIPN({ txnRef, amount = 100000, responseCode = '00', txnStatus = '00' }, sign = true) {
  const params = {
    vnp_TmnCode: TMN_CODE,
    vnp_TxnRef: txnRef,
    vnp_Amount: String(amount * 100), // VNPay *100
    vnp_OrderInfo: 'Test VNPay IPN',
    vnp_ResponseCode: responseCode,
    vnp_TransactionStatus: txnStatus,
    vnp_TransactionNo: Math.floor(Math.random() * 1e9).toString(),
    vnp_BankCode: 'NCB',
    vnp_CardType: 'ATM',
    vnp_PayDate: formatDate(),
  };

  if (sign) {
    params.vnp_SecureHash = signVNPay(params);
  }

  return params;
}

// ================= CREATE ORDER =================
async function createOrder(txnRef, total = 100000) {
  let user = await User.findOne();
  if (!user) {
    user = await User.create({
      username: 'vnpay_test',
      email: 'vnpay_test@gmail.com',
      password: '123456',
    });
  }

  const order = await Order.create({
    userId: user._id,
    paymentMethod: 'vnpay',

    shippingAddress: {
      fullName: 'VNPay Test',
      phone: '0900000000',
      street: '123 Test Street',
      ward: 'Ward 1',
      district: 'District 1',
      city: 'HCM',
    },

    items: [
      {
        productId: new mongoose.Types.ObjectId(),
        productName: 'Test Product',
        sku: 'VNPAY-TEST',
        quantity: 1,
        price: total,
      },
    ],

    subtotal: total,
    discount: 0,
    total,
    status: 'pending',
    isTemporary: true,
    vnpayTxnRef: txnRef,
  });

  console.log('🧾 Order created:', order.orderCode, '| TxnRef:', txnRef);
  return order;
}

// ================= SEND IPN =================
async function sendIPN(name, params) {
  console.log(`\n=== ${name} ===`);
  console.log('Params:', params);
  const res = await axios.get(IPN_URL, { params });
  console.log('Response:', res.data);
}

// ================= RUN =================
async function run() {
  await connectDB();

  // 1️⃣ SUCCESS
  const txnSuccess = `ORDER_SUCCESS_${Date.now()}`;
  await createOrder(txnSuccess);
  await sendIPN('SUCCESS (00)', buildIPN({ txnRef: txnSuccess }));

  // 2️⃣ DUPLICATE
  await sendIPN('DUPLICATE IPN', buildIPN({ txnRef: txnSuccess }));

  // 3️⃣ CUSTOMER CANCEL
  const txnCancel = `ORDER_CANCEL_${Date.now()}`;
  await createOrder(txnCancel);
  await sendIPN(
    'CANCEL (24)',
    buildIPN({
      txnRef: txnCancel,
      responseCode: '24',
      txnStatus: '02',
    })
  );

  // 4️⃣ AMOUNT MISMATCH
  const txnAmountFail = `ORDER_AMOUNT_FAIL_${Date.now()}`;
  await createOrder(txnAmountFail, 100000);
  await sendIPN(
    'AMOUNT FAIL (04)',
    buildIPN({
      txnRef: txnAmountFail,
      amount: 50000, // sai tiền
    })
  );

  // 5️⃣ INVALID SIGNATURE
  const txnInvalidHash = `ORDER_INVALID_HASH_${Date.now()}`;
  await createOrder(txnInvalidHash);
  await sendIPN(
    'INVALID SIGNATURE (97)',
    buildIPN({ txnRef: txnInvalidHash }, false)
  );

  // 6️⃣ FAILED TRANSACTION
  const txnFail = `ORDER_FAIL_${Date.now()}`;
  await createOrder(txnFail);
  await sendIPN(
    'FAILED (99)',
    buildIPN({
      txnRef: txnFail,
      responseCode: '99',
      txnStatus: '99',
    })
  );

  console.log('\n=== DONE ===');
  console.log('👉 Check IPN LOG + Order status');
  process.exit(0);
}

run();
