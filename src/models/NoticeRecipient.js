const mongoose = require('mongoose');

// Indexes already exist in the database: unique (notice_id, staff_id), plus staff_id - so
// Mongoose must not try to manage them.
const noticeRecipientSchema = new mongoose.Schema(
  {
    notice_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Notice', required: true },
    staff_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: false },
    autoIndex: false,
  }
);

module.exports = mongoose.model('NoticeRecipient', noticeRecipientSchema, 'notice_recipients');
