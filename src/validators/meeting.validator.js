const Joi = require('joi');
const { DateTime } = require('luxon');

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const createMeetingSchema = Joi.object({
  title: Joi.string().trim().min(1).max(200).required(),
  date: Joi.string()
    .pattern(DATE_PATTERN)
    .required()
    .custom((value, helpers) => {
      // The pattern only checks the shape; this rejects dates that don't exist, like 2026-02-31. A badly
      // shaped value is left to the pattern's own message so the caller doesn't get two errors for it.
      if (DATE_PATTERN.test(value) && !DateTime.fromISO(value, { zone: 'utc' }).isValid) {
        return helpers.message('"date" is not a valid calendar date');
      }
      return value;
    })
    .messages({ 'string.pattern.base': '"date" must be in YYYY-MM-DD format' }),
  startTime: Joi.string().pattern(TIME_PATTERN).required().messages({
    'string.pattern.base': '"startTime" must be in HH:mm format (24-hour)',
  }),
  endTime: Joi.string().pattern(TIME_PATTERN).required().messages({
    'string.pattern.base': '"endTime" must be in HH:mm format (24-hour)',
  }),
  location: Joi.string().trim().min(1).max(300).required(),
  description: Joi.string().trim().max(5000).allow('').optional(),
}).custom((value, helpers) => {
  // Zero-padded HH:mm strings compare correctly as plain strings. Equal times are rejected too: a
  // meeting needs some length.
  if (value.startTime && value.endTime && value.endTime <= value.startTime) {
    return helpers.message('"endTime" must be later than "startTime"');
  }
  return value;
});

// Editing replaces the same fields, under the same rules, as creating.
const updateMeetingSchema = createMeetingSchema;

module.exports = { createMeetingSchema, updateMeetingSchema };
