const { verifyToken, hashToken } = require('../utils/jwt');
const RevokedToken = require('../models/RevokedToken');
const Admin = require('../models/Admin');
const Staff = require('../models/Staff');
const Roles = require('../constants/roles');
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
    const Model = payload.role === Roles.ADMIN ? Admin : Staff;

    const [isRevoked, account] = await Promise.all([
      RevokedToken.exists({ token_hash: hashToken(token) }),
      Model.findById(payload.id).select('password_reset_at').lean(),
    ]);

    if (isRevoked) {
      return next(
        new AppError('You have been logged out. Please login again.', 401, ErrorCodes.TOKEN_REVOKED)
      );
    }

    // A password change signs the account out everywhere except the device that made the change (that one
    // is handed a fresh token). Compared in whole seconds because a token's `iat` has no finer resolution.
    // A missing account is left to the routes to deal with, as before.
    if (account?.password_reset_at) {
      const changedAtSeconds = Math.floor(account.password_reset_at.getTime() / 1000);

      if (payload.iat < changedAtSeconds) {
        return next(
          new AppError('Your password was changed. Please login again.', 401, ErrorCodes.TOKEN_REVOKED)
        );
      }
    }
  } catch (err) {
    return next(err);
  }

  req.user = { id: payload.id, role: payload.role };
  req.token = { value: token, expiresAt: new Date(payload.exp * 1000) };
  return next();
}

module.exports = authenticate;
