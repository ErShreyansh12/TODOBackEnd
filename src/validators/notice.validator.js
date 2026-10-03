const Joi = require('joi');
const NoticeStatus = require('../constants/noticeStatus');

const MAX_RECIPIENTS = 500;

const createNoticeSchema = Joi.object({
  title: Joi.string().trim().min(1).max(200).required(),
  message: Joi.string().trim().max(5000).allow('').optional(),
  recipientIds: Joi.array().items(Joi.string().hex().length(24)).min(1).max(MAX_RECIPIENTS).required(),
});

const updateNoticeStatusSchema = Joi.object({
  status: Joi.string()
    .valid(...Object.values(NoticeStatus))
    .required(),
});

module.exports = { createNoticeSchema, updateNoticeStatusSchema };
