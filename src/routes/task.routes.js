const express = require('express');
const taskController = require('../controllers/task.controller');
const authenticate = require('../middlewares/auth.middleware');
const requireRole = require('../middlewares/role.middleware');
const validate = require('../middlewares/validate.middleware');
const { uploadTaskAttachment } = require('../middlewares/upload.middleware');
const { normalizeCustomDates } = require('../middlewares/normalizeTaskBody.middleware');
const Roles = require('../constants/roles');
const { createTaskSchema, updateTaskSchema, updateTaskStatusSchema } = require('../validators/task.validator');

const router = express.Router();

/**
 * @openapi
 * /tasks:
 *   post:
 *     tags:
 *       - Tasks
 *     summary: Create a task
 *     description: |
 *       Creates a task and assigns it to a staff member or an admin. Admin can assign to anyone. A staff
 *       caller can only create a task assigned to themselves (assigneeType must be "staff" and assigneeId
 *       must be their own id) - attempting to assign to someone else returns a 422, not a silent override.
 *
 *       The task repeats according to its timeline: the first deadline is stored now, and a background job
 *       creates each following occurrence automatically after the previous deadline passes, until the task
 *       is deleted (or, for custom dates, the last date passes).
 *
 *       The time is interpreted in the server time zone (Asia/Kolkata) and stored in UTC.
 *       The attachment is optional (pdf, doc, docx, xls, xlsx, png, jpg; max 5 MB). Send `multipart/form-data`
 *       when attaching a file, otherwise JSON works too. For `custom` timeline, send `customDates` as a JSON
 *       array string in multipart (e.g. `["2026-10-01","2026-10-05"]`) or as an array in JSON.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             allOf:
 *               - $ref: '#/components/schemas/CreateTaskRequest'
 *               - type: object
 *                 properties:
 *                   attachment:
 *                     type: string
 *                     format: binary
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateTaskRequest'
 *     responses:
 *       201:
 *         description: Task created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         task:
 *                           $ref: '#/components/schemas/TaskRecord'
 *       401:
 *         description: Authentication token missing, invalid, expired, or logged out.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       422:
 *         description: Validation error (bad fields, unknown/inactive assignee, a staff caller assigning to someone else, past custom dates, bad or oversized attachment).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
  '/',
  authenticate,
  requireRole(Roles.ADMIN, Roles.STAFF),
  uploadTaskAttachment,
  normalizeCustomDates,
  validate(createTaskSchema),
  taskController.createTask
);

/**
 * @openapi
 * /tasks:
 *   get:
 *     tags:
 *       - Tasks
 *     summary: Get the task list
 *     description: |
 *       Admin sees every task in the system — both tasks assigned to an admin and tasks assigned to staff
 *       members, not just tasks the caller created. A staff caller only sees tasks assigned to themselves.
 *
 *       Without a `status` filter, the list defaults to a working window: every open task (todo/in_progress/delayed,
 *       regardless of age) plus tasks completed in the last 7 days. Older completed history is reachable by
 *       explicitly filtering `status=completed`. This keeps the list from growing without bound as recurring
 *       tasks generate more occurrences over time.
 *
 *       `status` accepts `delayed` in addition to the three stored statuses — a task is delayed when its due
 *       date has passed and it isn't completed yet; this is computed, not stored, same as `displayStatus` on
 *       each returned task.
 *
 *       `range` limits the list to tasks whose due date falls in a window of whole calendar days (server time
 *       zone, Asia/Kolkata). When it is used, the default working window above is not applied: the range is
 *       the window, so completed tasks of any age inside it are included. `status` and `search` still narrow
 *       the result. The response carries the resolved `range` ({ range, from, to }, inclusive YYYY-MM-DD).
 *       - `yesterday_to_tomorrow`: yesterday, today and tomorrow.
 *       - `this_week` / `last_week`: Monday to Sunday of the current / previous week.
 *       - `custom`: `from` and `to` are required (inclusive); at most 30 days.
 *
 *       Results are paged with `page` and `limit` (max 100). For an admin caller the response also has `counts`
 *       ({ all, admin, staff }): how many tasks match the search/status/date range/assigneeId filters on each
 *       side, ignoring `assigneeType` so the "My tasks / Staff tasks" tabs can show both numbers at once.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: range
 *         schema:
 *           type: string
 *           enum: [yesterday_to_tomorrow, this_week, last_week, custom]
 *         description: Omit for the default working-window view.
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           example: 2026-10-01
 *         description: First day (YYYY-MM-DD). Only with range=custom.
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           example: 2026-10-30
 *         description: Last day (YYYY-MM-DD), on or after from and at most 30 days from it. Only with range=custom.
 *       - in: query
 *         name: assigneeType
 *         schema:
 *           type: string
 *           enum: [admin, staff]
 *         description: Admin only - limit the list to tasks assigned to an admin ("My tasks") or to staff. Ignored for a staff caller.
 *       - in: query
 *         name: assigneeId
 *         schema:
 *           type: string
 *         description: Limit the list to one assignee. Ignored for a staff caller, who only ever sees their own tasks.
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Case-insensitive partial match on the task title.
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [todo, in_progress, delayed, completed]
 *         description: Omit for the default working-window view.
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Tasks fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/TaskRecord'
 *                     pagination:
 *                       $ref: '#/components/schemas/PaginationMeta'
 *       401:
 *         description: Authentication token missing, invalid, expired, or logged out.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       422:
 *         description: Invalid status value, or an invalid date range (unknown range, missing/invalid from or to, to before from, more than 30 days), or an invalid assigneeType/assigneeId.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/', authenticate, requireRole(Roles.ADMIN, Roles.STAFF), taskController.getAdminTasks);

/**
 * @openapi
 * /tasks/{taskId}:
 *   get:
 *     tags:
 *       - Tasks
 *     summary: Get one task
 *     description: |
 *       Returns a single task regardless of its age or status, so a task opened from an old date range is
 *       always reachable. Admin can fetch any task. A staff member can only fetch a task assigned to them -
 *       anything else returns 404, the same response as a task that doesn't exist.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *         example: 6aae1234ab56cd78ef901234
 *     responses:
 *       200:
 *         description: Task fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         task:
 *                           $ref: '#/components/schemas/TaskRecord'
 *       401:
 *         description: Authentication token missing, invalid, expired, or logged out.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Task not found, deleted, or (for a staff token) not assigned to the caller.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/:taskId', authenticate, requireRole(Roles.ADMIN, Roles.STAFF), taskController.getTask);

/**
 * @openapi
 * /tasks/{taskId}/status:
 *   patch:
 *     tags:
 *       - Tasks
 *     summary: Change a task's status
 *     description: |
 *       Sets status to todo, in_progress, or completed ("delayed" can never be set directly - it's always
 *       computed from the due date, matching the SRS rule that staff must not be able to mark a task delayed
 *       themselves).
 *
 *       Setting status to completed records completionAt (now) on both the task and its series. Moving away
 *       from completed back to todo/in_progress clears completionAt on both again.
 *
 *       Admin can change the status of any task. A staff member can only change the status of a task assigned
 *       to them - a task assigned to someone else (or a non-existent one) returns 404, the same response either
 *       way, so a staff token can't be used to probe which task IDs exist.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *         example: 6aae1234ab56cd78ef901234
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [todo, in_progress, completed]
 *     responses:
 *       200:
 *         description: Task status updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         task:
 *                           $ref: '#/components/schemas/TaskRecord'
 *       401:
 *         description: Authentication token missing, invalid, expired, or logged out.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Task not found, deleted, or (for a staff token) not assigned to the caller.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       422:
 *         description: Validation error (status missing or not one of todo/in_progress/completed).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.patch(
  '/:taskId/status',
  authenticate,
  validate(updateTaskStatusSchema),
  taskController.updateTaskStatus
);

/**
 * @openapi
 * /tasks/{taskId}:
 *   put:
 *     tags:
 *       - Tasks
 *     summary: Edit a task (admin only)
 *     description: |
 *       Updates title, description, broker, attachment, assignee, timeline, time, custom dates and priority.
 *       Status is not editable here — use PATCH /tasks/{taskId}/status.
 *
 *       Because this task is one occurrence of a recurring series, the change applies to this occurrence AND
 *       every future occurrence: the series definition is updated so the recurring job keeps generating
 *       occurrences with the new values, and the due date is recomputed from now using the (possibly new)
 *       timeline/time. Already-generated past occurrences are historical and are never touched.
 *
 *       Omitting the attachment field keeps the current attachment; sending a new file replaces it and removes
 *       the old file from disk. Editing a task whose series had ended (e.g. its assignee was deleted) revives it,
 *       using whatever assignee/timeline is submitted now.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *         example: 6aae1234ab56cd78ef901234
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             allOf:
 *               - $ref: '#/components/schemas/CreateTaskRequest'
 *               - type: object
 *                 properties:
 *                   attachment:
 *                     type: string
 *                     format: binary
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateTaskRequest'
 *     responses:
 *       200:
 *         description: Task updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         task:
 *                           $ref: '#/components/schemas/TaskRecord'
 *       401:
 *         description: Authentication token missing, invalid, expired, or logged out.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Logged-in user is not an admin.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Task not found or deleted.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       422:
 *         description: Validation error (bad fields, unknown/inactive assignee, past custom dates, due-date conflict, bad or oversized attachment).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.put(
  '/:taskId',
  authenticate,
  requireRole(Roles.ADMIN),
  uploadTaskAttachment,
  normalizeCustomDates,
  validate(updateTaskSchema),
  taskController.updateTask
);

/**
 * @openapi
 * /tasks/{taskId}:
 *   delete:
 *     tags:
 *       - Tasks
 *     summary: Delete a task (admin only, soft delete)
 *     description: |
 *       Marks this occurrence as deleted (sets deletedAt) and ends the series so the recurring job never
 *       creates another occurrence from it. Already-generated past occurrences (completed/delayed history)
 *       are left untouched and stay visible in the task list — only this occurrence and future ones are gone.
 *       Nothing is removed from the database.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *         example: 6aae1234ab56cd78ef901234
 *     responses:
 *       200:
 *         description: Task deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         task:
 *                           $ref: '#/components/schemas/TaskRecord'
 *       401:
 *         description: Authentication token missing, invalid, expired, or logged out.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Logged-in user is not an admin.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Task not found or already deleted.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.delete('/:taskId', authenticate, requireRole(Roles.ADMIN), taskController.deleteTask);

module.exports = router;
