const Admin = require('../models/Admin');
const Staff = require('../models/Staff');
const Roles = require('../constants/roles');
const StaffStatus = require('../constants/staffStatus');
const { formatStaffResponse } = require('./staff.service');
const ErrorCodes = require('../constants/errorCodes');
const AppError = require('../utils/AppError');
const RevokedToken = require('../models/RevokedToken');
const { generateToken, hashToken } = require('../utils/jwt');

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

async function loginStaff({ staffId, password }) {
  const staff = await Staff.findOne({ employee_code: staffId, deleted_at: null }).select('+password');

  // Same message for unknown/deleted staff and wrong password, so status is never revealed to someone who doesn't know the password.
  // Passwords are compared as plain text by explicit project decision (not bcrypt-hashed).
  if (!staff || password !== staff.password) {
    throw new AppError('Invalid staff ID or password.', 401, ErrorCodes.INVALID_CREDENTIALS);
  }

  if (staff.status !== StaffStatus.ACTIVE) {
    throw new AppError('Your account is inactive. Please contact the admin.', 403, ErrorCodes.ACCOUNT_DEACTIVATED);
  }

  // timestamps:false so a login doesn't change updated_at (which reflects profile edits).
  await Staff.updateOne({ _id: staff._id }, { $set: { last_login_at: new Date() } }, { timestamps: false });

  const token = generateToken({ id: staff._id.toString(), role: Roles.STAFF });

  return {
    staff: formatStaffResponse(staff),
    token,
  };
}

async function logout({ userId, role, token }) {
  try {
    await RevokedToken.create({
      token_hash: hashToken(token.value),
      user_id: userId,
      role,
      expires_at: token.expiresAt,
    });
  } catch (err) {
    // Already revoked by a concurrent logout request: the end state is the same, so treat it as success.
    if (err.code !== 11000) {
      throw err;
    }
  }
}

module.exports = { loginAdmin, loginStaff, logout };
