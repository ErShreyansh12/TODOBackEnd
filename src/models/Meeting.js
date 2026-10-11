const mongoose = require('mongoose');

// Indexes already exist in the database (admin_id + meeting_date), so Mongoose must not try to manage them.
// The collection's validator requires `location` to be a string, so it is required here too.
const meetingSchema = new mongoose.Schema(
  {
    admin_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
    title: { type: String, required: true, trim: true },
    // Midnight at the start of the meeting's calendar day in the app time zone (Asia/Kolkata), as UTC.
    meeting_date: { type: Date, required: true },
    // 24-hour "HH:mm" in the app time zone.
    start_time: { type: String, required: true },
    end_time: { type: String, required: true },
    location: { type: String, required: true, trim: true },
    description: { type: String, default: null },
    deleted_at: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    autoIndex: false,
  }
);

module.exports = mongoose.model('Meeting', meetingSchema, 'meetings');
