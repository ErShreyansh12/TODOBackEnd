const { verifyToken, hashToken } = require('../utils/jwt');
const RevokedToken = require('../models/RevokedToken');
const AppError = require('../utils/AppError');
const ErrorCodes = require('../constants/errorCodes');

async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('Authentication token is required.', 401, ErrorCodes.UNAUTHORIZED));
  }

  const token = authHeader.slice('Bearer '.length).trim();

  let payload;
  try {
    payload = verifyToken(token);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(
        new AppError('Your session has expired. Please login again.', 401, ErrorCodes.TOKEN_EXPIRED)
      );
    }
    return next(new AppError('Invalid authentication token.', 401, ErrorCodes.INVALID_TOKEN));
  }

  try {
    const isRevoked = await RevokedToken.exists({ token_hash: hashToken(token) });

    if (isRevoked) {
      return next(
        new AppError('You have been logged out. Please login again.', 401, ErrorCodes.TOKEN_REVOKED)
      );
    }
  } catch (err) {
    return next(err);
  }

  req.user = { id: payload.id, role: payload.role };
  req.token = { value: token, expiresAt: new Date(payload.exp * 1000) };
  return next();
}

module.exports = authenticate;
