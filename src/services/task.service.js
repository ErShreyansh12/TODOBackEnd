const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const env = require('../config/env');
const { TASK_UPLOAD_DIR } = require('../config/uploads');
const Admin = require('../models/Admin');
const Staff = require('../models/Staff');
const Task = require('../models/Task');
const TaskSeries = require('../models/TaskSeries');
const AssigneeType = require('../constants/assigneeType');
const Roles = require('../constants/roles');
const StaffStatus = require('../constants/staffStatus');
const TaskStatus = require('../constants/taskStatus');
const TaskTimeline = require('../constants/taskTimeline');
const TaskDisplayStatus = require('../constants/taskDisplayStatus');
const ErrorCodes = require('../constants/errorCodes');
const AppError = require('../utils/AppError');
const { buildPaginationMeta } = require('../utils/pagination');
const {
  nextOccurrence,
  isValidCalendarDate,
  dayOfMonthIn,
  toLocalParts,
  customDateTimes,
} = require('../utils/recurrence');

const RECENT_COMPLETED_WINDOW_DAYS = 7;

function validationError(message) {
  return new AppError(message, 422, ErrorCodes.VALIDATION_ERROR);
}

async function resolveAssignee(assigneeType, assigneeId) {
  if (assigneeType === AssigneeType.STAFF) {
    const staff = await Staff.findOne({ _id: assigneeId, deleted_at: null });

    if (!staff) {
      throw validationError('Assigned staff member not found.');
    }

    if (staff.status !== StaffStatus.ACTIVE) {
      throw validationError('Cannot assign a task to an inactive staff member.');
    }

    return { type: AssigneeType.STAFF, id: staff._id, name: `${staff.first_name} ${staff.last_name}` };
  }

  const admin = await Admin.findOne({ _id: assigneeId, deleted_at: null });

  if (!admin) {
    throw validationError('Assigned admin not found.');
  }

  return { type: AssigneeType.ADMIN, id: admin._id, name: admin.name };
}

// A completed task must never show as delayed, even if its due date has passed (business rule from the SRS).
function computeDisplayStatus(task, now = new Date()) {
  if (task.status === TaskStatus.COMPLETED) {
    return TaskDisplayStatus.COMPLETED;
  }
  if (task.due_date && task.due_date < now) {
    return TaskDisplayStatus.DELAYED;
  }
  return task.status;
}

function formatTaskResponse(task, assigneeName) {
  const { dueDate, time } = task.due_date ? toLocalParts(task.due_date, env.appTimezone) : { dueDate: null, time: null };

  return {
    id: task._id,
    seriesId: task.series_id || null,
    title: task.title,
    description: task.description || null,
    attachmentUrl: task.attachment_url || null,
    broker: task.broker || null,
    createdBy: task.created_by,
    assignee: { type: task.assignee_type, id: task.assignee_id, name: assigneeName },
    priority: task.priority,
    status: task.status,
    displayStatus: computeDisplayStatus(task),
    timeline: task.timeline,
    customDates: Array.isArray(task.custom_dates) ? task.custom_dates.map((date) => ({ date })) : null,
    dueDate,
    time,
    dueAt: task.due_date,
    completionAt: task.completion_at || null,
    createdAt: task.created_at,
    updatedAt: task.updated_at,
    deletedAt: task.deleted_at || null,
  };
}

// Every occurrence is a full copy of the series definition, so task lists never need to join back to the series.
function buildOccurrenceData(series, dueDate, status) {
  return {
    title: series.title,
    description: series.description,
    attachment_url: series.attachment_url,
    broker: series.broker,
    created_by: series.created_by,
    assignee_type: series.assignee_type,
    assignee_id: series.assignee_id,
    priority: series.priority,
    status,
    // Matches updateTaskStatus's rule: completion_at is always set exactly when status is
    // completed, including a task created with "Completed" as its initial status.
    completion_at: status === TaskStatus.COMPLETED ? new Date() : null,
    timeline: series.timeline,
    due_date: dueDate,
    custom_dates: series.custom_dates,
    series_id: series._id,
  };
}

