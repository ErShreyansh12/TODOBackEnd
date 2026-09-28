const { DateTime } = require('luxon');
const TaskTimeline = require('../constants/taskTimeline');

const WEEKDAY_SATURDAY = 6;
const WEEKDAY_FRIDAY = 5;
const MAX_DAY_SCAN = 14;
const MAX_MONTH_SCAN = 3;

function atTime(dateTime, timeOfDay) {
  const [hour, minute] = timeOfDay.split(':').map(Number);
  return dateTime.set({ hour, minute, second: 0, millisecond: 0 });
}

function toDate(dateTime) {
  return dateTime.toUTC().toJSDate();
}

// A day beyond the month's length (e.g. 31 in April) falls back to the month's last day.
function nextDayOfMonth(after, timeOfDay, day) {
  let month = after.startOf('month');

  for (let i = 0; i < MAX_MONTH_SCAN; i += 1) {
    const candidate = atTime(month.set({ day: Math.min(day, month.daysInMonth) }), timeOfDay);
    if (candidate > after) {
      return candidate;
    }
    month = month.plus({ months: 1 });
  }

  return null;
}

function nextWeekday(after, timeOfDay, isAllowedWeekday) {
  const startOfDay = after.startOf('day');

  for (let i = 0; i < MAX_DAY_SCAN; i += 1) {
    const candidate = atTime(startOfDay.plus({ days: i }), timeOfDay);
    if (isAllowedWeekday(candidate.weekday) && candidate > after) {
      return candidate;
    }
  }

  return null;
}

function customDateTimes(customDates, timeOfDay, timezone) {
  return (customDates || [])
    .map((date) => atTime(DateTime.fromISO(date, { zone: timezone }), timeOfDay))
    .filter((dateTime) => dateTime.isValid)
    .sort((a, b) => a.toMillis() - b.toMillis());
}

// Returns the first occurrence strictly after `after` as a UTC Date, or null when the timeline has no more occurrences.
function nextOccurrence({ timeline, timeOfDay, timezone, customDates, monthlyDay, after }) {
  const zonedAfter = DateTime.fromJSDate(after, { zone: timezone });
  let result = null;

  switch (timeline) {
    case TaskTimeline.DAILY:
      result = nextWeekday(zonedAfter, timeOfDay, (weekday) => weekday <= WEEKDAY_FRIDAY);
      break;
    case TaskTimeline.SATURDAY:
      result = nextWeekday(zonedAfter, timeOfDay, (weekday) => weekday === WEEKDAY_SATURDAY);
      break;
    case TaskTimeline.FIRST_OF_MONTH:
      result = nextDayOfMonth(zonedAfter, timeOfDay, 1);
      break;
    case TaskTimeline.SIXTEENTH_OF_MONTH:
      result = nextDayOfMonth(zonedAfter, timeOfDay, 16);
      break;
    case TaskTimeline.MONTHLY:
      result = nextDayOfMonth(zonedAfter, timeOfDay, monthlyDay);
      break;
    case TaskTimeline.CUSTOM:
      result = customDateTimes(customDates, timeOfDay, timezone).find((dateTime) => dateTime > zonedAfter) || null;
      break;
    default:
      throw new Error(`Unknown timeline: ${timeline}`);
  }

  return result ? toDate(result) : null;
}

function isValidCalendarDate(date, timezone) {
  return DateTime.fromISO(date, { zone: timezone }).isValid;
}

function dayOfMonthIn(date, timezone) {
  return DateTime.fromJSDate(date, { zone: timezone }).day;
}

function toLocalParts(date, timezone) {
  const zoned = DateTime.fromJSDate(date, { zone: timezone });
  return { dueDate: zoned.toFormat('yyyy-MM-dd'), time: zoned.toFormat('HH:mm') };
}

function todayIn(timezone, now = new Date()) {
  return DateTime.fromJSDate(now, { zone: timezone }).toFormat('yyyy-MM-dd');
}

module.exports = { nextOccurrence, isValidCalendarDate, dayOfMonthIn, toLocalParts, todayIn, customDateTimes };
