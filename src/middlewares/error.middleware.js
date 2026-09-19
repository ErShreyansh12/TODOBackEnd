const AppError = require('../utils/AppError');
const ErrorCodes = require('../constants/errorCodes');
const logger = require('../config/logger');

function notFoundHandler(req, res, next) {
  next(new AppError('Route not found.', 404, ErrorCodes.NOT_FOUND));
}

function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      errorCode: err.errorCode,
    });
  }

  logger.error(err.message, { stack: err.stack });

  return res.status(500).json({
    success: false,
    message: 'Internal server error.',
    errorCode: ErrorCodes.INTERNAL_ERROR,
  });
}

module.exports = { notFoundHandler, errorHandler };
