const meetingService = require('../services/meeting.service');
const { sendSuccess } = require('../utils/response');
const { parsePagination } = require('../utils/pagination');

async function createMeeting(req, res, next) {
  try {
    const meeting = await meetingService.createMeeting({ adminId: req.user.id, data: req.body });

    return sendSuccess(res, {
      statusCode: 201,
      message: 'Meeting created successfully.',
      data: { meeting },
    });
  } catch (err) {
    return next(err);
  }
}

async function updateMeeting(req, res, next) {
  try {
    const meeting = await meetingService.updateMeeting({ meetingId: req.params.meetingId, data: req.body });

    return sendSuccess(res, {
      statusCode: 200,
      message: 'Meeting updated successfully.',
      data: { meeting },
    });
  } catch (err) {
    return next(err);
  }
}

async function deleteMeeting(req, res, next) {
  try {
    const meeting = await meetingService.deleteMeeting({ meetingId: req.params.meetingId });

    return sendSuccess(res, {
      statusCode: 200,
      message: 'Meeting deleted successfully.',
      data: { meeting },
    });
  } catch (err) {
    return next(err);
  }
}

async function getMeetings(req, res, next) {
  try {
    const { from, to } = req.query;
    const { page, limit, skip } = parsePagination(req.query);
    const { meetings, pagination, range } = await meetingService.listMeetings({ from, to, page, limit, skip });

    return sendSuccess(res, {
      statusCode: 200,
      message: 'Meetings fetched successfully.',
      data: meetings,
      pagination,
      range,
    });
  } catch (err) {
    return next(err);
  }
}

async function getUpcomingMeetings(req, res, next) {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { meetings, pagination, range } = await meetingService.listUpcomingMeetings({ page, limit, skip });

    return sendSuccess(res, {
      statusCode: 200,
      message: 'Upcoming meetings fetched successfully.',
      data: meetings,
      pagination,
      range,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { createMeeting, updateMeeting, deleteMeeting, getMeetings, getUpcomingMeetings };
