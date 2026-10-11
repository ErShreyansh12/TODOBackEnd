const express = require('express');
const meetingController = require('../controllers/meeting.controller');
const authenticate = require('../middlewares/auth.middleware');
const requireRole = require('../middlewares/role.middleware');
const validate = require('../middlewares/validate.middleware');
const Roles = require('../constants/roles');
const { createMeetingSchema, updateMeetingSchema } = require('../validators/meeting.validator');

const router = express.Router();

/**
 * @openapi
 * /meetings:
 *   post:
 *     tags:
 *       - Meetings
 *     summary: Schedule a meeting (admin only)
 *     description: |
 *       Creates a meeting on the given date between startTime and endTime. The date and times are in the
 *       server time zone (Asia/Kolkata). endTime must be later than startTime, and both must be on the same
 *       date - a meeting can't run past midnight.
 *
 *       title, date, startTime, endTime and location are required; description is optional (null when left
 *       out or empty). The meeting can't be in the past: the date must be today or later, and for a meeting
 *       today the startTime must be later than the current time (Asia/Kolkata).
 *
 *       The meeting is owned by the admin who creates it.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - date
 *               - startTime
 *               - endTime
 *               - location
 *             properties:
 *               title:
 *                 type: string
 *                 example: Sprint Planning
 *               date:
 *                 type: string
 *                 example: 2026-10-14
 *                 description: Meeting date, YYYY-MM-DD. Today or a future date.
 *               startTime:
 *                 type: string
 *                 example: "10:00"
 *                 description: 24-hour HH:mm. For a meeting today it must be later than the current time.
 *               endTime:
 *                 type: string
 *                 example: "11:00"
 *                 description: 24-hour HH:mm, later than startTime
 *               location:
 *                 type: string
 *                 example: Conference Room A
 *               description:
 *                 type: string
 *                 example: Plan the next sprint and assign work.
 *     responses:
 *       201:
 *         description: Meeting created successfully.
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
 *                         meeting:
 *                           $ref: '#/components/schemas/MeetingRecord'
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
 *       422:
 *         description: Validation error (missing field, bad date/time format, a date that doesn't exist, a date in the past, a start time that has already passed today, or endTime not later than startTime).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
  '/',
  authenticate,
  requireRole(Roles.ADMIN),
  validate(createMeetingSchema),
  meetingController.createMeeting
);

/**
 * @openapi
 * /meetings:
 *   get:
 *     tags:
 *       - Meetings
 *     summary: List meetings in a date range (admin only)
 *     description: |
 *       Returns every meeting whose date is between `from` and `to`, both included (YYYY-MM-DD, server time
 *       zone Asia/Kolkata), ordered by date and then start time. Deleted meetings are never returned.
 *
 *       One call serves all three calendar views - send the days the view is drawing:
 *       - Day view: `from` and `to` are the same date.
 *       - Week view: the seven days of the week shown.
 *       - Month view: the whole visible grid (up to six weeks, including the greyed days of the
 *         neighbouring months).
 *
 *       The range can be at most 42 days. Results are paged with `page` and `limit` (default 20, at most
 *       100), in the same order across pages. A client drawing the calendar grid reads every page of its
 *       window (a month is at most a few pages of 100) so no day is left out; a list shown beside the grid,
 *       like one day's agenda, can show a page at a time.
 *
 *       Each meeting carries `isEditable` / `editableUntil`: edit and delete are both locked once less than
 *       15 minutes remain before the start.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: from
 *         required: true
 *         schema:
 *           type: string
 *           example: 2026-10-01
 *         description: First day, YYYY-MM-DD.
 *       - in: query
 *         name: to
 *         required: true
 *         schema:
 *           type: string
 *           example: 2026-10-31
 *         description: Last day, YYYY-MM-DD. On or after from, and at most 42 days from it.
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
 *         description: Meetings per page, at most 100.
 *     responses:
 *       200:
 *         description: Meetings fetched successfully. `range` echoes the days that were searched.
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
 *                         $ref: '#/components/schemas/MeetingRecord'
 *                     pagination:
 *                       $ref: '#/components/schemas/PaginationMeta'
 *                     range:
 *                       type: object
 *                       properties:
 *                         from:
 *                           type: string
 *                           example: 2026-10-01
 *                         to:
 *                           type: string
 *                           example: 2026-10-31
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
 *       422:
 *         description: from/to missing or not a real YYYY-MM-DD date, to before from, or more than 42 days.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/', authenticate, requireRole(Roles.ADMIN), meetingController.getMeetings);

/**
 * @openapi
 * /meetings/upcoming:
 *   get:
 *     tags:
 *       - Meetings
 *     summary: Upcoming meetings for today and the next 2 days (admin only)
 *     description: |
 *       Meetings that have not started yet, from now until the end of the day after tomorrow (Asia/Kolkata):
 *       the rest of today, all of tomorrow, and all of the day after. A meeting leaves this list at the
 *       minute it starts. Ordered by date and then start time. Deleted meetings are never returned.
 *
 *       The response `range` is the days covered (today to today + 2), so the client can label the list.
 *       Paged with `page` and `limit` (default 20, at most 100).
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *         description: Meetings per page, at most 100.
 *     responses:
 *       200:
 *         description: Upcoming meetings fetched successfully.
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
 *                         $ref: '#/components/schemas/MeetingRecord'
 *                     pagination:
 *                       $ref: '#/components/schemas/PaginationMeta'
 *                     range:
 *                       type: object
 *                       properties:
 *                         from:
 *                           type: string
 *                           example: 2026-10-11
 *                         to:
 *                           type: string
 *                           example: 2026-10-13
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
 */
