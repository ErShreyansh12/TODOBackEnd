// What users see. The DB only stores todo/completed (see TaskStatus); everything else is derived when
// a task is read, never set by hand:
// - delayed: still open and its due date has passed.
// - completed_late: completed after its due date (completion_at, or updated_at for old records without it).
// This is the single vocabulary clients filter by and see in the `displayStatus` response field.
const TaskDisplayStatus = Object.freeze({
  TODO: 'todo',
  DELAYED: 'delayed',
  COMPLETED: 'completed',
  COMPLETED_LATE: 'completed_late',
});

module.exports = TaskDisplayStatus;
