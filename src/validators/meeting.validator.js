const Joi = require('joi');

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// Date and times are all optional, but a time needs a date, and an end time needs a start time.
const meetingSchema = Joi.object({
  title: Joi.string().trim().min(1).max(200).required(),
  attendees: Joi.string().trim().allow('').max(300).default(''),
  location: Joi.string().trim().allow('').max(300).default(''),
  notes: Joi.string().allow('').max(5000).default(''),
  date: Joi.string().pattern(DATE).allow(null, '').default(null),
  startTime: Joi.string().pattern(TIME).allow(null, '').default(null),
  endTime: Joi.string().pattern(TIME).allow(null, '').default(null),
})
  .custom((value, helpers) => {
    if (value.startTime && !value.date) return helpers.message('A time needs a date.');
    if (value.endTime && !value.startTime) return helpers.message('An end time needs a start time.');
    if (value.endTime && value.endTime <= value.startTime) {
      return helpers.message('End time must be after the start time.');
    }
    return value;
  });

const meetingDoneSchema = Joi.object({
  done: Joi.boolean().required(),
});

module.exports = { meetingSchema, meetingDoneSchema };
