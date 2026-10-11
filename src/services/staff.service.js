const Staff = require('../models/Staff');
const StaffStatus = require('../constants/staffStatus');
const Defaults = require('../constants/defaults');
const ErrorCodes = require('../constants/errorCodes');
const AppError = require('../utils/AppError');
const { buildPaginationMeta } = require('../utils/pagination');

const EMPLOYEE_CODE_PATTERN = /^EMP-(\d+)$/;
const MAX_EMPLOYEE_CODE_ATTEMPTS = 3;

async function generateNextEmployeeCode() {
  const staffMembers = await Staff.find({}, { employee_code: 1, _id: 0 }).lean();

  const maxNumber = staffMembers.reduce((max, staff) => {
    const match = EMPLOYEE_CODE_PATTERN.exec(staff.employee_code || '');
    const num = match ? parseInt(match[1], 10) : 0;
    return Math.max(max, num);
  }, 0);

  return `EMP-${String(maxNumber + 1).padStart(3, '0')}`;
}

function formatStaffResponse(staff) {
  return {
    id: staff._id,
    staffId: staff.employee_code,
    firstName: staff.first_name,
    lastName: staff.last_name,
    email: staff.email || null,
    phone: staff.phone || null,
    status: staff.status,
    createdAt: staff.created_at,
    updatedAt: staff.updated_at,
    deletedAt: staff.deleted_at || null,
  };
}

async function createStaff({ firstName, lastName, email, phone, createdBy }) {
  const staffData = {
    first_name: firstName,
    last_name: lastName,
    password: Defaults.DEFAULT_STAFF_PASSWORD,
    status: StaffStatus.ACTIVE,
    created_by: createdBy,
  };

  if (email) {
    staffData.email = email;
  }

  if (phone) {
    staffData.phone = phone;
  }

  for (let attempt = 1; attempt <= MAX_EMPLOYEE_CODE_ATTEMPTS; attempt += 1) {
    const employeeCode = await generateNextEmployeeCode();

    try {
      // eslint-disable-next-line no-await-in-loop
      const staff = await Staff.create({ ...staffData, employee_code: employeeCode });
      return formatStaffResponse(staff);
    } catch (err) {
      const isDuplicateKey = err.code === 11000;
      const isDuplicateEmail = isDuplicateKey && err.keyPattern && err.keyPattern.email;
      const isDuplicateEmployeeCode = isDuplicateKey && err.keyPattern && err.keyPattern.employee_code;

      if (isDuplicateEmail) {
        throw new AppError('A staff member with this email already exists.', 409, ErrorCodes.CONFLICT);
      }

      if (isDuplicateEmployeeCode && attempt < MAX_EMPLOYEE_CODE_ATTEMPTS) {
        // Another request took this code between generation and insert; retry with a fresh one.
        // eslint-disable-next-line no-continue
        continue;
      }

      throw err;
    }
  }

  throw new AppError('Could not generate a unique staff ID. Please try again.', 500, ErrorCodes.INTERNAL_ERROR);
}

async function getStaffList({ page, limit, skip }) {
  const filter = { deleted_at: null };

  const [staffMembers, total] = await Promise.all([
    Staff.find(filter).sort({ created_at: -1 }).skip(skip).limit(limit),
    Staff.countDocuments(filter),
  ]);

  return {
    staff: staffMembers.map(formatStaffResponse),
    pagination: buildPaginationMeta({ page, limit, total }),
  };
}

async function getStaffByStaffId(staffId) {
  const staff = await Staff.findOne({ employee_code: staffId, deleted_at: null });

  if (!staff) {
    throw new AppError('Staff member not found.', 404, ErrorCodes.NOT_FOUND);
  }

  return formatStaffResponse(staff);
}

async function deleteStaff(staffId) {
  const staff = await Staff.findOne({ employee_code: staffId, deleted_at: null });

  if (!staff) {
    throw new AppError('Staff member not found.', 404, ErrorCodes.NOT_FOUND);
  }

  staff.deleted_at = new Date();
  await staff.save();

  return formatStaffResponse(staff);
}

async function updateStaff(staffId, { firstName, lastName, email, phone }) {
  const staff = await Staff.findOne({ employee_code: staffId, deleted_at: null });

  if (!staff) {
    throw new AppError('Staff member not found.', 404, ErrorCodes.NOT_FOUND);
  }

  staff.first_name = firstName;
  staff.last_name = lastName;
  staff.email = email || undefined;
  staff.phone = phone || undefined;

  try {
    await staff.save();
  } catch (err) {
    const isDuplicateEmail = err.code === 11000 && err.keyPattern && err.keyPattern.email;

    if (isDuplicateEmail) {
      throw new AppError('A staff member with this email already exists.', 409, ErrorCodes.CONFLICT);
    }

    throw err;
  }

  return formatStaffResponse(staff);
}

async function updateStaffStatus(staffId, status) {
  const staff = await Staff.findOne({ employee_code: staffId, deleted_at: null });

  if (!staff) {
    throw new AppError('Staff member not found.', 404, ErrorCodes.NOT_FOUND);
  }

  staff.status = status;
  await staff.save();

  return formatStaffResponse(staff);
}

// Puts a staff member's password back to the default one, for when they have forgotten theirs. Passwords
// are plain text by explicit project decision, so this is a straight overwrite.
async function resetStaffPassword(staffId) {
  const staff = await Staff.findOne({ employee_code: staffId, deleted_at: null });

  if (!staff) {
    throw new AppError('Staff member not found.', 404, ErrorCodes.NOT_FOUND);
  }

  // An inactive account is left alone: it has to be reactivated first. (The admin UI greys the button out
  // for inactive staff; this is the server-side guarantee behind it.)
  if (staff.status !== StaffStatus.ACTIVE) {
    throw new AppError(
      "An inactive staff member's password can't be reset. Reactivate them first.",
      409,
      ErrorCodes.CONFLICT
    );
  }

  // password_reset_at is what signs a staff member out of every session they already have: authenticate
  // rejects any token issued before it. timestamps:false keeps updated_at meaning "profile was edited".
  await Staff.updateOne(
    { _id: staff._id },
    { $set: { password: Defaults.DEFAULT_STAFF_PASSWORD, password_reset_at: new Date() } },
    { timestamps: false }
  );

  return formatStaffResponse(staff);
}

module.exports = {
  formatStaffResponse,
  createStaff,
  getStaffList,
  getStaffByStaffId,
  deleteStaff,
  updateStaff,
  updateStaffStatus,
  resetStaffPassword,
};
