const mongoose = require('mongoose');
const NoticeStatus = require('../constants/noticeStatus');

// Indexes already exist in the database (created_by, status), so Mongoose must not try to manage them.
const noticeSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    message: { type: String, default: null },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
    status: { type: String, enum: Object.values(NoticeStatus), required: true, default: NoticeStatus.ACTIVE },
    deleted_at: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    autoIndex: false,
  }
);

module.exports = mongoose.model('Notice', noticeSchema, 'notices');
