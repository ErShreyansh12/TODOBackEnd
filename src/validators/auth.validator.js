const Joi = require('joi');

const loginSchema = Joi.object({
  email: Joi.string().trim().email().required(),
  password: Joi.string().required(),
});

const staffLoginSchema = Joi.object({
  staffId: Joi.string().trim().uppercase().required(),
  password: Joi.string().required(),
});

// Matches the minimum the Change Password form already enforces in the browser.
const NEW_PASSWORD_MIN_LENGTH = 6;
const NEW_PASSWORD_MAX_LENGTH = 128;

// Passwords are never trimmed: leading/trailing spaces are part of what the user typed.
const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(NEW_PASSWORD_MIN_LENGTH).max(NEW_PASSWORD_MAX_LENGTH).required(),
  // Optional because the browser already checks it, but if a client sends it, it has to match.
  confirmPassword: Joi.any()
    .valid(Joi.ref('newPassword'))
    .optional()
    .messages({ 'any.only': '"confirmPassword" must match "newPassword"' }),
});

module.exports = { loginSchema, staffLoginSchema, changePasswordSchema };
