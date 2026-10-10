/**
 * One-off data migration for todo_task_db.
 *
 * - Converts tasks with status 'in_progress' to 'todo'. Users now only see two states (open or
 *   completed); the app already reads in_progress as todo, so this just tidies the stored data.
 *   Idempotent: only touches documents still marked in_progress.
 *
 * Usage: MONGODB_URI=mongodb://127.0.0.1:27017/todo_task_db node scripts/drop-in-progress.js
 */
const mongoose = require('mongoose');
const TaskStatus = require('../src/constants/taskStatus');

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required');

  await mongoose.connect(uri);
  const tasks = mongoose.connection.db.collection('tasks');

  const filter = { status: TaskStatus.IN_PROGRESS };
  const before = await tasks.countDocuments(filter);
  console.log(`tasks marked in_progress: ${before}`);

  if (before > 0) {
    const res = await tasks.updateMany(filter, { $set: { status: TaskStatus.TODO } });
    console.log(`updated: ${res.modifiedCount}`);
  }

  const after = await tasks.countDocuments(filter);
  console.log(`tasks marked in_progress after migration: ${after}`);

  await mongoose.disconnect();
  if (after !== 0) process.exitCode = 1;
}

main().catch(async (err) => {
  console.error('Migration failed:', err);
  await mongoose.disconnect();
  process.exitCode = 1;
});
