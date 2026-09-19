const AppError = require('../utils/AppError');
const ErrorCodes = require('../constants/errorCodes');

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return next(
        new AppError('You are not authorized to perform this action.', 403, ErrorCodes.FORBIDDEN)
      );
    }
    return next();
  };
}

module.exports = requireRole;
