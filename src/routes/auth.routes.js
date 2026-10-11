const express = require('express');
const authController = require('../controllers/auth.controller');
const authenticate = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const { loginSchema, staffLoginSchema, changePasswordSchema } = require('../validators/auth.validator');

const router = express.Router();

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Admin login
 *     description: Authenticates an admin using email and password and returns a JWT valid for 24 hours.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: admin@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: Test@1234
 *     responses:
 *       200:
 *         description: Login successful.
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
 *                         admin:
 *                           type: object
 *                           properties:
 *                             id: { type: string, example: 6aa4036fac73e628c27d3554 }
 *                             name: { type: string, example: admin }
 *                             email: { type: string, example: admin@gmail.com }
 *                             createdAt: { type: string, format: date-time }
 *                             updatedAt: { type: string, format: date-time }
 *                         token:
 *                           type: string
 *                           example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *       401:
 *         description: Invalid email or password.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Account has been deactivated.
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
router.post('/login', validate(loginSchema), authController.login);

/**
 * @openapi
 * /auth/staff-login:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Staff login
 *     description: Authenticates a staff member using Staff ID and password and returns a JWT valid for 24 hours. Only active, non-deleted staff with the correct password can log in.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - staffId
 *               - password
 *             properties:
 *               staffId:
 *                 type: string
 *                 example: EMP-001
 *               password:
 *                 type: string
 *                 format: password
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: Login successful.
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
 *                         token:
 *                           type: string
 *                           example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *       401:
 *         description: Invalid staff ID or password (also returned for deleted staff).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Correct credentials, but the staff account is inactive.
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
router.post('/staff-login', validate(staffLoginSchema), authController.staffLogin);

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Logout (admin or staff)
 *     description: Invalidates the token sent in the Authorization header. That token is rejected from now on (even though it hasn't reached its 24-hour expiry), so the user must log in again. Works for both admin and staff tokens. No request body needed.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         description: Token missing, invalid, expired, or already logged out.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/logout', authenticate, authController.logout);

/**
 * @openapi
 * /auth/change-password:
 *   patch:
 *     tags:
 *       - Auth
 *     summary: Change my password (staff or admin)
 *     description: |
 *       Changes the password of the signed-in user - whoever the token belongs to. There is no user id in
 *       the request, so nobody can change another account's password with this.
 *
 *       The current password must be supplied and correct. The new password must be at least 6 characters
 *       and different from the current one. `confirmPassword` is optional; if sent it must equal
 *       `newPassword`.
 *
 *       A wrong current password returns 422 (not 401), so a typo doesn't look like an expired session.
 *
 *       Changing the password signs the account out everywhere else: every other token issued before the
 *       change (other devices, other browsers) is rejected with 401 "Your password was changed. Please login
 *       again." The token that made this request is also older than the change, so the response returns a
 *       fresh `token` - the client must replace its stored token with it to stay signed in. A token
 *       issued in the same second as the change is not affected.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 example: "123456"
 *               newPassword:
 *                 type: string
 *                 minLength: 6
 *                 maxLength: 128
 *                 example: "Better#2026"
 *               confirmPassword:
 *                 type: string
 *                 example: "Better#2026"
 *     responses:
 *       200:
 *         description: Password changed successfully. data.token is the new token to use from now on.
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
 *                         token:
 *                           type: string
 *                           description: Fresh JWT (valid 24 hours) replacing the one used for this request.
 *       401:
 *         description: Token missing, invalid, expired, logged out or issued before the last password change - or the account no longer exists.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: The staff account is inactive.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: The password was changed by another request at the same moment. Try again.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       422:
 *         description: Validation error - missing field, new password too short or the same as the current one, confirmPassword not matching, or the current password is wrong.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.patch('/change-password', authenticate, validate(changePasswordSchema), authController.changePassword);

module.exports = router;
