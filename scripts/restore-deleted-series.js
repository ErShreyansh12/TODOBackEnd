/**
 * One-off repair for todo_task_db.
 *
 * - Un-deletes task series that were ended only because an older (past) occurrence was deleted.
 *   Before the fix in task.service#deleteTask, deleting any occurrence ended its whole series, so the
 *   recurring job stopped creating it. A series is restored only when its current occurrence
 *   (due_date == last_due_date) still exists and is not deleted, and the series was deleted at the same
 *   moment as one of its older occurrences. Idempotent: restored series have deleted_at = null.
 *
 * Dry run by default; pass --apply to write. --skip <seriesId>[,<seriesId>...] leaves those series deleted.
 * Usage: MONGODB_URI=mongodb://127.0.0.1:27017/todo_task_db node scripts/restore-deleted-series.js [--skip ids] [--apply]
 */
const mongoose = require('mongoose');

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required');
  const apply = process.argv.includes('--apply');
  const skipIndex = process.argv.indexOf('--skip');
  const skip = skipIndex > -1 ? (process.argv[skipIndex + 1] || '').split(',').filter(Boolean) : [];

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const series = db.collection('task_series');
  const tasks = db.collection('tasks');

  const deleted = await series.find({ deleted_at: { $ne: null } }).toArray();
  const toRestore = [];

  for (const s of deleted.filter((d) => !skip.includes(String(d._id)))) {
    // eslint-disable-next-line no-await-in-loop
    const [current, olderDeletedTogether] = await Promise.all([
      tasks.findOne({ series_id: s._id, due_date: s.last_due_date, deleted_at: null }),
      tasks.findOne({ series_id: s._id, due_date: { $lt: s.last_due_date }, deleted_at: s.deleted_at }),
    ]);
    if (current && olderDeletedTogether) toRestore.push(s);
  }

  console.log(`deleted series: ${deleted.length}, wrongly ended: ${toRestore.length}`);
  toRestore.forEach((s) => console.log(`  ${s._id}  ${s.title}  (next due ${s.last_due_date.toISOString()})`));

  if (apply && toRestore.length > 0) {
    const res = await series.updateMany(
      { _id: { $in: toRestore.map((s) => s._id) }, deleted_at: { $ne: null } },
      { $set: { deleted_at: null } }
    );
    console.log(`restored: ${res.modifiedCount}`);
  } else if (!apply) {
    console.log('Dry run. Re-run with --apply to restore.');
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('Repair failed:', err);
  await mongoose.disconnect();
  process.exitCode = 1;
});
