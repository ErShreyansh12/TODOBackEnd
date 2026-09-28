// Multipart forms can only carry text, so `customDates` may arrive as a JSON string, a repeated field,
// `customDates[0][date]` style fields, or (for JSON requests) an array of strings / { date } objects.
// This turns all of them into a plain array of "YYYY-MM-DD" strings before validation.
function normalizeCustomDates(req, res, next) {
  let value = req.body ? req.body.customDates : undefined;

  if (value === undefined || value === null || value === '') {
    return next();
  }

  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch (err) {
      value = [value];
    }
  }

  if (!Array.isArray(value)) {
    value = [value];
  }

  req.body.customDates = value.map((entry) =>
    entry && typeof entry === 'object' && 'date' in entry ? entry.date : entry
  );

  return next();
}

module.exports = { normalizeCustomDates };
