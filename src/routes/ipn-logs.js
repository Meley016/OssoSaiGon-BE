const express = require("express");
const router = express.Router();
const IPNLog = require("../models/IPNLog");
const { requireVNPayRole } = require("../middlewares/auth");

// Trang render EJS riêng (không nằm trong dashboard)
router.get('/', requireVNPayRole, async (req, res) => {
  res.render('admin/ipn-logs', {
    title: 'Quản lý Log IPN VNPAY',
    user: req.session.admin || null,
  });
});

// API hỗ trợ JSON + export CSV
router.get('/export', requireVNPayRole, async (req, res) => {
  const { export: exportType, startDate, endDate, status, txnRef, page = 1, limit = 20 } = req.query;

  const query = {};
  if (startDate) query.receivedAt = { $gte: new Date(startDate) };
  if (endDate) {
    if (!query.receivedAt) query.receivedAt = {};
    query.receivedAt.$lte = new Date(endDate);
  }
  if (status) query.status = status;
  if (txnRef) query.txnRef = { $regex: txnRef, $options: 'i' };

  const skip = (page - 1) * limit;

  try {
    if (exportType === 'csv') {
      const logs = await IPNLog.find(query).sort({ receivedAt: -1 }).lean();
      const csv = [
        'Thời gian,TxnRef,Trạng thái,Response,IP nguồn,Lỗi',
        ...logs.map(log => [
          new Date(log.receivedAt).toLocaleString('vi-VN'),
          log.txnRef,
          log.status,
          JSON.stringify(log.response),
          log.clientIP,
          log.errorMessage || ''
        ].join(','))
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=ipn-logs.csv');
      res.send(csv);
    } else {
        const logs = await IPNLog.find(query)
        .sort({ receivedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean();  // nhanh hơn khi không cần document methods

        const total = await IPNLog.countDocuments(query);

        res.json({
        success: true,
        logs: logs.map(log => ({
            ...log,
            vnpParams: log.vnpParams || {},  // đảm bảo không undefined
            amountFormatted: log.vnpParams?.vnp_Amount ? (log.vnpParams.vnp_Amount / 100).toLocaleString('vi-VN') : '-'
        })),
        pagination: {
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            pages: Math.ceil(total / limit)
        }
        });
    }
  } catch (err) {
    console.error("Lỗi /api/admin/ipn-logs:", err);
    res.status(500).json({ success: false, msg: "Lỗi server khi lấy log IPN" });
  }
});

module.exports = router;