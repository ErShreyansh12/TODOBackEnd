const mongoose = require('mongoose');
const StaffStatus = require('../constants/staffStatus');

const staffSchema = new mongoose.Schema(
  {
    employee_code: {
      type: String,
      required: true,
      unique: true,
    },
    first_name: {
      type: String,
      required: true,
      trim: true,
    },
    last_name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    status: {
      type: String,
      enum: Object.values(StaffStatus),
      default: StaffStatus.ACTIVE,
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      required: true,
      index: true,
    },
    password_reset_at: {
      type: Date,
      default: null,
    },
    last_login_at: {
      type: Date,
      default: null,
    },
    deleted_at: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

module.exports = mongoose.model('Staff', staffSchema, 'staff');