router.get('/upcoming', authenticate, requireRole(Roles.ADMIN), meetingController.getUpcomingMeetings);

/**
 * @openapi
 * /meetings/{meetingId}:
 *   put:
 *     tags:
 *       - Meetings
 *     summary: Edit a meeting (admin only)
 *     description: |
 *       Replaces the meeting's title, date, startTime, endTime, location and description. The request body
 *       and its rules are the same as when scheduling a meeting: location is required, endTime must be later
 *       than startTime, and the new date/time can't be in the past.
 *
 *       A meeting can be edited only until 15 minutes before it starts. Exactly 15 minutes before is still
 *       allowed; once less than 15 minutes remain (or the meeting has started or is over) it is locked and
 *       this returns 409. The lock is judged on the meeting's currently saved date and start time, not on
 *       the values in the request.
 *
 *       Each meeting returned by the API carries `isEditable` and `editableUntil` so a client can disable the
 *       Edit button without doing its own clock maths.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: meetingId
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
 *               - title
 *               - date
 *               - startTime
 *               - endTime
 *               - location
 *             properties:
 *               title:
 *                 type: string
 *                 example: Sprint Planning (moved)
 *               date:
 *                 type: string
 *                 example: 2026-10-15
 *               startTime:
 *                 type: string
 *                 example: "11:00"
 *               endTime:
 *                 type: string
 *                 example: "12:00"
 *               location:
 *                 type: string
 *                 example: Conference Room B
 *               description:
 *                 type: string
 *                 example: Moved to the afternoon.
 *     responses:
 *       200:
 *         description: Meeting updated successfully.
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
 *                         meeting:
 *                           $ref: '#/components/schemas/MeetingRecord'
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
 *         description: Meeting not found or deleted.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Less than 15 minutes remain before the meeting starts (or it has already started), so it can no longer be edited.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       422:
 *         description: Validation error (same rules as creating a meeting, including a date or start time in the past).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.put(
  '/:meetingId',
  authenticate,
  requireRole(Roles.ADMIN),
  validate(updateMeetingSchema),
  meetingController.updateMeeting
);

/**
 * @openapi
 * /meetings/{meetingId}:
 *   delete:
 *     tags:
 *       - Meetings
 *     summary: Delete a meeting (admin only, soft delete)
 *     description: |
 *       Marks the meeting as deleted (sets deletedAt). Nothing is removed from the database, but the meeting
 *       no longer appears anywhere and can't be edited or deleted again.
 *
 *       A meeting can be deleted until 15 minutes before it starts (exactly 15 minutes before is still
 *       allowed), and again once it has ended. While it is less than 15 minutes from starting or still in
 *       progress it is locked and this returns 409. (Editing has no "after it has ended" exception.)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: meetingId
 *         required: true
 *         schema:
 *           type: string
 *         example: 6aae1234ab56cd78ef901234
 *     responses:
 *       200:
 *         description: Meeting deleted successfully. The returned meeting has deletedAt set.
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
 *                         meeting:
 *                           $ref: '#/components/schemas/MeetingRecord'
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
 *         description: Meeting not found or already deleted.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: The meeting is less than 15 minutes from starting or still in progress, so it can't be deleted right now (it can again once it has ended).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.delete('/:meetingId', authenticate, requireRole(Roles.ADMIN), meetingController.deleteMeeting);

module.exports = router;
