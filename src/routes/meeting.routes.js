const express = require('express');
const meetingController = require('../controllers/meeting.controller');
const authenticate = require('../middlewares/auth.middleware');
const requireRole = require('../middlewares/role.middleware');
const validate = require('../middlewares/validate.middleware');
const Roles = require('../constants/roles');
const { meetingSchema, meetingDoneSchema } = require('../validators/meeting.validator');

const router = express.Router();

router.use(authenticate, requireRole(Roles.ADMIN));

/**
 * @openapi
 * /meetings:
 *   get:
 *     tags:
 *       - Meetings
 *     summary: List meetings (admin only)
 *     description: Meetings are shared by all admins. `status=open` (default) returns every open meeting, dated ones first by date and time, then undated ones. `status=done` returns the 100 most recently completed. `counts` always has both totals.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [open, done]
 *           default: open
 *     responses:
 *       200:
 *         description: Meetings fetched successfully.
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
 *                         meetings:
 *                           type: array
 *                           items:
 *                             $ref: '#/components/schemas/MeetingRecord'
 *                     counts:
 *                       type: object
 *                       properties:
 *                         open: { type: integer, example: 7 }
 *                         done: { type: integer, example: 12 }
 *       401:
 *         description: Authentication token missing, invalid, or expired.
 *       403:
 *         description: Caller is not an admin.
 */
router.get('/', meetingController.getMeetings);

/**
 * @openapi
 * /meetings:
 *   post:
 *     tags:
 *       - Meetings
 *     summary: Create a meeting (admin only)
 *     description: Only the title is required. Date, start time and end time are optional; a time needs a date and an end time needs a start time.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MeetingRequest'
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
 *       422:
 *         description: Validation error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/', validate(meetingSchema), meetingController.createMeeting);

/**
 * @openapi
 * /meetings/{meetingId}:
 *   put:
 *     tags:
 *       - Meetings
 *     summary: Update a meeting (admin only)
 *     description: Replaces the meeting's editable fields. Omitted optional fields are cleared.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: meetingId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MeetingRequest'
 *     responses:
 *       200:
 *         description: Meeting updated successfully.
 *       404:
 *         description: Meeting not found.
 *       422:
 *         description: Validation error.
 */
router.put('/:meetingId', validate(meetingSchema), meetingController.updateMeeting);

/**
 * @openapi
 * /meetings/{meetingId}/done:
 *   patch:
 *     tags:
 *       - Meetings
 *     summary: Mark a meeting done or reopen it (admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: meetingId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [done]
 *             properties:
 *               done: { type: boolean, example: true }
 *     responses:
 *       200:
 *         description: Meeting marked as done / reopened.
 *       404:
 *         description: Meeting not found.
 */
router.patch('/:meetingId/done', validate(meetingDoneSchema), meetingController.setMeetingDone);

/**
 * @openapi
 * /meetings/{meetingId}:
 *   delete:
 *     tags:
 *       - Meetings
 *     summary: Delete a meeting (soft delete, admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: meetingId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Meeting deleted successfully.
 *       404:
 *         description: Meeting not found.
 */
router.delete('/:meetingId', meetingController.deleteMeeting);

module.exports = router;
