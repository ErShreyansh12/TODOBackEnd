const TaskTimeline = Object.freeze({
  DAILY: 'daily',
  SATURDAY: 'saturday',
  FIRST_OF_MONTH: '1st',
  SIXTEENTH_OF_MONTH: '16th',
  MONTHLY: 'monthly',
  CUSTOM: 'custom',
  // A rule the user builds: every N days / weeks (on chosen weekdays) / months (on chosen days of the month).
  REPEAT: 'repeat',
  // No due date at all: a someday task. It never becomes delayed and never repeats.
  NONE: 'none',
});

module.exports = TaskTimeline;
