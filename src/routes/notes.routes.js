const express = require('express');
const notesController = require('../controllers/notes.controller');
const authenticate = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const { createNoteSchema } = require('../validators/notes.validator');

const router = express.Router();

/**
 * @openapi
 * /notes:
 *   get:
 *     tags:
 *       - Notes
 *     summary: Get the logged-in user's private notes, grouped by tab
 *     description: Returns the caller's own private notes split into All/Pinned/Recent/Archive groups (matching the frontend's four tabs), plus a count for each. Available to any authenticated user (admin or staff) for their own notes only — never another user's.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Notes fetched successfully.
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
 *                         all:
 *                           type: array
 *                           items:
 *                             $ref: '#/components/schemas/NoteRecord'
 *                         pinned:
 *                           type: array
 *                           items:
 *                             $ref: '#/components/schemas/NoteRecord'
 *                         recent:
 *                           type: array
 *                           items:
 *                             $ref: '#/components/schemas/NoteRecord'
 *                         archive:
 *                           type: array
 *                           items:
 *                             $ref: '#/components/schemas/NoteRecord'
 *                         counts:
 *                           type: object
 *                           properties:
 *                             all: { type: integer, example: 4 }
 *                             pinned: { type: integer, example: 2 }
 *                             recent: { type: integer, example: 4 }
 *                             archive: { type: integer, example: 1 }
 *       401:
 *         description: Authentication token missing, invalid, or expired.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/', authenticate, notesController.getNotes);

/**
 * @openapi
 * /notes:
 *   post:
 *     tags:
 *       - Notes
 *     summary: Create a private note
 *     description: Creates a note owned by the logged-in user. owner_type and owner_id are derived from the JWT (admin or staff, whoever is logged in) — never taken from the request body. New notes start unpinned and unarchived.
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
 *               - contentHtml
 *             properties:
 *               title:
 *                 type: string
 *                 example: Client Onboarding Checklist
 *               contentHtml:
 *                 type: string
 *                 example: <p>Verify credentials before handoff.</p>
 *     responses:
 *       201:
 *         description: Note created successfully.
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
 *                         note:
 *                           $ref: '#/components/schemas/NoteRecord'
 *       401:
 *         description: Authentication token missing, invalid, or expired.
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
router.post('/', authenticate, validate(createNoteSchema), notesController.createNote);

/**
 * @openapi
 * /notes/{noteId}/pin:
 *   patch:
 *     tags:
 *       - Notes
 *     summary: Toggle pin on a note
 *     description: Flips the note's pinned state (pinned -> unpinned, unpinned -> pinned). Only works on a note owned by the logged-in user; any other note (or a non-existent one) returns 404.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: noteId
 *         required: true
 *         schema:
 *           type: string
 *         example: 6aae592ef6ad1b56a7c95264
 *     responses:
 *       200:
 *         description: Note pinned/unpinned successfully.
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
 *                         note:
 *                           $ref: '#/components/schemas/NoteRecord'
 *       401:
 *         description: Authentication token missing, invalid, or expired.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Note not found (doesn't exist, belongs to another user, or is deleted).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.patch('/:noteId/pin', authenticate, notesController.togglePinNote);

/**
 * @openapi
 * /notes/{noteId}/archive:
 *   patch:
 *     tags:
 *       - Notes
 *     summary: Toggle archive on a note
 *     description: Flips the note's archived state (archived -> unarchived, unarchived -> archived). An archived note drops out of the All/Pinned/Recent groups and appears only in Archive. Only works on a note owned by the logged-in user; any other note (or a non-existent one) returns 404.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: noteId
 *         required: true
 *         schema:
 *           type: string
 *         example: 6aae592ef6ad1b56a7c95264
 *     responses:
 *       200:
 *         description: Note archived/unarchived successfully.
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
 *                         note:
 *                           $ref: '#/components/schemas/NoteRecord'
 *       401:
 *         description: Authentication token missing, invalid, or expired.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Note not found (doesn't exist, belongs to another user, or is deleted).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.patch('/:noteId/archive', authenticate, notesController.toggleArchiveNote);

/**
 * @openapi
 * /notes/{noteId}:
 *   delete:
 *     tags:
 *       - Notes
 *     summary: Delete a note (soft delete)
 *     description: Marks the note as deleted (sets deletedAt). The record is not removed from the database, and will no longer appear in the notes list. Only works on a note owned by the logged-in user; any other note (or a non-existent/already-deleted one) returns 404.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: noteId
 *         required: true
 *         schema:
 *           type: string
 *         example: 6aae592ef6ad1b56a7c95264
 *     responses:
 *       200:
 *         description: Note deleted successfully.
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
 *                         note:
 *                           $ref: '#/components/schemas/NoteRecord'
 *       401:
 *         description: Authentication token missing, invalid, or expired.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Note not found (doesn't exist, belongs to another user, or already deleted).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.delete('/:noteId', authenticate, notesController.deleteNote);

module.exports = router;
