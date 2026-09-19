function sendSuccess(res, { statusCode = 200, message, data, pagination }) {
  const body = {
    success: true,
    message,
    data,
  };

  if (pagination) {
    body.pagination = pagination;
  }

  return res.status(statusCode).json(body);
}

module.exports = { sendSuccess };
