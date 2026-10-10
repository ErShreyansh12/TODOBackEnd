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
 *       caller can assign to themselves or to another active staff member (assigneeType must be "staff");
 *       assigning to an admin returns a 422, not a silent override.
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
 *       Without a `status` filter, the list defaults to a working window: every open task (todo/delayed,
 *       regardless of age) plus tasks completed in the last 7 days. Older completed history is reachable by
 *       filtering `status=completed` or `status=completed_late`. This keeps the list from growing without bound
 *       as recurring tasks generate more occurrences over time.
 *
 *       `status` filters by display status, the same value as `displayStatus` on each returned task. Users only
 *       ever set a task open or completed; the rest is derived from the dates, never stored:
 *       - `todo`: open, due date not passed.
 *       - `delayed`: open, due date passed.
 *       - `completed`: completed on or before the due date.
 *       - `completed_late`: completed after the due date (completionAt, or updatedAt for old records).
 *
 *       `range` limits the list to tasks whose due date falls in a window of whole calendar days (server time
 *       zone, Asia/Kolkata). When it is used, the default working window above is not applied: the range is
 *       the window, so completed tasks of any age inside it are included. `status` and `search` still narrow
 *       the result. The response carries the resolved `range` ({ range, from, to }, inclusive YYYY-MM-DD).
 *       - `today`: today only.
 *       - `yesterday_to_tomorrow`: yesterday, today and tomorrow.
 *       - `this_week` / `last_week`: Monday to Sunday of the current / previous week.
 *       - `custom`: `from` and `to` are required (inclusive); at most 30 days.
 *
 *       Results are paged with `page` and `limit` (max 100). The response has `counts.byStatus`
 *       ({ todo, delayed, completed, completed_late }): how many tasks match the search/date range/assignee
 *       filters in each display status, ignoring `status`, so status tabs can all show a number at once.
 *       For an admin caller `counts` also has { all, admin, staff }: all tasks, tasks assigned to the
 *       calling admin, and staff tasks, under the search/date range/assigneeId filters. They ignore both
 *       `status` and `assigneeType`, so they don't change as the caller switches tabs.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: range
 *         schema:
 *           type: string
 *           enum: [today, yesterday_to_tomorrow, this_week, last_week, custom]
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
 *         description: Admin only - limit the list to tasks assigned to the calling admin ("My tasks") or to staff. Ignored for a staff caller.
 *       - in: query
 *         name: assigneeId
 *         schema:
 *           type: string
 *         description: Limit the list to one assignee. A staff caller only ever sees tasks assigned to or created by them.
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Case-insensitive partial match on the task title or broker.
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [todo, delayed, completed, completed_late]
 *         description: Omit for the default working-window view.
 *       - in: query
 *         name: statuses
 *         schema:
 *           type: string
 *         description: Comma-separated display statuses (task board column filter). Present, even empty, turns off the default working window.
 *       - in: query
 *         name: assignees
 *         schema:
 *           type: string
 *         description: Comma-separated "<type>:<id>" people the task is assigned to, e.g. admin:665f...,staff:6660...
 *       - in: query
 *         name: creators
 *         schema:
 *           type: string
 *         description: Comma-separated "<type>:<id>" people who created the task.
 *       - in: query
 *         name: brokers
 *         schema:
 *           type: string
 *         description: Comma-separated broker names; an empty entry means "no broker". Present but empty matches nothing.
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [due_asc, due_desc, title_asc, title_desc, broker_asc, broker_desc]
 *         description: Omit for the default order (open tasks first by due date, then completed).
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
 * /tasks/facets:
 *   get:
 *     tags:
 *       - Tasks
 *     summary: Values for the task board's column filters
 *     description: |
 *       Takes the same filters as GET /tasks (no paging or sort) and returns, for each filterable column,
 *       the values present and how many tasks have each. Each column's values reflect every other active
 *       filter but not its own, like a spreadsheet filter. People are { value: "<type>:<id>", type, id,
 *       name, count }; a broker value of "" means tasks with no broker. A staff caller only ever sees
 *       values from tasks assigned to or created by them.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: "data is { status: [{ value, count }], assignee: [person], creator: [person], broker: [{ value, count }] }."
 *       401:
 *         description: Authentication token missing, invalid, expired, or logged out.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       422:
 *         description: Same validation errors as GET /tasks.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/facets', authenticate, requireRole(Roles.ADMIN, Roles.STAFF), taskController.getTaskFacets);

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
 *       Sets status to todo or completed ("delayed" and "completed_late" can never be set directly - it's always
 *       computed from the due date, matching the SRS rule that staff must not be able to mark a task delayed
 *       themselves).
 *
 *       Setting status to completed records completionAt (now) on both the task and its series. Moving away
 *       from completed back to todo clears completionAt on both again.
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
 *                 enum: [todo, completed]
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
 *         description: Validation error (status missing or not one of todo/completed).
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
 *       Marks this occurrence as deleted (sets deletedAt). If it is the series' current (latest) occurrence,
 *       the series ends too, so the recurring job never creates another occurrence from it. Deleting an older
 *       occurrence leaves the series running. Other occurrences are left untouched and stay visible.
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
