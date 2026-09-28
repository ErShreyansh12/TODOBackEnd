const authService = require('../services/auth.service');
const { sendSuccess } = require('../utils/response');

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const result = await authService.loginAdmin({ email, password });

    return sendSuccess(res, {
      statusCode: 200,
      message: 'Login successful.',
      data: result,
    });
  } catch (err) {
    return next(err);
  }
}

async function staffLogin(req, res, next) {
  try {
    const { staffId, password } = req.body;
    const result = await authService.loginStaff({ staffId, password });

    return sendSuccess(res, {
      statusCode: 200,
      message: 'Login successful.',
      data: result,
    });
  } catch (err) {
    return next(err);
  }
}

async function logout(req, res, next) {
  try {
    await authService.logout({ userId: req.user.id, role: req.user.role, token: req.token });

    return sendSuccess(res, {
      statusCode: 200,
      message: 'Logged out successfully.',
      data: null,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { login, staffLogin, logout };
