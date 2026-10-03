const noticeService = require('../services/notice.service');
const { sendSuccess } = require('../utils/response');
const { parsePagination } = require('../utils/pagination');

async function createNotice(req, res, next) {
  try {
    const notice = await noticeService.createNotice({ adminId: req.user.id, data: req.body });

    return sendSuccess(res, {
      statusCode: 201,
      message: 'Notice created successfully.',
      data: { notice },
    });
  } catch (err) {
    return next(err);
  }
}

async function getNotices(req, res, next) {
  try {
    const { search, status } = req.query;
    const { page, limit, skip } = parsePagination(req.query);
    const { notices, pagination } = await noticeService.getNoticesForUser({
      search,
      status,
      page,
      limit,
      skip,
      actorId: req.user.id,
      actorRole: req.user.role,
    });

    return sendSuccess(res, {
      statusCode: 200,
      message: 'Notices fetched successfully.',
      data: notices,
      pagination,
    });
  } catch (err) {
    return next(err);
  }
}

async function updateNotice(req, res, next) {
  try {
    const notice = await noticeService.updateNotice({ noticeId: req.params.noticeId, data: req.body });

    return sendSuccess(res, {
      statusCode: 200,
      message: 'Notice updated successfully.',
      data: { notice },
    });
  } catch (err) {
    return next(err);
  }
}

async function updateNoticeStatus(req, res, next) {
  try {
    const notice = await noticeService.updateNoticeStatus({
      noticeId: req.params.noticeId,
      status: req.body.status,
    });

    return sendSuccess(res, {
      statusCode: 200,
      message: 'Notice status updated successfully.',
      data: { notice },
    });
  } catch (err) {
    return next(err);
  }
}

async function deleteNotice(req, res, next) {
  try {
    const notice = await noticeService.deleteNotice(req.params.noticeId);

    return sendSuccess(res, {
      statusCode: 200,
      message: 'Notice deleted successfully.',
      data: { notice },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { createNotice, getNotices, updateNotice, updateNoticeStatus, deleteNotice };
