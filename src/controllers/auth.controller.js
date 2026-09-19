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

module.exports = { login };
