const { verifyToken } = require('../utils/jwt');
const AppError = require('../utils/AppError');
const ErrorCodes = require('../constants/errorCodes');

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('Authentication token is required.', 401, ErrorCodes.UNAUTHORIZED));
  }

  const token = authHeader.slice('Bearer '.length).trim();

  try {
    const payload = verifyToken(token);
    req.user = { id: payload.id, role: payload.role };
    return next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(
        new AppError('Your session has expired. Please login again.', 401, ErrorCodes.TOKEN_EXPIRED)
      );
    }
    return next(new AppError('Invalid authentication token.', 401, ErrorCodes.INVALID_TOKEN));
  }
}

module.exports = authenticate;
