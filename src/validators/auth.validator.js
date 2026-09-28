const Joi = require('joi');

const loginSchema = Joi.object({
  email: Joi.string().trim().email().required(),
  password: Joi.string().required(),
});

const staffLoginSchema = Joi.object({
  staffId: Joi.string().trim().uppercase().required(),
  password: Joi.string().required(),
});

module.exports = { loginSchema, staffLoginSchema };
