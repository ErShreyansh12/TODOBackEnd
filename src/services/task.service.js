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
const { resolveDueDateRange } = require('../utils/dueDateRange');
const {
  nextOccurrence,
  isValidCalendarDate,
  dayOfMonthIn,
  toLocalParts,
  customDateTimes,
  todayIn,
} = require('../utils/recurrence');
const { sanitizeDescription, uncheckAll, setChecklistItem } = require('../utils/richText');

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

const OPEN_STATUSES = [TaskStatus.TODO, TaskStatus.IN_PROGRESS];

// Old records completed before completion_at existed fall back to updated_at, which was the completion
// time then. Shared by computeDisplayStatus and the completed / completed_late list filters.
const COMPLETED_AT_EXPR = { $ifNull: ['$completion_at', '$updated_at'] };
const COMPLETED_LATE_EXPR = {
  $and: [{ $ne: [{ $ifNull: ['$due_date', null] }, null] }, { $gt: [COMPLETED_AT_EXPR, '$due_date'] }],
};

// Users only set two states (open or completed); the four display states are derived from the dates.
// A completed task never shows as delayed (business rule from the SRS), only as completed or completed late.
function computeDisplayStatus(task, now = new Date()) {
  if (task.status === TaskStatus.COMPLETED) {
    const completedAt = task.completion_at || task.updated_at;
    return task.due_date && completedAt && completedAt > task.due_date
      ? TaskDisplayStatus.COMPLETED_LATE
      : TaskDisplayStatus.COMPLETED;
  }
  if (task.due_date && task.due_date < now) {
    return TaskDisplayStatus.DELAYED;
  }
  // Legacy in_progress records read as todo.
  return TaskDisplayStatus.TODO;
}

