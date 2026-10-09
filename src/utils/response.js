function sendSuccess(res, { statusCode = 200, message, data, pagination, range, counts }) {
  const body = {
    success: true,
    message,
    data,
  };

  if (pagination) {
    body.pagination = pagination;
  }

  if (range) {
    body.range = range;
  }

  if (counts) {
    body.counts = counts;
  }

  return res.status(statusCode).json(body);
}

module.exports = { sendSuccess };
