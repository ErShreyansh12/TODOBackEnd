// The DB only stores todo/in_progress/completed (see TaskStatus). "Delayed" is never stored -
// it's computed from due_date vs now, same as the frontend's getDisplayStatus already does.
// This is the single vocabulary clients filter by and see in the `displayStatus` response field.
const TaskDisplayStatus = Object.freeze({
  TODO: 'todo',
  IN_PROGRESS: 'in_progress',
  DELAYED: 'delayed',
  COMPLETED: 'completed',
});

module.exports = TaskDisplayStatus;