function prepareCustomDates(customDates, timeOfDay, now) {
  const dates = [...new Set(customDates)].sort();
  const timezone = env.appTimezone;

  const invalid = dates.find((date) => !isValidCalendarDate(date, timezone));
  if (invalid) {
    throw validationError(`"${invalid}" is not a valid calendar date.`);
  }

  const hasPast = customDateTimes(dates, timeOfDay, timezone).some((dateTime) => dateTime.toMillis() <= now.getTime());
  if (hasPast) {
    throw validationError('Custom dates (with the selected time) must be in the future.');
  }

  return dates;
}

async function createTask({ adminId, data, attachmentUrl }) {
  const now = new Date();
  const timezone = env.appTimezone;
  const isCustom = data.timeline === TaskTimeline.CUSTOM;

  const assignee = await resolveAssignee(data.assigneeType, data.assigneeId);

  const customDates = isCustom ? prepareCustomDates(data.customDates, data.time, now) : null;
  const monthlyDay = data.timeline === TaskTimeline.MONTHLY ? dayOfMonthIn(now, timezone) : null;

  const firstDueDate = nextOccurrence({
    timeline: data.timeline,
    timeOfDay: data.time,
    timezone,
    customDates,
    monthlyDay,
    after: now,
  });

  if (!firstDueDate) {
    throw validationError('The selected timeline has no upcoming date.');
  }

  const series = await TaskSeries.create({
    title: data.title,
    description: data.description || null,
    attachment_url: attachmentUrl,
    broker: data.broker || null,
    created_by: adminId,
    assignee_type: assignee.type,
    assignee_id: assignee.id,
    priority: data.priority,
    timeline: data.timeline,
    time_of_day: data.time,
    timezone,
    custom_dates: customDates,
    monthly_day: monthlyDay,
    last_due_date: firstDueDate,
  });

  try {
    const task = await Task.create(buildOccurrenceData(series, firstDueDate, data.status));
    return formatTaskResponse(task, assignee.name);
  } catch (err) {
    // No transactions on a standalone MongoDB, so undo the series manually rather than leave an orphan.
    await TaskSeries.deleteOne({ _id: series._id });
    throw err;
  }
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Resolves assignee names in two batched queries instead of one query per task.
// Looked up without a deleted_at filter: a task assigned to someone since deleted should
// still show that person's name in a historical list, not a blank.
async function attachAssigneeNames(tasks) {
  const staffIds = [...new Set(tasks.filter((t) => t.assignee_type === AssigneeType.STAFF).map((t) => String(t.assignee_id)))];
  const adminIds = [...new Set(tasks.filter((t) => t.assignee_type === AssigneeType.ADMIN).map((t) => String(t.assignee_id)))];

  const [staffDocs, adminDocs] = await Promise.all([
    staffIds.length ? Staff.find({ _id: { $in: staffIds } }) : [],
    adminIds.length ? Admin.find({ _id: { $in: adminIds } }) : [],
  ]);

  const nameById = new Map();
  staffDocs.forEach((staff) => nameById.set(String(staff._id), `${staff.first_name} ${staff.last_name}`));
  adminDocs.forEach((admin) => nameById.set(String(admin._id), admin.name));

  return tasks.map((task) => formatTaskResponse(task, nameById.get(String(task.assignee_id)) || null));
}

function applyDisplayStatusFilter(filter, status, now) {
  if (status === TaskDisplayStatus.COMPLETED) {
    filter.status = TaskStatus.COMPLETED;
  } else if (status === TaskDisplayStatus.DELAYED) {
    filter.status = { $in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS] };
    filter.due_date = { $lt: now };
  } else if (status === TaskDisplayStatus.TODO) {
    filter.status = TaskStatus.TODO;
    filter.$or = [{ due_date: null }, { due_date: { $gte: now } }];
  } else if (status === TaskDisplayStatus.IN_PROGRESS) {
    filter.status = TaskStatus.IN_PROGRESS;
    filter.$or = [{ due_date: null }, { due_date: { $gte: now } }];
  } else {
    // Default window: anything still open (any age) plus completed tasks from the last few days.
    // There's no dedicated "completed_at" field, so updated_at is used as when it was marked completed.
    const recentCutoff = new Date(now.getTime() - RECENT_COMPLETED_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    filter.$or = [
      { status: { $in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS] } },
      { status: TaskStatus.COMPLETED, updated_at: { $gte: recentCutoff } },
    ];
  }
}

