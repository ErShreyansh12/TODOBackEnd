const Admin = require('../models/Admin');
const Roles = require('../constants/roles');
const ErrorCodes = require('../constants/errorCodes');
const AppError = require('../utils/AppError');
const { generateToken } = require('../utils/jwt');

async function loginAdmin({ email, password }) {
  const admin = await Admin.findOne({ email }).select('+password');

  if (!admin) {
    throw new AppError('Invalid email or password.', 401, ErrorCodes.INVALID_CREDENTIALS);
  }

  if (admin.deleted_at) {
    throw new AppError('This account has been deactivated.', 403, ErrorCodes.ACCOUNT_DEACTIVATED);
  }

  // Passwords are compared as plain text by explicit project decision (not bcrypt-hashed).
  if (password !== admin.password) {
    throw new AppError('Invalid email or password.', 401, ErrorCodes.INVALID_CREDENTIALS);
  }

  const token = generateToken({ id: admin._id.toString(), role: Roles.ADMIN });

  return {
    admin: {
      id: admin._id,
      name: admin.name,
      email: admin.email,
      createdAt: admin.created_at,
      updatedAt: admin.updated_at,
    },
    token,
  };
}

module.exports = { loginAdmin };
