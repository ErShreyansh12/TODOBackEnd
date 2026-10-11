const mongoose = require('mongoose');
const { DateTime } = require('luxon');
const env = require('../config/env');
const Meeting = require('../models/Meeting');
const AppError = require('../utils/AppError');
const ErrorCodes = require('../constants/errorCodes');
const { toLocalParts } = require('../utils/recurrence');
const { buildPaginationMeta } = require('../utils/pagination');

const DATE_KEY_FORMAT = 'yyyy-MM-dd';

// An admin can edit or delete a meeting until this many minutes before it starts; after that it is locked.
const EDIT_LOCK_MINUTES_BEFORE_START = 15;

// The widest list a client can ask for: six calendar weeks, which is the month view's visible grid.
const MAX_LIST_RANGE_DAYS = 42;

// "Upcoming" looks at today plus this many days after it.
const UPCOMING_DAYS_AHEAD = 2;

// The calendar day a date string means in the app time zone, as the UTC instant it starts at, so the day
// boundaries line up with how task due dates are stored and filtered.
function toMeetingDate(dateKey) {
  return DateTime.fromISO(dateKey, { zone: env.appTimezone }).startOf('day').toUTC().toJSDate();
}

// The moment the meeting starts: its calendar day (stored as IST midnight) plus its start time, in the app time zone.
function meetingStartAt(meeting) {
  const [hour, minute] = meeting.start_time.split(':').map(Number);
  return DateTime.fromJSDate(meeting.meeting_date, { zone: env.appTimezone }).set({ hour, minute, second: 0, millisecond: 0 });
}

// Last moment an edit or delete is accepted. Exactly 15 minutes before the start is still allowed; less
// than 15 minutes remaining is not.
function editableUntil(meeting) {
  return meetingStartAt(meeting).minus({ minutes: EDIT_LOCK_MINUTES_BEFORE_START });
}

// The moment the meeting ends: same calendar day as the start (end time is always after start time).
function meetingEndAt(meeting) {
  const [hour, minute] = meeting.end_time.split(':').map(Number);
  return DateTime.fromJSDate(meeting.meeting_date, { zone: env.appTimezone }).set({ hour, minute, second: 0, millisecond: 0 });
}

async function findActiveMeeting(meetingId) {
  const meeting = mongoose.Types.ObjectId.isValid(meetingId)
    ? await Meeting.findOne({ _id: meetingId, deleted_at: null })
    : null;

  if (!meeting) {
    throw new AppError('Meeting not found.', 404, ErrorCodes.NOT_FOUND);
  }

  return meeting;
}

// `action` is only used in the message ("edited" / "deleted"). Edit and delete share this one rule.
function assertWithinChangeWindow(meeting, action) {
  if (Date.now() > editableUntil(meeting).toMillis()) {
    throw new AppError(
      `A meeting can only be ${action} up to ${EDIT_LOCK_MINUTES_BEFORE_START} minutes before it starts.`,
      409,
      ErrorCodes.CONFLICT
    );
  }
}

// A meeting can be deleted up to 15 minutes before it starts (same window as editing), and again once it
// has finished, so completed meetings can be cleaned up. Between those two moments it is locked.
function assertDeletable(meeting) {
  const now = Date.now();
  if (now > editableUntil(meeting).toMillis() && now < meetingEndAt(meeting).toMillis()) {
    throw new AppError(
      `A meeting can only be deleted up to ${EDIT_LOCK_MINUTES_BEFORE_START} minutes before it starts, or after it has ended.`,
      409,
      ErrorCodes.CONFLICT
    );
  }
}

function formatMeetingResponse(meeting, now = new Date()) {
  const lastEditAt = editableUntil(meeting);
  const endsAt = meetingEndAt(meeting);

  return {
    id: meeting._id,
    title: meeting.title,
    date: DateTime.fromJSDate(meeting.meeting_date, { zone: env.appTimezone }).toFormat(DATE_KEY_FORMAT),
    startTime: meeting.start_time,
    endTime: meeting.end_time,
    location: meeting.location,
    description: meeting.description || null,
    // Server-computed so the UI does not have to trust the browser clock to disable Edit.
    isEditable: now.getTime() <= lastEditAt.toMillis(),
    editableUntil: lastEditAt.toUTC().toJSDate(),
    // Delete is allowed until `editableUntil`, and again from `endsAt` (the meeting has finished).
    endsAt: endsAt.toUTC().toJSDate(),
    isDeletable: now.getTime() <= lastEditAt.toMillis() || now.getTime() >= endsAt.toMillis(),
    createdBy: meeting.admin_id,
    createdAt: meeting.created_at,
    updatedAt: meeting.updated_at,
    deletedAt: meeting.deleted_at || null,
  };
}

function validationError(message) {
  return new AppError(message, 422, ErrorCodes.VALIDATION_ERROR);
}

// A meeting can't start in the past, judged in the app time zone: any earlier day is rejected, and on
// today the start time must still be ahead of the current time. Dates are YYYY-MM-DD and times are
// zero-padded HH:mm, so both compare correctly as plain strings.
function assertNotInPast({ date, startTime }, now = new Date()) {
  const { dueDate: today, time: currentTime } = toLocalParts(now, env.appTimezone);

  if (date < today) {
    throw validationError('Meeting date cannot be in the past.');
  }

  if (date === today && startTime <= currentTime) {
    throw validationError('Meeting start time must be later than the current time.');
  }
}

