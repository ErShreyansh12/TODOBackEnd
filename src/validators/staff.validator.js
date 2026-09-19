const Joi = require('joi');
const StaffStatus = require('../constants/staffStatus');

const createStaffSchema = Joi.object({
  firstName: Joi.string().trim().min(1).max(50).required(),
  lastName: Joi.string().trim().min(1).max(50).required(),
  email: Joi.string().trim().lowercase().email().allow('').optional(),
  phone: Joi.string().trim().max(20).allow('').optional(),
});

const updateStaffStatusSchema = Joi.object({
  status: Joi.string()
    .valid(...Object.values(StaffStatus))
    .required(),
});

module.exports = { createStaffSchema, updateStaffStatusSchema };
