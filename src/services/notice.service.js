const mongoose = require('mongoose');
const Notice = require('../models/Notice');
const NoticeRecipient = require('../models/NoticeRecipient');
const Staff = require('../models/Staff');
const NoticeStatus = require('../constants/noticeStatus');
const Roles = require('../constants/roles');
const ErrorCodes = require('../constants/errorCodes');
const AppError = require('../utils/AppError');
const { buildPaginationMeta } = require('../utils/pagination');

function validationError(message) {
  return new AppError(message, 422, ErrorCodes.VALIDATION_ERROR);
}

function formatNoticeResponse(notice, recipients) {
  return {
    id: notice._id,
    title: notice.title,
    message: notice.message || null,
    createdBy: notice.created_by,
    status: notice.status,
    recipients: recipients.map((staff) => ({
      id: staff._id,
      staffId: staff.employee_code,
      name: `${staff.first_name} ${staff.last_name}`,
    })),
    createdAt: notice.created_at,
    updatedAt: notice.updated_at,
    deletedAt: notice.deleted_at || null,
  };
}

async function createNotice({ adminId, data }) {
  const uniqueRecipientIds = [...new Set(data.recipientIds)];

  // Inactive (but not deleted) staff can still be a recipient - deactivation is reversible and the
  // notice just waits for them, unlike task assignment, which rejects inactive staff outright.
  const staffDocs = await Staff.find({ _id: { $in: uniqueRecipientIds }, deleted_at: null });

  if (staffDocs.length !== uniqueRecipientIds.length) {
    throw validationError('One or more selected staff members were not found.');
  }

  const notice = await Notice.create({
    title: data.title,
    message: data.message || null,
    created_by: adminId,
    status: NoticeStatus.ACTIVE,
  });

  try {
    await NoticeRecipient.insertMany(
      uniqueRecipientIds.map((staffId) => ({ notice_id: notice._id, staff_id: staffId }))
    );
  } catch (err) {
    // No transactions on a standalone MongoDB, so undo the notice manually rather than leave an orphan.
    await Notice.deleteOne({ _id: notice._id });
    throw err;
  }

  return formatNoticeResponse(notice, staffDocs);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Resolves every notice's recipients in two batched queries instead of one query per notice.
async function attachRecipients(notices) {
  const noticeIds = notices.map((notice) => notice._id);
  const recipientRows = noticeIds.length ? await NoticeRecipient.find({ notice_id: { $in: noticeIds } }) : [];

  const staffIds = [...new Set(recipientRows.map((row) => String(row.staff_id)))];
  const staffDocs = staffIds.length ? await Staff.find({ _id: { $in: staffIds } }) : [];
  const staffById = new Map(staffDocs.map((staff) => [String(staff._id), staff]));

  const recipientsByNotice = new Map();
  recipientRows.forEach((row) => {
    const key = String(row.notice_id);
    const staff = staffById.get(String(row.staff_id));
    if (!staff) {
      return;
    }
    if (!recipientsByNotice.has(key)) {
      recipientsByNotice.set(key, []);
    }
    recipientsByNotice.get(key).push(staff);
  });

  return notices.map((notice) => formatNoticeResponse(notice, recipientsByNotice.get(String(notice._id)) || []));
}

async function getNoticesForUser({ search, status, page, limit, skip, actorId, actorRole }) {
  const filter = { deleted_at: null };

  if (search) {
    filter.title = { $regex: escapeRegex(search), $options: 'i' };
  }

  if (actorRole === Roles.STAFF) {
    // Staff only ever sees active notices they were actually sent to - status filtering from the
    // client is ignored for them, not just defaulted, so it can't be used to peek at inactive notices.
    filter.status = NoticeStatus.ACTIVE;
    const myRecipientRows = await NoticeRecipient.find({ staff_id: actorId }, { notice_id: 1 });
    filter._id = { $in: myRecipientRows.map((row) => row.notice_id) };
  } else if (status) {
    if (!Object.values(NoticeStatus).includes(status)) {
      throw validationError(`"status" must be one of ${Object.values(NoticeStatus).join(', ')}.`);
    }
    filter.status = status;
  }

  const [notices, total] = await Promise.all([
    Notice.find(filter).sort({ created_at: -1 }).skip(skip).limit(limit),
    Notice.countDocuments(filter),
  ]);

  return {
    notices: await attachRecipients(notices),
    pagination: buildPaginationMeta({ page, limit, total }),
  };
}

// Status is not touched here (that's a separate toggle). Recipients are synced by diff: new ones are
// validated and added, ones no longer selected are removed, and ones already on the notice are kept as-is
// without being re-validated - so re-submitting an unchanged list never fails just because someone on it
// was deleted after the notice was sent.
async function updateNotice({ noticeId, data }) {
  if (!mongoose.Types.ObjectId.isValid(noticeId)) {
    throw new AppError('Notice not found.', 404, ErrorCodes.NOT_FOUND);
  }

  const notice = await Notice.findOne({ _id: noticeId, deleted_at: null });

  if (!notice) {
    throw new AppError('Notice not found.', 404, ErrorCodes.NOT_FOUND);
  }

  const requestedIds = [...new Set(data.recipientIds)];
  const existingRows = await NoticeRecipient.find({ notice_id: notice._id });
  const existingIds = new Set(existingRows.map((row) => String(row.staff_id)));

  const idsToAdd = requestedIds.filter((id) => !existingIds.has(id));
  const idsToRemove = [...existingIds].filter((id) => !requestedIds.includes(id));

  if (idsToAdd.length > 0) {
    const found = await Staff.countDocuments({ _id: { $in: idsToAdd }, deleted_at: null });
    if (found !== idsToAdd.length) {
      throw validationError('One or more selected staff members were not found.');
    }
  }

  if (idsToAdd.length > 0) {
    try {
      await NoticeRecipient.insertMany(idsToAdd.map((staffId) => ({ notice_id: notice._id, staff_id: staffId })));
    } catch (err) {
      // insertMany can stop part-way; these rows didn't exist before this call, so removing them is safe.
      await NoticeRecipient.deleteMany({ notice_id: notice._id, staff_id: { $in: idsToAdd } });
      throw err;
    }
  }

  notice.title = data.title;
  notice.message = data.message || null;
  if (idsToAdd.length > 0 || idsToRemove.length > 0) {
    // Changing only the recipients leaves title/message untouched, so Mongoose wouldn't bump this itself.
    notice.updated_at = new Date();
  }

  try {
    await notice.save();
  } catch (err) {
    await NoticeRecipient.deleteMany({ notice_id: notice._id, staff_id: { $in: idsToAdd } });
    throw err;
  }

  // Removed last, since it's the only destructive step: notice_recipients has no deleted_at field,
  // so un-sending a notice to someone means removing their row.
  if (idsToRemove.length > 0) {
    await NoticeRecipient.deleteMany({ notice_id: notice._id, staff_id: { $in: idsToRemove } });
  }

  const [formatted] = await attachRecipients([notice]);
  return formatted;
}

async function updateNoticeStatus({ noticeId, status }) {
  if (!mongoose.Types.ObjectId.isValid(noticeId)) {
    throw new AppError('Notice not found.', 404, ErrorCodes.NOT_FOUND);
  }

  const notice = await Notice.findOne({ _id: noticeId, deleted_at: null });

  if (!notice) {
    throw new AppError('Notice not found.', 404, ErrorCodes.NOT_FOUND);
  }

  notice.status = status;
  await notice.save();

  const [formatted] = await attachRecipients([notice]);
  return formatted;
}

// Only the notice is marked deleted; its notice_recipients rows are left alone (that collection has
// no deleted_at), and every list query filters on the notice's own deleted_at, so recipients stop seeing it.
async function deleteNotice(noticeId) {
  if (!mongoose.Types.ObjectId.isValid(noticeId)) {
    throw new AppError('Notice not found.', 404, ErrorCodes.NOT_FOUND);
  }

  const notice = await Notice.findOne({ _id: noticeId, deleted_at: null });

  if (!notice) {
    throw new AppError('Notice not found.', 404, ErrorCodes.NOT_FOUND);
  }

  notice.deleted_at = new Date();
  await notice.save();

  const [formatted] = await attachRecipients([notice]);
  return formatted;
}

module.exports = {
  createNotice,
  getNoticesForUser,
  updateNotice,
  updateNoticeStatus,
  deleteNotice,
  formatNoticeResponse,
};
