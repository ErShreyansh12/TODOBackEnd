const meetingService = require('../services/meeting.service');
const { sendSuccess } = require('../utils/response');

async function getMeetings(req, res, next) {
  try {
    const status = req.query.status === 'done' ? 'done' : 'open';
    const [meetings, counts] = await Promise.all([
      meetingService.listMeetings({ status }),
      meetingService.countMeetings(),
    ]);

    return sendSuccess(res, {
      statusCode: 200,
      message: 'Meetings fetched successfully.',
      data: { meetings },
      counts,
    });
  } catch (err) {
    return next(err);
  }
}

async function createMeeting(req, res, next) {
  try {
    const meeting = await meetingService.createMeeting({ adminId: req.user.id, values: req.body });

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
    const meeting = await meetingService.updateMeeting({
      meetingId: req.params.meetingId,
      values: req.body,
    });

    return sendSuccess(res, {
      statusCode: 200,
      message: 'Meeting updated successfully.',
      data: { meeting },
    });
  } catch (err) {
    return next(err);
  }
}

async function setMeetingDone(req, res, next) {
  try {
    const meeting = await meetingService.setMeetingDone({
      meetingId: req.params.meetingId,
      done: req.body.done,
    });

    return sendSuccess(res, {
      statusCode: 200,
      message: meeting.done ? 'Meeting marked as done.' : 'Meeting reopened.',
      data: { meeting },
    });
  } catch (err) {
    return next(err);
  }
}

async function deleteMeeting(req, res, next) {
  try {
    const meeting = await meetingService.deleteMeeting(req.params.meetingId);

    return sendSuccess(res, {
      statusCode: 200,
      message: 'Meeting deleted successfully.',
      data: { meeting },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { getMeetings, createMeeting, updateMeeting, setMeetingDone, deleteMeeting };
