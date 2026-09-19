const staffService = require('../services/staff.service');
const { sendSuccess } = require('../utils/response');
const { parsePagination } = require('../utils/pagination');

async function createStaff(req, res, next) {
  try {
    const { firstName, lastName, email, phone } = req.body;
    const staff = await staffService.createStaff({
      firstName,
      lastName,
      email,
      phone,
      createdBy: req.user.id,
    });

    return sendSuccess(res, {
      statusCode: 201,
      message: 'Staff member added successfully.',
      data: { staff },
    });
  } catch (err) {
    return next(err);
  }
}

async function getStaff(req, res, next) {
  try {
    const { staffId } = req.params;

    if (staffId) {
      const staff = await staffService.getStaffByStaffId(staffId);

      return sendSuccess(res, {
        statusCode: 200,
        message: 'Staff member fetched successfully.',
        data: { staff },
      });
    }

    const { page, limit, skip } = parsePagination(req.query);
    const { staff, pagination } = await staffService.getStaffList({ page, limit, skip });

    return sendSuccess(res, {
      statusCode: 200,
      message: 'Staff list fetched successfully.',
      data: staff,
      pagination,
    });
  } catch (err) {
    return next(err);
  }
}

async function deleteStaff(req, res, next) {
  try {
    const { staffId } = req.params;
    const staff = await staffService.deleteStaff(staffId);

    return sendSuccess(res, {
      statusCode: 200,
      message: 'Staff member deleted successfully.',
      data: { staff },
    });
  } catch (err) {
    return next(err);
  }
}

async function updateStaff(req, res, next) {
  try {
    const { staffId } = req.params;
    const { firstName, lastName, email, phone } = req.body;
    const staff = await staffService.updateStaff(staffId, { firstName, lastName, email, phone });

    return sendSuccess(res, {
      statusCode: 200,
      message: 'Staff member updated successfully.',
      data: { staff },
    });
  } catch (err) {
    return next(err);
  }
}

async function updateStaffStatus(req, res, next) {
  try {
    const { staffId } = req.params;
    const { status } = req.body;
    const staff = await staffService.updateStaffStatus(staffId, status);

    return sendSuccess(res, {
      statusCode: 200,
      message: 'Staff status updated successfully.',
      data: { staff },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { createStaff, getStaff, deleteStaff, updateStaff, updateStaffStatus };
