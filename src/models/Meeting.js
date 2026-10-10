const mongoose = require('mongoose');

// A meeting the admins need to hold. Most have no fixed slot yet ("sync with the CA this week"), so the
// date and times are optional. They are kept as wall-clock strings in APP_TIMEZONE ("2026-10-12",
// "14:30") rather than UTC Dates, because an undated or untimed meeting has no instant to store.
const meetingSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    attendees: { type: String, trim: true, default: '' },
    location: { type: String, trim: true, default: '' },
    notes: { type: String, default: '' },
    date: { type: String, default: null },
    start_time: { type: String, default: null },
    end_time: { type: String, default: null },
    created_by: { type: mongoose.Schema.Types.ObjectId, required: true },
    done_at: { type: Date, default: null },
    deleted_at: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

meetingSchema.index({ deleted_at: 1, done_at: 1, date: 1 });

module.exports = mongoose.model('Meeting', meetingSchema, 'meetings');
