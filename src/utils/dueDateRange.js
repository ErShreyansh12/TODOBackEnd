const { DateTime } = require('luxon');
const AppError = require('./AppError');
const ErrorCodes = require('../constants/errorCodes');

const DateRange = Object.freeze({
  AROUND_TODAY: 'yesterday_to_tomorrow',
  THIS_WEEK: 'this_week',
  LAST_WEEK: 'last_week',
  CUSTOM: 'custom',
});

// Inclusive: 30 days means from = 1 Sep, to = 30 Sep is allowed, to = 1 Oct is not.
const MAX_CUSTOM_RANGE_DAYS = 30;

const DATE_KEY_FORMAT = 'yyyy-MM-dd';

function validationError(message) {
  return new AppError(message, 422, ErrorCodes.VALIDATION_ERROR);
}

function parseDateKey(value, name, timezone) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw validationError(`"${name}" must be a date in YYYY-MM-DD format.`);
  }

  const parsed = DateTime.fromISO(value, { zone: timezone });
  if (!parsed.isValid) {
    throw validationError(`"${name}" is not a valid calendar date.`);
  }

  return parsed.startOf('day');
}

// Resolves a named range to whole calendar days in the app time zone. A week runs Monday to Sunday
// (ISO week). Returns `start` (inclusive) and `end` (exclusive) as UTC Dates for the due_date query, and
// `from`/`to` (inclusive, YYYY-MM-DD) for display, so clients never have to work out week boundaries.
function resolveDueDateRange({ range, from, to }, timezone, now = new Date()) {
  if (!Object.values(DateRange).includes(range)) {
    throw validationError(`"range" must be one of ${Object.values(DateRange).join(', ')}.`);
  }

  const today = DateTime.fromJSDate(now, { zone: timezone }).startOf('day');
  let first;
  let last;

  switch (range) {
    case DateRange.AROUND_TODAY:
      first = today.minus({ days: 1 });
      last = today.plus({ days: 1 });
      break;
    case DateRange.THIS_WEEK:
      first = today.startOf('week');
      last = first.plus({ days: 6 });
      break;
    case DateRange.LAST_WEEK:
      first = today.startOf('week').minus({ weeks: 1 });
      last = first.plus({ days: 6 });
      break;
    default: {
      if (!from || !to) {
        throw validationError('"from" and "to" are required when range is custom.');
      }

      first = parseDateKey(from, 'from', timezone);
      last = parseDateKey(to, 'to', timezone);

      if (last < first) {
        throw validationError('"to" must be on or after "from".');
      }

      const days = Math.round(last.diff(first, 'days').days) + 1;
      if (days > MAX_CUSTOM_RANGE_DAYS) {
        throw validationError(`The date range can be at most ${MAX_CUSTOM_RANGE_DAYS} days.`);
      }
    }
  }

  return {
    range,
    from: first.toFormat(DATE_KEY_FORMAT),
    to: last.toFormat(DATE_KEY_FORMAT),
    start: first.toUTC().toJSDate(),
    end: last.plus({ days: 1 }).toUTC().toJSDate(),
  };
}

module.exports = { DateRange, MAX_CUSTOM_RANGE_DAYS, resolveDueDateRange };
