const mongoose = require('mongoose');
const Meeting = require('../models/Meeting');
const ErrorCodes = require('../constants/errorCodes');
const AppError = require('../utils/AppError');

const DONE_LIMIT = 100;

function formatMeetingResponse(meeting) {
  return {
    id: meeting._id,
    title: meeting.title,
    attendees: meeting.attendees || '',
    location: meeting.location || '',
    notes: meeting.notes || '',
    date: meeting.date || null,
    startTime: meeting.start_time || null,
    endTime: meeting.end_time || null,
    done: Boolean(meeting.done_at),
    doneAt: meeting.done_at || null,
    createdAt: meeting.created_at,
    updatedAt: meeting.updated_at,
  };
}

function toFields({ title, attendees, location, notes, date, startTime, endTime }) {
  return {
    title,
    attendees,
    location,
    notes,
    date: date || null,
    start_time: (date && startTime) || null,
    end_time: (date && startTime && endTime) || null,
  };
}

// Open meetings are all returned (the list is small and grouped in the browser); done ones are the
// most recent DONE_LIMIT, newest first.
async function listMeetings({ status }) {
  if (status === 'done') {
    const meetings = await Meeting.find({ deleted_at: null, done_at: { $ne: null } })
      .sort({ done_at: -1 })
      .limit(DONE_LIMIT);
    return meetings.map(formatMeetingResponse);
  }

  const meetings = await Meeting.find({ deleted_at: null, done_at: null }).sort({
    date: 1,
    start_time: 1,
    created_at: -1,
  });
  return meetings.map(formatMeetingResponse);
}

async function countMeetings() {
  const [open, done] = await Promise.all([
    Meeting.countDocuments({ deleted_at: null, done_at: null }),
    Meeting.countDocuments({ deleted_at: null, done_at: { $ne: null } }),
  ]);
  return { open, done };
}

async function createMeeting({ adminId, values }) {
  const meeting = await Meeting.create({ ...toFields(values), created_by: adminId });
  return formatMeetingResponse(meeting);
}

async function findMeeting(meetingId) {
  if (!mongoose.Types.ObjectId.isValid(meetingId)) {
    throw new AppError('Meeting not found.', 404, ErrorCodes.NOT_FOUND);
  }
  const meeting = await Meeting.findOne({ _id: meetingId, deleted_at: null });
  if (!meeting) {
    throw new AppError('Meeting not found.', 404, ErrorCodes.NOT_FOUND);
  }
  return meeting;
}

async function updateMeeting({ meetingId, values }) {
  const meeting = await findMeeting(meetingId);
  meeting.set(toFields(values));
  await meeting.save();
  return formatMeetingResponse(meeting);
}

async function setMeetingDone({ meetingId, done }) {
  const meeting = await findMeeting(meetingId);
  meeting.done_at = done ? meeting.done_at || new Date() : null;
  await meeting.save();
  return formatMeetingResponse(meeting);
}

async function deleteMeeting(meetingId) {
  const meeting = await findMeeting(meetingId);
  meeting.deleted_at = new Date();
  await meeting.save();
  return formatMeetingResponse(meeting);
}

module.exports = {
  listMeetings,
  countMeetings,
  createMeeting,
  updateMeeting,
  setMeetingDone,
  deleteMeeting,
};
