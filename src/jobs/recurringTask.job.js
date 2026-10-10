const cron = require('node-cron');
const logger = require('../config/logger');
const Admin = require('../models/Admin');
const Staff = require('../models/Staff');
const Task = require('../models/Task');
const TaskSeries = require('../models/TaskSeries');
const AssigneeType = require('../constants/assigneeType');
const TaskStatus = require('../constants/taskStatus');
const { nextOccurrence } = require('../utils/recurrence');
const { buildOccurrenceData } = require('../services/task.service');

const SCHEDULE = '*/5 * * * *';
const BATCH_SIZE = 100;
// Caps how many missed occurrences one run backfills for a series (about six weeks of a daily task).
const MAX_BACKFILL = 30;

let isRunning = false;

async function assigneeStillExists(series) {
  const Model = series.assignee_type === AssigneeType.STAFF ? Staff : Admin;
  return Boolean(await Model.exists({ _id: series.assignee_id, deleted_at: null }));
}

async function processSeries(series, now) {
  // Nobody is left to do the work, so stop the series instead of piling up delayed tasks.
  if (!(await assigneeStillExists(series))) {
    series.ended_at = now;
    await series.save();
    logger.info(`Recurring task series ${series._id} ended: assignee was deleted`);
    return;
  }

  const schedule = {
    timeline: series.timeline,
    timeOfDay: series.time_of_day,
    timezone: series.timezone,
    customDates: series.custom_dates,
    monthlyDay: series.monthly_day,
    recurrence: series.recurrence,
  };

  // Walk forward from the last occurrence, not from `now`: if the server was down (a deploy, a crash) the
  // occurrences it missed are still created, and show as delayed, instead of silently disappearing.
  // The walk stops at the first occurrence in the future, which becomes the open task.
  const dueDates = [];
  let cursor = series.last_due_date;
  while (dueDates.length < MAX_BACKFILL) {
    const next = nextOccurrence({ ...schedule, after: cursor });
    if (!next) break;
    dueDates.push(next);
    if (next > now) break;
    cursor = next;
  }

  if (dueDates.length === 0) {
    series.ended_at = now;
    await series.save();
    logger.info(`Recurring task series ${series._id} ended: no more occurrences`);
    return;
  }

  for (const dueDate of dueDates) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await Task.create(buildOccurrenceData(series, dueDate, TaskStatus.TODO));
    } catch (err) {
      // The unique (series_id, due_date) index means another run already created it - that's fine.
      if (err.code !== 11000) {
        throw err;
      }
    }
  }

  if (dueDates.length > 1) {
    logger.info(`Recurring task series ${series._id}: backfilled ${dueDates.length - 1} missed occurrence(s)`);
  }

  // If we crash between the writes, the next run walks the same dates, hits the unique index above, and catches up.
  // completion_at is reset here too: it mirrors the newly-created (uncompleted) occurrence, not the one it replaced.
  await TaskSeries.updateOne(
    { _id: series._id, last_due_date: series.last_due_date },
    { $set: { last_due_date: dueDates[dueDates.length - 1], completion_at: null } }
  );
}

async function runRecurringTaskJob(now = new Date()) {
  if (isRunning) {
    return { skipped: true };
  }

  isRunning = true;
  const summary = { processed: 0, failed: 0 };
  const failedIds = [];

  try {
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const dueSeries = await TaskSeries.find({
        deleted_at: null,
        ended_at: null,
        last_due_date: { $lte: now },
        _id: { $nin: failedIds },
      }).limit(BATCH_SIZE);

      if (dueSeries.length === 0) {
        break;
      }

      for (const series of dueSeries) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await processSeries(series, now);
          summary.processed += 1;
        } catch (err) {
          summary.failed += 1;
          failedIds.push(series._id);
          logger.error(`Recurring task series ${series._id} failed: ${err.message}`);
        }
      }
    }
  } finally {
    isRunning = false;
  }

  if (summary.processed > 0 || summary.failed > 0) {
    logger.info(`Recurring task job finished: ${summary.processed} processed, ${summary.failed} failed`);
  }

  return summary;
}

function startRecurringTaskJob() {
  const run = () => runRecurringTaskJob().catch((err) => logger.error(`Recurring task job crashed: ${err.message}`));

  cron.schedule(SCHEDULE, run);
  // Also run once at startup so anything missed while the server was down is caught up immediately.
  run();
}

module.exports = { runRecurringTaskJob, startRecurringTaskJob };