function formatTaskResponse(task, assigneeName, createdByName = null) {
  const { dueDate, time } = task.due_date ? toLocalParts(task.due_date, env.appTimezone) : { dueDate: null, time: null };

  return {
    id: task._id,
    seriesId: task.series_id || null,
    title: task.title,
    description: task.description || null,
    attachmentUrl: task.attachment_url || null,
    broker: task.broker || null,
    createdBy: task.created_by,
    createdByType: task.created_by_type,
    createdByName,
    assignee: { type: task.assignee_type, id: task.assignee_id, name: assigneeName },
    priority: task.priority,
    status: task.status,
    displayStatus: computeDisplayStatus(task),
    timeline: task.timeline,
    customDates: Array.isArray(task.custom_dates) ? task.custom_dates.map((date) => ({ date })) : null,
    recurrence: task.recurrence || null,
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
    created_by_type: series.created_by_type,
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
    recurrence: series.recurrence,
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

// Works out a timeline's stored fields and its first due date from now. A task with no deadline has no
// due date (and its series ends at once); every other timeline must have an upcoming date.
function planSchedule(data, now) {
  const timezone = env.appTimezone;

  if (data.timeline === TaskTimeline.NONE) {
    return { timeOfDay: null, customDates: null, monthlyDay: null, recurrence: null, dueDate: null };
  }

  const customDates = data.timeline === TaskTimeline.CUSTOM ? prepareCustomDates(data.customDates, data.time, now) : null;
  const monthlyDay = data.timeline === TaskTimeline.MONTHLY ? dayOfMonthIn(now, timezone) : null;
  let recurrence = null;
  if (data.timeline === TaskTimeline.REPEAT) {
    recurrence = { ...data.recurrence, start: data.recurrence.start || todayIn(timezone, now), until: data.recurrence.until || null };
    const invalid = [recurrence.start, recurrence.until].find((date) => date && !isValidCalendarDate(date, timezone));
    if (invalid) throw validationError(`"${invalid}" is not a valid calendar date.`);
    if (recurrence.until && recurrence.until < recurrence.start) {
      throw validationError('The repeat end date must be after its start date.');
    }
  }

  const dueDate = nextOccurrence({
    timeline: data.timeline,
    timeOfDay: data.time,
    timezone,
    customDates,
    monthlyDay,
    recurrence,
    after: now,
  });

  if (!dueDate) {
    throw validationError('The selected timeline has no upcoming date.');
  }

  return { timeOfDay: data.time, customDates, monthlyDay, recurrence, dueDate };
}

async function createTask({ creatorId, creatorType, data, attachmentUrl }) {
  const now = new Date();
  const timezone = env.appTimezone;

  // Staff can assign a task to themselves or to another active staff member, never to an admin.
  if (creatorType === AssigneeType.STAFF && data.assigneeType !== AssigneeType.STAFF) {
    // Checked before resolveAssignee's DB lookup: the problem here is who it's assigned to,
    // not whether that assignee exists, so this gives a clearer message regardless.
    throw validationError('Staff can only assign tasks to staff members.');
  }

  const assignee = await resolveAssignee(data.assigneeType, data.assigneeId);
  const schedule = planSchedule(data, now);
  const description = sanitizeDescription(data.description);

  const series = await TaskSeries.create({
    title: data.title,
    description: uncheckAll(description),
    attachment_url: attachmentUrl,
    broker: data.broker || null,
    created_by: creatorId,
    created_by_type: creatorType,
    assignee_type: assignee.type,
    assignee_id: assignee.id,
    priority: data.priority,
    timeline: data.timeline,
    time_of_day: schedule.timeOfDay,
    timezone,
    custom_dates: schedule.customDates,
    monthly_day: schedule.monthlyDay,
    recurrence: schedule.recurrence,
    last_due_date: schedule.dueDate,
    // Nothing for the recurring job to do for a task without a deadline.
    ended_at: schedule.dueDate ? null : now,
  });

  try {
    const task = await Task.create({
      ...buildOccurrenceData(series, schedule.dueDate, data.status),
      description,
    });
    return (await attachPeopleNames([task]))[0];
  } catch (err) {
    // No transactions on a standalone MongoDB, so undo the series manually rather than leave an orphan.
    await TaskSeries.deleteOne({ _id: series._id });
    throw err;
  }
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Resolves people's names in two batched queries (one per collection) instead of one query per row.
// Looked up without a deleted_at filter: a task assigned to (or created by) someone since deleted should
// still show that person's name in a historical list, not a blank.
async function resolvePeopleNames(people) {
  const idsOf = (type) => [...new Set(people.filter((person) => person.type === type).map((person) => String(person.id)))];
  const staffIds = idsOf(AssigneeType.STAFF);
  const adminIds = idsOf(AssigneeType.ADMIN);

  const [staffDocs, adminDocs] = await Promise.all([
    staffIds.length ? Staff.find({ _id: { $in: staffIds } }) : [],
    adminIds.length ? Admin.find({ _id: { $in: adminIds } }) : [],
  ]);

  const nameById = new Map();
  staffDocs.forEach((staff) => nameById.set(String(staff._id), `${staff.first_name} ${staff.last_name}`));
  adminDocs.forEach((admin) => nameById.set(String(admin._id), admin.name));
  return nameById;
}

async function attachPeopleNames(tasks) {
  const nameById = await resolvePeopleNames(
    tasks.flatMap((task) => [
      { type: task.assignee_type, id: task.assignee_id },
      { type: task.created_by_type, id: task.created_by },
    ])
  );
  return tasks.map((task) =>
    formatTaskResponse(task, nameById.get(String(task.assignee_id)) || null, nameById.get(String(task.created_by)) || null)
  );
}

// The condition one display status adds to a query. The display statuses are derived from the dates, so
// they can't be a plain field match.
function displayStatusCondition(status, now) {
  switch (status) {
    case TaskDisplayStatus.COMPLETED:
      return { status: TaskStatus.COMPLETED, $expr: { $not: [COMPLETED_LATE_EXPR] } };
    case TaskDisplayStatus.COMPLETED_LATE:
      return { status: TaskStatus.COMPLETED, $expr: COMPLETED_LATE_EXPR };
    case TaskDisplayStatus.DELAYED:
      return { status: { $in: OPEN_STATUSES }, due_date: { $lt: now } };
    default:
      return { status: { $in: OPEN_STATUSES }, $or: [{ due_date: null }, { due_date: { $gte: now } }] };
  }
}

// Without any status filter and without a date range, the default window applies: anything still open
// (any age) plus completed tasks from the last few days. A date range is itself the window, and must
// include completed tasks of any age (e.g. "last week").
function recentWindowCondition(now) {
  const recentCutoff = new Date(now.getTime() - RECENT_COMPLETED_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return {
    $or: [{ status: { $in: OPEN_STATUSES } }, { status: TaskStatus.COMPLETED, updated_at: { $gte: recentCutoff } }],
  };
}

const anyOf = (conditions) => (conditions.length === 1 ? conditions[0] : { $or: conditions });

// Accepts "a,b" or repeated ?key=a&key=b. Empty entries are kept: an empty broker means "no broker".
function parseList(value) {
  if (value === undefined || value === null) return [];
  return (Array.isArray(value) ? value : String(value).split(',')).map((entry) => String(entry).trim());
}

// People are sent as "<type>:<id>" because admins and staff live in separate collections.
function parsePeople(value, name) {
  return parseList(value)
    .filter(Boolean)
    .map((entry) => {
      const [type, id] = entry.split(':');
      if (!Object.values(AssigneeType).includes(type) || !mongoose.Types.ObjectId.isValid(id)) {
        throw validationError(`"${name}" entries must look like admin:<id> or staff:<id>.`);
      }
      return { type, id: new mongoose.Types.ObjectId(id) };
    });
}

const SORTS = {
  // Tasks without a deadline sort after every dated one, both ways.
  due_asc: { no_due_date: 1, due_date: 1, _id: 1 },
  due_desc: { no_due_date: 1, due_date: -1, _id: -1 },
  title_asc: { title: 1, _id: 1 },
  title_desc: { title: -1, _id: -1 },
  broker_asc: { broker: 1, _id: 1 },
  broker_desc: { broker: -1, _id: -1 },
};

// Validates the list query once and turns it into the filters every list/facet query is built from.
// `statuses`, `assignees`, `creators` and `brokers` are the board's column filters (each a list; empty
// means no filter on that column). `status` and `assigneeType` are the older single-value filters the
// dashboards still use.
function parseTaskQuery(query, actorId, actorRole) {
  const { search, status, range, from, to, assigneeType, assigneeId, sort } = query;
  const statuses = parseList(query.statuses).filter(Boolean);
  if (status) statuses.push(status);
  const invalidStatus = statuses.find((value) => !Object.values(TaskDisplayStatus).includes(value));
  if (invalidStatus) {
    throw validationError(`"status" must be one of ${Object.values(TaskDisplayStatus).join(', ')}.`);
  }

  if (assigneeType && !Object.values(AssigneeType).includes(assigneeType)) {
    throw validationError(`"assigneeType" must be one of ${Object.values(AssigneeType).join(', ')}.`);
  }

  if (assigneeId && !mongoose.Types.ObjectId.isValid(assigneeId)) {
    throw validationError('"assigneeId" is not a valid id.');
  }

  if (sort && !SORTS[sort]) {
    throw validationError(`"sort" must be one of ${Object.keys(SORTS).join(', ')}.`);
  }

  if (!range && (from || to)) {
    throw validationError('"from" and "to" can only be used with range=custom.');
  }

  return {
    search: search ? String(search).trim() : '',
    statuses: [...new Set(statuses)],
    hasStatusFilter: query.statuses !== undefined || Boolean(status),
    dateRange: range ? resolveDueDateRange({ range, from, to }, env.appTimezone) : null,
    assigneeType,
    assigneeId,
    assignees: parsePeople(query.assignees, 'assignees'),
    creators: parsePeople(query.creators, 'creators'),
    brokers: query.brokers === undefined ? null : parseList(query.brokers),
    sort,
    actorId: new mongoose.Types.ObjectId(String(actorId)),
    isAdmin: actorRole === Roles.ADMIN,
  };
}

// Builds the Mongo filter for a parsed query. `omit` leaves one column filter out ('status', 'assignee',
// 'creator', 'broker' or 'owner'), which is how each column's popover and each count gets its numbers:
// they reflect every other active filter, but not their own.
function buildTaskFilter(parsed, now, omit = null) {
  const and = [{ deleted_at: null }];

  if (parsed.search) {
    const pattern = { $regex: escapeRegex(parsed.search), $options: 'i' };
    and.push({ $or: [{ title: pattern }, { broker: pattern }] });
  }

  if (parsed.dateRange) {
    and.push({ due_date: { $gte: parsed.dateRange.start, $lt: parsed.dateRange.end } });
  }

  if (parsed.assigneeId) {
    and.push({ assignee_id: new mongoose.Types.ObjectId(String(parsed.assigneeId)) });
  }

  if (!parsed.isAdmin) {
    // A staff caller sees the tasks assigned to them and the ones they created for someone else, and
    // nothing else. Added unconditionally, so nothing in the query string can widen it.
    and.push({
      $or: [
        { assignee_type: AssigneeType.STAFF, assignee_id: parsed.actorId },
        { created_by_type: AssigneeType.STAFF, created_by: parsed.actorId },
      ],
    });
  } else if (parsed.assigneeType && omit !== 'owner') {
    // For an admin, assigneeType=admin means "assigned to me", not to any admin.
    and.push(
      parsed.assigneeType === AssigneeType.ADMIN
        ? { assignee_type: AssigneeType.ADMIN, assignee_id: parsed.actorId }
        : { assignee_type: AssigneeType.STAFF }
    );
  }

  if (omit !== 'status') {
    if (parsed.statuses.length > 0) {
      and.push(anyOf(parsed.statuses.map((status) => displayStatusCondition(status, now))));
    } else if (!parsed.hasStatusFilter && !parsed.dateRange) {
      and.push(recentWindowCondition(now));
    }
  }

  if (omit !== 'assignee' && parsed.assignees.length > 0) {
    and.push(anyOf(parsed.assignees.map(({ type, id }) => ({ assignee_type: type, assignee_id: id }))));
  }

  if (omit !== 'creator' && parsed.creators.length > 0) {
    and.push(anyOf(parsed.creators.map(({ type, id }) => ({ created_by_type: type, created_by: id }))));
  }

  if (omit !== 'broker' && parsed.brokers) {
    const named = parsed.brokers.filter(Boolean);
    const conditions = named.length > 0 ? [{ broker: { $in: named } }] : [];
    if (parsed.brokers.includes('')) conditions.push({ broker: { $in: [null, ''] } });
    // An empty selection matches nothing, like unticking every box in a spreadsheet filter.
    and.push(conditions.length > 0 ? anyOf(conditions) : { _id: null });
  }

  return { $and: and };
}

async function getTasksForAdmin({ page, limit, skip, actorId, actorRole, ...query }) {
  const parsed = parseTaskQuery(query, actorId, actorRole);
  const now = new Date();
  const listFilter = buildTaskFilter(parsed, now);

  // Default order: open tasks first (oldest due first, so delayed ones lead), completed ones last, most
  // recent first. A completed-only view leads with the most recent. _id breaks ties so paging is stable.
  const completedOnly =
    parsed.statuses.length > 0 &&
    parsed.statuses.every((status) => status === TaskDisplayStatus.COMPLETED || status === TaskDisplayStatus.COMPLETED_LATE);
  let sort = completedOnly ? { due_date: -1, _id: -1 } : { is_completed: 1, no_due_date: 1, due_date: 1, _id: 1 };
  if (parsed.sort) sort = SORTS[parsed.sort];

  const displayStatuses = Object.values(TaskDisplayStatus);
  const ownerless = buildTaskFilter({ ...parsed, assigneeType: undefined }, now, 'status');
  const [tasks, total, allCount, mineCount, staffCount, ...statusTotals] = await Promise.all([
    Task.aggregate([
      { $match: listFilter },
      {
        $addFields: {
          is_completed: { $eq: ['$status', TaskStatus.COMPLETED] },
          no_due_date: { $eq: [{ $ifNull: ['$due_date', null] }, null] },
        },
      },
      { $sort: sort },
      { $skip: skip },
      { $limit: limit },
    ]),
    Task.countDocuments(listFilter),
    // Owner counts ignore both the owner and the status filter, so each number stays put while you
    // click around; every other filter still narrows them.
    parsed.isAdmin ? Task.countDocuments(ownerless) : null,
    parsed.isAdmin ? Task.countDocuments(buildTaskFilter({ ...parsed, assigneeType: AssigneeType.ADMIN }, now, 'status')) : null,
    parsed.isAdmin ? Task.countDocuments(buildTaskFilter({ ...parsed, assigneeType: AssigneeType.STAFF }, now, 'status')) : null,
    // How many tasks are in each display status under every other filter, so status tabs and the status
    // column filter can all show a number at once. Given to every caller.
    ...displayStatuses.map((status) =>
      Task.countDocuments(buildTaskFilter({ ...parsed, statuses: [status] }, now))
    ),
  ]);

  const byStatus = Object.fromEntries(displayStatuses.map((status, index) => [status, statusTotals[index]]));
  const counts = parsed.isAdmin
    ? { all: allCount, admin: mineCount, staff: staffCount, byStatus }
    : { byStatus };

  return {
    tasks: await attachPeopleNames(tasks),
    pagination: buildPaginationMeta({ page, limit, total }),
    range: parsed.dateRange && { range: parsed.dateRange.range, from: parsed.dateRange.from, to: parsed.dateRange.to },
    counts,
  };
}

// The values each column filter can offer, with how many tasks have each, under every other active
// filter (the spreadsheet-style "only show values that still match"). Takes the same query as the list.
async function getTaskFacets({ actorId, actorRole, ...query }) {
  const parsed = parseTaskQuery(query, actorId, actorRole);
  const now = new Date();

  const groupBy = (omit, key) =>
    Task.aggregate([{ $match: buildTaskFilter(parsed, now, omit) }, { $group: { _id: key, count: { $sum: 1 } } }]);

  const displayStatuses = Object.values(TaskDisplayStatus);
  const [assigneeGroups, creatorGroups, brokerGroups, ...statusCounts] = await Promise.all([
    groupBy('assignee', { type: '$assignee_type', id: '$assignee_id' }),
    groupBy('creator', { type: '$created_by_type', id: '$created_by' }),
    groupBy('broker', { $ifNull: ['$broker', ''] }),
    ...displayStatuses.map((status) =>
      Task.countDocuments(buildTaskFilter({ ...parsed, statuses: [status] }, now, null))
    ),
  ]);

  const people = [...assigneeGroups, ...creatorGroups].map((group) => group._id);
  const names = await resolvePeopleNames(people.map(({ type, id }) => ({ type, id })));
  const toPerson = (group) => ({
    value: `${group._id.type}:${group._id.id}`,
    type: group._id.type,
    id: group._id.id,
    name: names.get(String(group._id.id)) || null,
    count: group.count,
  });
  const byName = (a, b) => (a.name || '').localeCompare(b.name || '');

  return {
    status: displayStatuses.map((status, index) => ({ value: status, count: statusCounts[index] })),
    assignee: assigneeGroups.map(toPerson).sort(byName),
    creator: creatorGroups.map(toPerson).sort(byName),
    broker: brokerGroups
      .map((group) => ({ value: group._id, count: group.count }))
      .sort((a, b) => (a.value || '￿').localeCompare(b.value || '￿')),
  };
}

async function getTaskById({ taskId, actorId, actorRole }) {
  if (!mongoose.Types.ObjectId.isValid(taskId)) {
    throw new AppError('Task not found.', 404, ErrorCodes.NOT_FOUND);
  }

  const task = await Task.findOne({ _id: taskId, deleted_at: null });

  // Same isolation rule as the list: a staff member sees the tasks assigned to them or created by them,
  // and never learns that anyone else's task exists.
  const isOwnStaffTask =
    task &&
    ((task.assignee_type === AssigneeType.STAFF && String(task.assignee_id) === String(actorId)) ||
      (task.created_by_type === AssigneeType.STAFF && String(task.created_by) === String(actorId)));

  if (!task || (actorRole === Roles.STAFF && !isOwnStaffTask)) {
    throw new AppError('Task not found.', 404, ErrorCodes.NOT_FOUND);
  }

  return (await attachPeopleNames([task]))[0];
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

  return (await attachPeopleNames([task]))[0];
}

// Ticks one checklist item in this occurrence's description. Same access rule as changing the status:
// an admin can tick any task, a staff member only a task assigned to them.
async function updateChecklistItem({ taskId, index, checked, actorId, actorRole }) {
  if (!mongoose.Types.ObjectId.isValid(taskId)) {
    throw new AppError('Task not found.', 404, ErrorCodes.NOT_FOUND);
  }

  const task = await Task.findOne({ _id: taskId, deleted_at: null });
  const isOwnStaffTask =
    task && task.assignee_type === AssigneeType.STAFF && String(task.assignee_id) === String(actorId);

  if (!task || (actorRole === Roles.STAFF && !isOwnStaffTask)) {
    throw new AppError('Task not found.', 404, ErrorCodes.NOT_FOUND);
  }

  const description = setChecklistItem(task.description, index, checked);
  if (description === null) {
    throw validationError('That checklist item no longer exists. Refresh the task and try again.');
  }

  task.description = description;
  await task.save();

  return (await attachPeopleNames([task]))[0];
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

  const assignee = await resolveAssignee(data.assigneeType, data.assigneeId);
  const schedule = planSchedule(data, now);
  const newDueDate = schedule.dueDate;
  const description = sanitizeDescription(data.description);

  // Checked up front, before any write: the (series_id, due_date) unique index would otherwise
  // reject this after the series has already been saved, leaving series and occurrence inconsistent
  // (no transactions on a standalone MongoDB).
  const conflict = newDueDate && await Task.exists({ series_id: series._id, due_date: newDueDate, _id: { $ne: task._id } });
  if (conflict) {
    throw validationError('Another occurrence of this task already has that due date. Please choose a different time.');
  }

  const previousAttachmentUrl = series.attachment_url;
  // Omitting the file on edit means "keep the current attachment" - re-uploading just to keep it isn't practical.
  const finalAttachmentUrl = attachmentUrl || previousAttachmentUrl || null;

  Object.assign(series, {
    title: data.title,
    description: uncheckAll(description),
    broker: data.broker || null,
    attachment_url: finalAttachmentUrl,
    assignee_type: assignee.type,
    assignee_id: assignee.id,
    priority: data.priority,
    timeline: data.timeline,
    time_of_day: schedule.timeOfDay,
    custom_dates: schedule.customDates,
    monthly_day: schedule.monthlyDay,
    recurrence: schedule.recurrence,
    last_due_date: newDueDate,
    ended_at: newDueDate ? null : now,
  });
  await series.save();

  Object.assign(task, {
    title: data.title,
    description,
    broker: data.broker || null,
    attachment_url: finalAttachmentUrl,
    assignee_type: assignee.type,
    assignee_id: assignee.id,
    priority: data.priority,
    timeline: data.timeline,
    due_date: newDueDate,
    custom_dates: schedule.customDates,
    recurrence: schedule.recurrence,
  });
  await task.save();

  if (attachmentUrl && previousAttachmentUrl) {
    deleteUploadedFile(previousAttachmentUrl);
  }

  return (await attachPeopleNames([task]))[0];
}

// Deletes only this occurrence. Deleting the series' current (latest) occurrence also ends the series
// (no more future occurrences), matching the approved delete-scope decision. Deleting an older occurrence
// is just cleaning up history and leaves the series running; it used to end it, which made recurring
// tasks silently stop. Other occurrences are never touched, so they stay visible for staff-wise reporting.
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
    await TaskSeries.updateOne(
      { _id: task.series_id, deleted_at: null, last_due_date: task.due_date },
      { $set: { deleted_at: now } }
    );
  }

  task.deleted_at = now;
  await task.save();

  return (await attachPeopleNames([task]))[0];
}

module.exports = {
  createTask,
  getTasksForAdmin,
  getTaskFacets,
  getTaskById,
  updateTask,
  updateTaskStatus,
  updateChecklistItem,
  deleteTask,
  buildOccurrenceData,
  formatTaskResponse,
};
