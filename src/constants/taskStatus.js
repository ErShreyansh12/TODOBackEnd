// Users only ever see two states: a task is open (todo) or done (completed). in_progress is no longer
// offered; it's kept here only so legacy records still validate, and is read as todo everywhere.
// scripts/drop-in-progress.js converts any that remain.
const TaskStatus = Object.freeze({
  TODO: 'todo',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
});

module.exports = TaskStatus;
