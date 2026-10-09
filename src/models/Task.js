const mongoose = require('mongoose');
const AssigneeType = require('../constants/assigneeType');
const TaskPriority = require('../constants/taskPriority');
const TaskStatus = require('../constants/taskStatus');

// Indexes already exist in the database (see DB/migrations), so Mongoose must not try to manage them.
const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: null },
    attachment_url: { type: String, default: null },
    broker: { type: String, default: null },
    // No `ref`: this can point at either Admin or Staff, same as assignee_id - see created_by_type.
    created_by: { type: mongoose.Schema.Types.ObjectId, required: true },
    // The default only ever applies to rows created before this field existed (migration 003): every one
    // of those was created by an admin, since staff couldn't create tasks yet. Without it, any save of such
    // a row failed validation, which surfaced as a 500 on status change/edit/delete. createTask always sets it.
    created_by_type: { type: String, enum: Object.values(AssigneeType), required: true, default: AssigneeType.ADMIN },
    assignee_type: { type: String, enum: Object.values(AssigneeType), required: true },
    assignee_id: { type: mongoose.Schema.Types.ObjectId, required: true },
    priority: { type: String, enum: Object.values(TaskPriority), required: true },
    status: { type: String, enum: Object.values(TaskStatus), required: true },
    timeline: { type: String, default: null },
    due_date: { type: Date, default: null },
    custom_dates: { type: mongoose.Schema.Types.Mixed, default: null },
    delay_reason: { type: String, default: null },
    delay_reason_added_at: { type: Date, default: null },
    series_id: { type: mongoose.Schema.Types.ObjectId, ref: 'TaskSeries', default: null },
    completion_at: { type: Date, default: null },
    deleted_at: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    autoIndex: false,
  }
);

module.exports = mongoose.model('Task', taskSchema, 'tasks');