async function getTasksForAdmin({ search, status, page, limit, skip, actorId, actorRole }) {
  if (status && !Object.values(TaskDisplayStatus).includes(status)) {
    throw validationError(`"status" must be one of ${Object.values(TaskDisplayStatus).join(', ')}.`);
  }

  const filter = { deleted_at: null };

  // A staff caller only ever sees their own tasks — same isolation rule already
  // applied to status updates and notes. Admin is unrestricted (sees everyone's).
  if (actorRole === Roles.STAFF) {
    filter.assignee_type = AssigneeType.STAFF;
    filter.assignee_id = actorId;
  }

  if (search) {
    filter.title = { $regex: escapeRegex(search), $options: 'i' };
  }

  applyDisplayStatusFilter(filter, status, new Date());

  const [tasks, total] = await Promise.all([
    Task.find(filter).sort({ due_date: 1 }).skip(skip).limit(limit),
    Task.countDocuments(filter),
  ]);

  return {
    tasks: await attachAssigneeNames(tasks),
    pagination: buildPaginationMeta({ page, limit, total }),
  };
}

async function getAssigneeName(assigneeType, assigneeId) {
  if (assigneeType === AssigneeType.STAFF) {
    const staff = await Staff.findById(assigneeId);
    return staff ? `${staff.first_name} ${staff.last_name}` : null;
  }

  const admin = await Admin.findById(assigneeId);
  return admin ? admin.name : null;
}

async function updateTaskStatus({ taskId, status, actorId, actorRole }) {
  if (!mongoose.Types.ObjectId.isValid(taskId)) {
    throw new AppError('Task not found.', 404, ErrorCodes.NOT_FOUND);
  }

  const task = await Task.findOne({ _id: taskId, deleted_at: null });

  if (!task) {
    throw new AppError('Task not found.', 404, ErrorCodes.NOT_FOUND);
  }

  const isOwnStaffTask = task.assignee_type === AssigneeType.STAFF && String(task.assignee_id) === String(actorId);

  if (actorRole === Roles.STAFF && !isOwnStaffTask) {
    // Treat an unowned task as not found, not forbidden: a staff member must never be able to
    // confirm another staff member's task even exists (same isolation rule the SRS requires for notes).
    throw new AppError('Task not found.', 404, ErrorCodes.NOT_FOUND);
  }

  // Cleared, not just left alone, when moving away from completed - completion_at must always
  // reflect the current status, including when a completed task is reopened.
  const completionAt = status === TaskStatus.COMPLETED ? new Date() : null;

  task.status = status;
  task.completion_at = completionAt;
  await task.save();

  if (task.series_id) {
    // Mirrors onto the series so "when was this recurring task last completed" is a single-field
    // read there, without having to query its occurrences.
    await TaskSeries.updateOne({ _id: task.series_id }, { $set: { completion_at: completionAt } });
  }

  const assigneeName = await getAssigneeName(task.assignee_type, task.assignee_id);
  return formatTaskResponse(task, assigneeName);
}

function deleteUploadedFile(url) {
  const filePath = path.join(TASK_UPLOAD_DIR, path.basename(url));
  fs.unlink(filePath, () => {});
}

