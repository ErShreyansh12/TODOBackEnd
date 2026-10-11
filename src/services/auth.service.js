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

// Changes the signed-in user's own password. Both kinds of account work the same way; the token says
// which collection to look in, so a caller can only ever change their own password.
async function changePassword({ userId, role, currentPassword, newPassword }) {
  const isAdmin = role === Roles.ADMIN;
  const Model = isAdmin ? Admin : Staff;

  const user = await Model.findOne({ _id: userId, deleted_at: null }).select('+password');

  if (!user) {
    // A valid token for an account that has since been deleted. 401 on purpose: the app signs the user out.
    throw new AppError('Your account is no longer available. Please login again.', 401, ErrorCodes.UNAUTHORIZED);
  }

  if (!isAdmin && user.status !== StaffStatus.ACTIVE) {
    throw new AppError('Your account is inactive. Please contact the admin.', 403, ErrorCodes.ACCOUNT_DEACTIVATED);
  }

  // A wrong current password is a 422, never a 401: the app treats any 401 as "session over" and would
  // sign the user out over a typo. Passwords are compared as plain text by explicit project decision.
  if (currentPassword !== user.password) {
    throw new AppError('Current password is incorrect.', 422, ErrorCodes.VALIDATION_ERROR);
  }

  if (newPassword === currentPassword) {
    throw new AppError('New password must be different from the current password.', 422, ErrorCodes.VALIDATION_ERROR);
  }

  // The current password is in the filter so two simultaneous changes can't both succeed against the same
  // old password. password_reset_at is what signs every other session out: authenticate rejects any token
  // issued before it. timestamps:false keeps updated_at meaning "profile was edited", as login does.
  const result = await Model.updateOne(
    { _id: user._id, password: currentPassword },
    { $set: { password: newPassword, password_reset_at: new Date() } },
    { timestamps: false }
  );

  if (result.matchedCount === 0) {
    throw new AppError('Your password was just changed elsewhere. Please try again.', 409, ErrorCodes.CONFLICT);
  }

  // The token that made this request is now older than the change, so the caller needs a new one to stay
  // signed in. Generated after the stamp above, so its issue time is never before it.
  return { token: generateToken({ id: String(user._id), role }) };
}

module.exports = { loginAdmin, loginStaff, logout, changePassword };
