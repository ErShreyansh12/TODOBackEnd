/**
 * One-off data migration for todo_task_db.
 *
 * - Sets created_by_type = 'admin' on tasks that predate the field (migration 003).
 *   Idempotent: only touches documents where the field is missing.
 *
 * Usage: MONGODB_URI=mongodb://127.0.0.1:27017/todo_task_db node scripts/migrate-db.js
 */
const mongoose = require('mongoose');
const AssigneeType = require('../src/constants/assigneeType');

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required');

  await mongoose.connect(uri);
  const tasks = mongoose.connection.db.collection('tasks');

  const filter = { created_by_type: { $exists: false } };
  const before = await tasks.countDocuments(filter);
  console.log(`tasks missing created_by_type: ${before}`);

  if (before > 0) {
    const res = await tasks.updateMany(filter, { $set: { created_by_type: AssigneeType.ADMIN } });
    console.log(`updated: ${res.modifiedCount}`);
  }

  const after = await tasks.countDocuments(filter);
  console.log(`tasks missing created_by_type after migration: ${after}`);

  await mongoose.disconnect();
  if (after !== 0) process.exitCode = 1;
}

main().catch(async (err) => {
  console.error('Migration failed:', err);
  await mongoose.disconnect();
  process.exitCode = 1;
});
