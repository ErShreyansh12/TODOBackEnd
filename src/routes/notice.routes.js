const express = require('express');
const noticeController = require('../controllers/notice.controller');
const authenticate = require('../middlewares/auth.middleware');
const requireRole = require('../middlewares/role.middleware');
const validate = require('../middlewares/validate.middleware');
const Roles = require('../constants/roles');
const { createNoticeSchema, updateNoticeStatusSchema } = require('../validators/notice.validator');

const router = express.Router();

/**
 * @openapi
 * /notices:
 *   post:
 *     tags:
 *       - Notices
 *     summary: Create a broadcast/notice (admin only)
 *     description: |
 *       Creates a notice and sends it to the selected staff members. The notice starts active immediately,
 *       so recipients see it on their dashboard as soon as this call succeeds.
 *
 *       recipientIds must be existing, non-deleted staff - an inactive staff member can still be a recipient
 *       (the notice just waits for them), but a deleted or unknown id rejects the whole request.
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
 *               - recipientIds
 *             properties:
 *               title:
 *                 type: string
 *                 example: Office Closed — Holiday Notice
 *               message:
 *                 type: string
 *                 example: The office will be closed on Monday for the public holiday.
 *               recipientIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["6aacfe84e65064d382b76182", "6aacff38e65064d382b76186"]
 *     responses:
 *       201:
 *         description: Notice created successfully.
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
 *                         notice:
 *                           $ref: '#/components/schemas/NoticeRecord'
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
 *         description: Validation error (missing title/recipients, or an unknown/deleted recipient id).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/', authenticate, requireRole(Roles.ADMIN), validate(createNoticeSchema), noticeController.createNotice);

/**
 * @openapi
 * /notices:
 *   get:
 *     tags:
 *       - Notices
 *     summary: Get the notice list
 *     description: |
 *       Admin sees every non-deleted notice (active and inactive), optionally filtered by status.
 *       A staff caller only ever sees notices that are active AND were actually sent to them - the
 *       status query param is ignored for a staff token, not just defaulted, so it can't be used to
 *       see inactive notices or notices sent to other staff.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Case-insensitive partial match on the notice title.
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive]
 *         description: Admin only. Omit to see both.
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
 *         description: Notices fetched successfully.
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
 *                         $ref: '#/components/schemas/NoticeRecord'
 *                     pagination:
 *                       $ref: '#/components/schemas/PaginationMeta'
 *       401:
 *         description: Authentication token missing, invalid, expired, or logged out.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       422:
 *         description: Invalid status value.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/', authenticate, requireRole(Roles.ADMIN, Roles.STAFF), noticeController.getNotices);

/**
 * @openapi
 * /notices/{noticeId}:
 *   put:
 *     tags:
 *       - Notices
 *     summary: Edit a notice (admin only)
 *     description: |
 *       Updates title, message and recipients. Status is not changed here (active/inactive is a separate
 *       action). Send the full desired recipient list, not just the changes.
 *
 *       Recipients are synced against the current list: newly added staff must exist and not be deleted;
 *       staff left off the list stop seeing the notice (their recipient record is removed, since that table
 *       has no soft-delete field); staff already on the notice are kept without re-checking, so re-sending
 *       an unchanged list never fails because someone on it was deleted since.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: noticeId
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
 *               - recipientIds
 *             properties:
 *               title:
 *                 type: string
 *                 example: Office Closed — Updated Date
 *               message:
 *                 type: string
 *                 example: The closure has moved to Tuesday.
 *               recipientIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["6aacfe84e65064d382b76182"]
 *     responses:
 *       200:
 *         description: Notice updated successfully.
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
 *                         notice:
 *                           $ref: '#/components/schemas/NoticeRecord'
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
 *         description: Notice not found or deleted.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       422:
 *         description: Validation error (missing title/recipients, or a newly added recipient that is unknown or deleted).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.put('/:noticeId', authenticate, requireRole(Roles.ADMIN), validate(createNoticeSchema), noticeController.updateNotice);

/**
 * @openapi
 * /notices/{noticeId}/status:
 *   patch:
 *     tags:
 *       - Notices
 *     summary: Activate or deactivate a notice (admin only)
 *     description: |
 *       Sets the notice status to "active" or "inactive" - one endpoint for both directions. New notices are
 *       always created active. A deactivated notice is hidden from staff (it no longer appears in their
 *       notice list or dashboard) but stays visible to admin, who can re-activate it at any time.
 *       Setting the status it already has is a harmless no-op.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: noticeId
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
 *                 enum: [active, inactive]
 *                 example: inactive
 *     responses:
 *       200:
 *         description: Notice status updated successfully.
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
 *                         notice:
 *                           $ref: '#/components/schemas/NoticeRecord'
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
 *         description: Notice not found or deleted.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       422:
 *         description: Validation error (status missing or not one of active/inactive).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.patch(
  '/:noticeId/status',
  authenticate,
  requireRole(Roles.ADMIN),
  validate(updateNoticeStatusSchema),
  noticeController.updateNoticeStatus
);

/**
 * @openapi
 * /notices/{noticeId}:
 *   delete:
 *     tags:
 *       - Notices
 *     summary: Delete a notice (admin only, soft delete)
 *     description: |
 *       Marks the notice as deleted (sets deletedAt). Nothing is removed from the database. A deleted notice
 *       disappears from the admin list and from every recipient's list straight away, whether it was
 *       active or inactive.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: noticeId
 *         required: true
 *         schema:
 *           type: string
 *         example: 6aae1234ab56cd78ef901234
 *     responses:
 *       200:
 *         description: Notice deleted successfully.
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
 *                         notice:
 *                           $ref: '#/components/schemas/NoticeRecord'
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
 *         description: Notice not found or already deleted.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.delete('/:noticeId', authenticate, requireRole(Roles.ADMIN), noticeController.deleteNotice);

module.exports = router;
