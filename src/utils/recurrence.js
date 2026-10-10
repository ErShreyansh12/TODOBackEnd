const { DateTime } = require('luxon');
const TaskTimeline = require('../constants/taskTimeline');

const WEEKDAY_SATURDAY = 6;
const WEEKDAY_FRIDAY = 5;
const MAX_DAY_SCAN = 14;
const MAX_MONTH_SCAN = 3;
// How far ahead a repeat rule is searched for its next day: enough for "every 12 months" or "every 52 weeks".
const MAX_REPEAT_SCAN_DAYS = 3 * 366;

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

// Whether a repeat rule ({ every, unit, weekdays?, monthDays?, start, until? }) falls on `day`. Intervals count
// from the rule's start: "every 2 weeks" means the start's week, then every other week after it.
function repeatMatches(day, rule, start) {
  switch (rule.unit) {
    case 'day':
      return Math.round(day.diff(start, 'days').days) % rule.every === 0;
    case 'week': {
      if (!rule.weekdays.includes(day.weekday)) return false;
      const weeks = Math.round(day.startOf('week').diff(start.startOf('week'), 'days').days) / 7;
      return weeks % rule.every === 0;
    }
    case 'month': {
      const months = (day.year - start.year) * 12 + (day.month - start.month);
      if (months % rule.every !== 0) return false;
      // A chosen day past the month's end (e.g. 31 in April) falls on the month's last day.
      return rule.monthDays.some((monthDay) => Math.min(monthDay, day.daysInMonth) === day.day);
    }
    default:
      throw new Error(`Unknown repeat unit: ${rule.unit}`);
  }
}

function nextRepeat(after, timeOfDay, rule, timezone) {
  const start = DateTime.fromISO(rule.start, { zone: timezone }).startOf('day');
  const until = rule.until ? DateTime.fromISO(rule.until, { zone: timezone }).endOf('day') : null;
  let day = DateTime.max(after.startOf('day'), start);

  for (let i = 0; i < MAX_REPEAT_SCAN_DAYS; i += 1) {
    if (until && day > until) return null;
    if (repeatMatches(day, rule, start)) {
      const candidate = atTime(day, timeOfDay);
      if (candidate > after) return candidate;
    }
    day = day.plus({ days: 1 });
  }

  return null;
}

// Returns the first occurrence strictly after `after` as a UTC Date, or null when the timeline has no more occurrences.
function nextOccurrence({ timeline, timeOfDay, timezone, customDates, monthlyDay, recurrence, after }) {
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
    case TaskTimeline.REPEAT:
      result = nextRepeat(zonedAfter, timeOfDay, recurrence, timezone);
      break;
    case TaskTimeline.NONE:
      result = null;
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
