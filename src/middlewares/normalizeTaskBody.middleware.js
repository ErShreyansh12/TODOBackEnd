// Multipart forms can only carry text, so `customDates` may arrive as a JSON string, a repeated field,
// `customDates[0][date]` style fields, or (for JSON requests) an array of strings / { date } objects.
// This turns all of them into a plain array of "YYYY-MM-DD" strings before validation.
function normalizeCustomDates(req, res, next) {
  normalizeRecurrence(req);
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

// The repeat rule arrives the same way: a JSON string in a multipart form, an object in a JSON request.
function normalizeRecurrence(req) {
  const value = req.body ? req.body.recurrence : undefined;
  if (typeof value !== 'string' || value === '') return;
  try {
    req.body.recurrence = JSON.parse(value);
  } catch (err) {
    // Left as a string; validation rejects it with a clear message.
  }
}

module.exports = { normalizeCustomDates };
