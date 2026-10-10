const Joi = require('joi');
const AssigneeType = require('../constants/assigneeType');
const TaskPriority = require('../constants/taskPriority');
const TaskStatus = require('../constants/taskStatus');
const TaskTimeline = require('../constants/taskTimeline');

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_CUSTOM_DATES = 60;
const datePattern = (label) =>
  Joi.string().pattern(DATE_PATTERN).messages({ 'string.pattern.base': `${label} must be in YYYY-MM-DD format` });

// Shared by create and edit: everything except how `status` is handled, which differs (see below).
const taskFields = {
  title: Joi.string().trim().min(1).max(200).required(),
  description: Joi.string().trim().max(20000).allow('').optional(),
  broker: Joi.string().trim().max(200).allow('').optional(),
  assigneeType: Joi.string()
    .valid(...Object.values(AssigneeType))
    .required(),
  assigneeId: Joi.string().hex().length(24).required(),
  timeline: Joi.string()
    .valid(...Object.values(TaskTimeline))
    .required(),
  // A task with no deadline has no time either.
  time: Joi.when('timeline', {
    is: TaskTimeline.NONE,
    then: Joi.any().strip(),
    otherwise: Joi.string().pattern(TIME_PATTERN).required().messages({
      'string.pattern.base': '"time" must be in HH:mm format (24-hour)',
    }),
  }),
  customDates: Joi.array()
    .items(
      Joi.string().pattern(DATE_PATTERN).messages({
        'string.pattern.base': 'each custom date must be in YYYY-MM-DD format',
      })
    )
    .max(MAX_CUSTOM_DATES)
    .when('timeline', {
      is: TaskTimeline.CUSTOM,
      then: Joi.array().min(1).required(),
      otherwise: Joi.any().strip(),
    }),
  // The rule for the "repeat" timeline: every N days, every N weeks on some weekdays (1 = Monday), or every
  // N months on some days of the month. `start` (default today) anchors the interval; `until` ends it.
  recurrence: Joi.object({
    every: Joi.number().integer().min(1).max(365).default(1),
    unit: Joi.string().valid('day', 'week', 'month').required(),
    weekdays: Joi.when('unit', {
      is: 'week',
      then: Joi.array().items(Joi.number().integer().min(1).max(7)).unique().min(1).required(),
      otherwise: Joi.any().strip(),
    }),
    monthDays: Joi.when('unit', {
      is: 'month',
      then: Joi.array().items(Joi.number().integer().min(1).max(31)).unique().min(1).required(),
      otherwise: Joi.any().strip(),
    }),
    start: datePattern('recurrence.start').optional(),
    until: datePattern('recurrence.until').allow(null, '').optional(),
  }).when('timeline', {
    is: TaskTimeline.REPEAT,
    then: Joi.required(),
    otherwise: Joi.any().strip(),
  }),
  priority: Joi.string()
    .valid(...Object.values(TaskPriority))
    .required(),
};

const createTaskSchema = Joi.object({
  ...taskFields,
  // A new task always starts open. Older clients may still send a status; it can only be "todo".
  status: Joi.string().valid(TaskStatus.TODO).default(TaskStatus.TODO),
});

const updateTaskSchema = Joi.object({
  ...taskFields,
  // Status is changed only via PATCH /tasks/:taskId/status. A full-form edit resubmit may well include
  // the task's current status (e.g. "completed"); accept and ignore it rather than rejecting the edit.
  status: Joi.any().strip(),
});

const updateTaskStatusSchema = Joi.object({
  // Two user-facing states only: open or completed. Delayed / completed late are derived, never set.
  status: Joi.string()
    .valid(TaskStatus.TODO, TaskStatus.COMPLETED)
    .required(),
});

const updateChecklistItemSchema = Joi.object({
  index: Joi.number().integer().min(0).required(),
  checked: Joi.boolean().required(),
});

module.exports = { createTaskSchema, updateTaskSchema, updateTaskStatusSchema, updateChecklistItemSchema };
