const AppError = require('../utils/AppError');
const ErrorCodes = require('../constants/errorCodes');

function validate(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const message = error.details.map((detail) => detail.message).join(', ');
      return next(new AppError(message, 422, ErrorCodes.VALIDATION_ERROR));
    }

    req.body = value;
    return next();
  };
}

module.exports = validate;
