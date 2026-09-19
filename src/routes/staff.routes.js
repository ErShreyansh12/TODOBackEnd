const express = require('express');
const staffController = require('../controllers/staff.controller');
const authenticate = require('../middlewares/auth.middleware');
const requireRole = require('../middlewares/role.middleware');
const validate = require('../middlewares/validate.middleware');
const Roles = require('../constants/roles');
const { createStaffSchema, updateStaffStatusSchema } = require('../validators/staff.validator');

const router = express.Router();

/**
 * @openapi
 * /staff:
 *   post:
 *     tags:
 *       - Staff
 *     summary: Add a staff member
 *     description: Creates a new staff member with a system-generated Staff ID and a default password ("123456"). Admin only.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - firstName
 *               - lastName
 *             properties:
 *               firstName:
 *                 type: string
 *                 example: Priya
 *               lastName:
 *                 type: string
 *                 example: Nair
 *               email:
 *                 type: string
 *                 format: email
 *                 example: priya.nair@example.com
 *               phone:
 *                 type: string
 *                 example: "+1 415 555 0136"
 *     responses:
 *       201:
 *         description: Staff member added successfully.
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
 *                         staff:
 *                           $ref: '#/components/schemas/StaffRecord'
 *       401:
 *         description: Authentication token missing, invalid, or expired.
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
 *       409:
 *         description: A staff member with this email already exists.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       422:
 *         description: Validation error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
  '/',
  authenticate,
  requireRole(Roles.ADMIN),
  validate(createStaffSchema),
  staffController.createStaff
);

/**
 * @openapi
 * /staff:
 *   get:
 *     tags:
 *       - Staff
 *     summary: Get a paginated list of staff members
 *     description: Returns staff members ordered by most recently added first. Admin only.
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
 *     responses:
 *       200:
 *         description: Staff list fetched successfully.
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
 *                         $ref: '#/components/schemas/StaffRecord'
 *                     pagination:
 *                       $ref: '#/components/schemas/PaginationMeta'
 *       401:
 *         description: Authentication token missing, invalid, or expired.
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

/**
 * @openapi
 * /staff/{staffId}:
 *   get:
 *     tags:
 *       - Staff
 *     summary: Get a single staff member's details
 *     description: Fetches full details of one staff member by their Staff ID (e.g. EMP-001). Admin only.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: staffId
 *         required: true
 *         schema:
 *           type: string
 *         example: EMP-001
 *     responses:
 *       200:
 *         description: Staff member fetched successfully.
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
 *                         staff:
 *                           $ref: '#/components/schemas/StaffRecord'
 *       401:
 *         description: Authentication token missing, invalid, or expired.
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
 *         description: Staff member not found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/:staffId?', authenticate, requireRole(Roles.ADMIN), staffController.getStaff);

/**
 * @openapi
 * /staff/{staffId}:
 *   put:
 *     tags:
 *       - Staff
 *     summary: Update a staff member's editable details
 *     description: Updates firstName, lastName, email, and phone only. No other field (status, staffId, password, etc.) can be changed through this endpoint. Admin only.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: staffId
 *         required: true
 *         schema:
 *           type: string
 *         example: EMP-001
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - firstName
 *               - lastName
 *             properties:
 *               firstName:
 *                 type: string
 *                 example: Priya
 *               lastName:
 *                 type: string
 *                 example: Nair
 *               email:
 *                 type: string
 *                 format: email
 *                 example: priya.nair@example.com
 *               phone:
 *                 type: string
 *                 example: "+1 415 555 0136"
 *     responses:
 *       200:
 *         description: Staff member updated successfully.
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
 *                         staff:
 *                           $ref: '#/components/schemas/StaffRecord'
 *       401:
 *         description: Authentication token missing, invalid, or expired.
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
 *         description: Staff member not found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: A staff member with this email already exists.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       422:
 *         description: Validation error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.put(
  '/:staffId',
  authenticate,
  requireRole(Roles.ADMIN),
  validate(createStaffSchema),
  staffController.updateStaff
);

/**
 * @openapi
 * /staff/{staffId}:
 *   delete:
 *     tags:
 *       - Staff
 *     summary: Delete a staff member (soft delete)
 *     description: Marks a staff member as deleted (sets deletedAt). The record is not removed from the database, and will no longer appear in the staff list or detail endpoints. Admin only.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: staffId
 *         required: true
 *         schema:
 *           type: string
 *         example: EMP-001
 *     responses:
 *       200:
 *         description: Staff member deleted successfully.
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
 *                         staff:
 *                           $ref: '#/components/schemas/StaffRecord'
 *       401:
 *         description: Authentication token missing, invalid, or expired.
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
 *         description: Staff member not found (already deleted or never existed).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.delete('/:staffId', authenticate, requireRole(Roles.ADMIN), staffController.deleteStaff);

/**
 * @openapi
 * /staff/{staffId}/status:
 *   patch:
 *     tags:
 *       - Staff
 *     summary: Activate or deactivate a staff member
 *     description: Sets the staff member's status to "active" or "inactive". A deactivated staff member will not be able to log in. Admin only.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: staffId
 *         required: true
 *         schema:
 *           type: string
 *         example: EMP-001
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
 *         description: Staff status updated successfully.
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
 *                         staff:
 *                           $ref: '#/components/schemas/StaffRecord'
 *       401:
 *         description: Authentication token missing, invalid, or expired.
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
 *         description: Staff member not found.
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
  '/:staffId/status',
  authenticate,
  requireRole(Roles.ADMIN),
  validate(updateStaffStatusSchema),
  staffController.updateStaffStatus
);

module.exports = router;