// Editing changes the series definition (so the recurring job keeps generating occurrences with
// the new values going forward) and the occurrence being edited. Already-generated past
// occurrences are historical and are never touched, matching the approved edit-scope decision.
async function updateTask({ taskId, data, attachmentUrl }) {
  if (!mongoose.Types.ObjectId.isValid(taskId)) {
    throw new AppError('Task not found.', 404, ErrorCodes.NOT_FOUND);
  }

  const task = await Task.findOne({ _id: taskId, deleted_at: null });

  if (!task) {
    throw new AppError('Task not found.', 404, ErrorCodes.NOT_FOUND);
  }

  const series = task.series_id ? await TaskSeries.findOne({ _id: task.series_id, deleted_at: null }) : null;

  if (!series) {
    throw new AppError('Task not found.', 404, ErrorCodes.NOT_FOUND);
  }

  const now = new Date();
  const timezone = env.appTimezone;
  const isCustom = data.timeline === TaskTimeline.CUSTOM;

  const assignee = await resolveAssignee(data.assigneeType, data.assigneeId);
  const customDates = isCustom ? prepareCustomDates(data.customDates, data.time, now) : null;
  const monthlyDay = data.timeline === TaskTimeline.MONTHLY ? dayOfMonthIn(now, timezone) : null;

  const newDueDate = nextOccurrence({
    timeline: data.timeline,
    timeOfDay: data.time,
    timezone,
    customDates,
    monthlyDay,
    after: now,
  });

  if (!newDueDate) {
    throw validationError('The selected timeline has no upcoming date.');
  }

  // Checked up front, before any write: the (series_id, due_date) unique index would otherwise
  // reject this after the series has already been saved, leaving series and occurrence inconsistent
  // (no transactions on a standalone MongoDB).
  const conflict = await Task.exists({ series_id: series._id, due_date: newDueDate, _id: { $ne: task._id } });
  if (conflict) {
    throw validationError('Another occurrence of this task already has that due date. Please choose a different time.');
  }

  const previousAttachmentUrl = series.attachment_url;
  // Omitting the file on edit means "keep the current attachment" - re-uploading just to keep it isn't practical.
  const finalAttachmentUrl = attachmentUrl || previousAttachmentUrl || null;

  Object.assign(series, {
    title: data.title,
    description: data.description || null,
    broker: data.broker || null,
    attachment_url: finalAttachmentUrl,
    assignee_type: assignee.type,
    assignee_id: assignee.id,
    priority: data.priority,
    timeline: data.timeline,
    time_of_day: data.time,
    custom_dates: customDates,
    monthly_day: monthlyDay,
    last_due_date: newDueDate,
    ended_at: null,
  });
  await series.save();

  Object.assign(task, {
    title: data.title,
    description: data.description || null,
    broker: data.broker || null,
    attachment_url: finalAttachmentUrl,
    assignee_type: assignee.type,
    assignee_id: assignee.id,
    priority: data.priority,
    timeline: data.timeline,
    due_date: newDueDate,
    custom_dates: customDates,
  });
  await task.save();

  if (attachmentUrl && previousAttachmentUrl) {
    deleteUploadedFile(previousAttachmentUrl);
  }

  return formatTaskResponse(task, assignee.name);
}

// Deletes only this occurrence and ends the series (no more future occurrences), matching the
// approved delete-scope decision. Past occurrences of the same series are history and are never
// touched, so completed/delayed records stay visible for staff-wise reporting.
async function deleteTask(taskId) {
  if (!mongoose.Types.ObjectId.isValid(taskId)) {
    throw new AppError('Task not found.', 404, ErrorCodes.NOT_FOUND);
  }

  const task = await Task.findOne({ _id: taskId, deleted_at: null });

  if (!task) {
    throw new AppError('Task not found.', 404, ErrorCodes.NOT_FOUND);
  }

  const now = new Date();

  if (task.series_id) {
    await TaskSeries.updateOne({ _id: task.series_id, deleted_at: null }, { $set: { deleted_at: now } });
  }

  task.deleted_at = now;
  await task.save();

  const assigneeName = await getAssigneeName(task.assignee_type, task.assignee_id);
  return formatTaskResponse(task, assigneeName);
}

module.exports = {
  createTask,
  getTasksForAdmin,
  updateTask,
  updateTaskStatus,
  deleteTask,
  buildOccurrenceData,
  formatTaskResponse,
};
