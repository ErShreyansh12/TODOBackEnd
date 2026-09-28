const Joi = require('joi');
const AssigneeType = require('../constants/assigneeType');
const TaskPriority = require('../constants/taskPriority');
const TaskStatus = require('../constants/taskStatus');
const TaskTimeline = require('../constants/taskTimeline');

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_CUSTOM_DATES = 60;

// Shared by create and edit: everything except how `status` is handled, which differs (see below).
const taskFields = {
  title: Joi.string().trim().min(1).max(200).required(),
  description: Joi.string().trim().max(5000).allow('').optional(),
  broker: Joi.string().trim().max(200).allow('').optional(),
  assigneeType: Joi.string()
    .valid(...Object.values(AssigneeType))
    .required(),
  assigneeId: Joi.string().hex().length(24).required(),
  timeline: Joi.string()
    .valid(...Object.values(TaskTimeline))
    .required(),
  time: Joi.string().pattern(TIME_PATTERN).required().messages({
    'string.pattern.base': '"time" must be in HH:mm format (24-hour)',
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
  priority: Joi.string()
    .valid(...Object.values(TaskPriority))
    .required(),
};

const createTaskSchema = Joi.object({
  ...taskFields,
  // A brand-new task can't already be completed.
  status: Joi.string()
    .valid(TaskStatus.TODO, TaskStatus.IN_PROGRESS)
    .default(TaskStatus.TODO),
});

const updateTaskSchema = Joi.object({
  ...taskFields,
  // Status is changed only via PATCH /tasks/:taskId/status. A full-form edit resubmit may well include
  // the task's current status (e.g. "completed"); accept and ignore it rather than rejecting the edit.
  status: Joi.any().strip(),
});

const updateTaskStatusSchema = Joi.object({
  status: Joi.string()
    .valid(...Object.values(TaskStatus))
    .required(),
});

module.exports = { createTaskSchema, updateTaskSchema, updateTaskStatusSchema };
