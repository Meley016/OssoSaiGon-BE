const mongoose = require('mongoose');

const ipnLogSchema = new mongoose.Schema({
  txnRef: { type: String, required: true, index: true },
  vnpParams: { type: Object, required: true },
  clientIP: { type: String },
  receivedAt: { type: Date, default: Date.now, index: true },


  status: {
    type: String,
    enum: ['pending', 'success', 'failed', 'duplicate', 'processing', 'refunded'],  
    default: 'pending'
  },

  // Lưu mã trạng thái THẬT từ VNPay (để đối chiếu, báo cáo)
  vnpResponseCode: { type: String },            
  vnpTransactionStatus: { type: String },      

  response: { type: Object },                  

  // Các trường bổ sung hữu ích
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' }, 
}, { timestamps: true });

// Index để TTL (xóa log cũ sau 180 ngày)
ipnLogSchema.index({ receivedAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

// Index thường dùng để query
ipnLogSchema.index({ txnRef: 1 });
ipnLogSchema.index({ status: 1 });
ipnLogSchema.index({ vnpResponseCode: 1 });

module.exports = mongoose.model('IPNLog', ipnLogSchema);