const mongoose = require('mongoose');
const AssigneeType = require('../constants/assigneeType');
const TaskPriority = require('../constants/taskPriority');
const TaskTimeline = require('../constants/taskTimeline');

// Indexes already exist in the database (see DB/migrations), so Mongoose must not try to manage them.
const taskSeriesSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: null },
    attachment_url: { type: String, default: null },
    broker: { type: String, default: null },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
    assignee_type: { type: String, enum: Object.values(AssigneeType), required: true },
    assignee_id: { type: mongoose.Schema.Types.ObjectId, required: true },
    priority: { type: String, enum: Object.values(TaskPriority), required: true },
    timeline: { type: String, enum: Object.values(TaskTimeline), required: true },
    time_of_day: { type: String, required: true },
    timezone: { type: String, required: true },
    custom_dates: { type: mongoose.Schema.Types.Mixed, default: null },
    monthly_day: { type: Number, default: null },
    last_due_date: { type: Date, required: true },
    ended_at: { type: Date, default: null },
    deleted_at: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    autoIndex: false,
  }
);

module.exports = mongoose.model('TaskSeries', taskSeriesSchema, 'task_series');