async function createMeeting({ adminId, data }) {
  assertNotInPast(data);

  const meeting = await Meeting.create({
    admin_id: adminId,
    title: data.title,
    meeting_date: toMeetingDate(data.date),
    start_time: data.startTime,
    end_time: data.endTime,
    location: data.location,
    description: data.description || null,
  });

  return formatMeetingResponse(meeting);
}

async function updateMeeting({ meetingId, data }) {
  const meeting = await findActiveMeeting(meetingId);

  // Judged on the meeting as it stands now (its saved date and start time), not on the values being sent:
  // otherwise moving a meeting that is about to start to a later date would slip past the lock.
  assertWithinChangeWindow(meeting, 'edited');

  // The new values must themselves be a valid future meeting, same as when creating one.
  assertNotInPast(data);

  Object.assign(meeting, {
    title: data.title,
    meeting_date: toMeetingDate(data.date),
    start_time: data.startTime,
    end_time: data.endTime,
    location: data.location,
    description: data.description || null,
  });
  await meeting.save();

  return formatMeetingResponse(meeting);
}

function parseDateKey(value, name) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw validationError(`"${name}" is required and must be a date in YYYY-MM-DD format.`);
  }

  const parsed = DateTime.fromISO(value, { zone: env.appTimezone });
  if (!parsed.isValid) {
    throw validationError(`"${name}" is not a valid calendar date.`);
  }

  return parsed.startOf('day');
}

// Earliest first: by day, then by start time (zero-padded HH:mm sorts correctly as text). _id breaks ties
// between meetings that start together, so paging through them is stable.
const START_ORDER = { meeting_date: 1, start_time: 1, _id: 1 };

async function findMeetingsPage({ filter, page, limit, skip, now }) {
  const [meetings, total] = await Promise.all([
    Meeting.find(filter).sort(START_ORDER).skip(skip).limit(limit),
    Meeting.countDocuments(filter),
  ]);

  return {
    meetings: meetings.map((meeting) => formatMeetingResponse(meeting, now)),
    pagination: buildPaginationMeta({ page, limit, total }),
  };
}

// Meetings whose date falls between `from` and `to` (both included, YYYY-MM-DD, app time zone). The
// calendar asks for exactly the days it is drawing: one day for the day view, seven for the week view, and
// the whole visible grid (up to six weeks, including the greyed days of the neighbouring months) for the
// month view - so the same call serves all three. Results are paged (page/limit); a client drawing the
// calendar grid reads every page of its window so no day is missing, while a plain list (the day's
// agenda, upcoming) shows one page at a time.
async function listMeetings({ from, to, page, limit, skip }) {
  const first = parseDateKey(from, 'from');
  const last = parseDateKey(to, 'to');

  if (last < first) {
    throw validationError('"to" must be on or after "from".');
  }

  const days = Math.round(last.diff(first, 'days').days) + 1;
  if (days > MAX_LIST_RANGE_DAYS) {
    throw validationError(`The date range can be at most ${MAX_LIST_RANGE_DAYS} days.`);
  }

  const { meetings, pagination } = await findMeetingsPage({
    filter: {
      deleted_at: null,
      meeting_date: { $gte: first.toUTC().toJSDate(), $lt: last.plus({ days: 1 }).toUTC().toJSDate() },
    },
    page,
    limit,
    skip,
    now: new Date(),
  });

  return {
    meetings,
    pagination,
    range: { from: first.toFormat(DATE_KEY_FORMAT), to: last.toFormat(DATE_KEY_FORMAT) },
  };
}

// Meetings that have not started yet, from now until the end of the day UPCOMING_DAYS_AHEAD days from today:
// the rest of today, tomorrow, and the day after. A meeting drops off this list the minute it starts,
// the same moment creating one for that time would be refused.
async function listUpcomingMeetings({ page, limit, skip }, now = new Date()) {
  const zonedNow = DateTime.fromJSDate(now, { zone: env.appTimezone });
  const todayStart = zonedNow.startOf('day');
  const lastDay = todayStart.plus({ days: UPCOMING_DAYS_AHEAD });
  const afterToday = todayStart.plus({ days: 1 });

  const { meetings, pagination } = await findMeetingsPage({
    filter: {
      deleted_at: null,
      $or: [
        {
          meeting_date: { $gte: todayStart.toUTC().toJSDate(), $lt: afterToday.toUTC().toJSDate() },
          start_time: { $gt: zonedNow.toFormat('HH:mm') },
        },
        { meeting_date: { $gte: afterToday.toUTC().toJSDate(), $lt: lastDay.plus({ days: 1 }).toUTC().toJSDate() } },
      ],
    },
    page,
    limit,
    skip,
    now,
  });

  return {
    meetings,
    pagination,
    range: { from: todayStart.toFormat(DATE_KEY_FORMAT), to: lastDay.toFormat(DATE_KEY_FORMAT) },
  };
}

// Soft delete: the record stays in the database with deleted_at set, and every lookup above and in the
// list queries filters on deleted_at, so it simply stops appearing.
async function deleteMeeting({ meetingId }) {
  const meeting = await findActiveMeeting(meetingId);

  assertDeletable(meeting);

  meeting.deleted_at = new Date();
  await meeting.save();

  return formatMeetingResponse(meeting);
}

module.exports = { createMeeting, updateMeeting, deleteMeeting, listMeetings, listUpcomingMeetings, formatMeetingResponse };
