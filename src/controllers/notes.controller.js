const notesService = require('../services/notes.service');
const { sendSuccess } = require('../utils/response');
const Roles = require('../constants/roles');
const NoteOwnerType = require('../constants/noteOwnerType');

function resolveOwnerType(role) {
  return role === Roles.ADMIN ? NoteOwnerType.ADMIN : NoteOwnerType.STAFF;
}

async function getNotes(req, res, next) {
  try {
    const ownerType = resolveOwnerType(req.user.role);
    const notes = await notesService.getNotesForOwner({ ownerType, ownerId: req.user.id });

    return sendSuccess(res, {
      statusCode: 200,
      message: 'Notes fetched successfully.',
      data: notes,
    });
  } catch (err) {
    return next(err);
  }
}

async function createNote(req, res, next) {
  try {
    const ownerType = resolveOwnerType(req.user.role);
    const { title, contentHtml } = req.body;
    const note = await notesService.createNote({
      ownerType,
      ownerId: req.user.id,
      title,
      contentHtml,
    });

    return sendSuccess(res, {
      statusCode: 201,
      message: 'Note created successfully.',
      data: { note },
    });
  } catch (err) {
    return next(err);
  }
}

async function togglePinNote(req, res, next) {
  try {
    const ownerType = resolveOwnerType(req.user.role);
    const { noteId } = req.params;
    const note = await notesService.togglePin({ ownerType, ownerId: req.user.id, noteId });

    return sendSuccess(res, {
      statusCode: 200,
      message: note.pinned ? 'Note pinned successfully.' : 'Note unpinned successfully.',
      data: { note },
    });
  } catch (err) {
    return next(err);
  }
}

async function deleteNote(req, res, next) {
  try {
    const ownerType = resolveOwnerType(req.user.role);
    const { noteId } = req.params;
    const note = await notesService.deleteNote({ ownerType, ownerId: req.user.id, noteId });

    return sendSuccess(res, {
      statusCode: 200,
      message: 'Note deleted successfully.',
      data: { note },
    });
  } catch (err) {
    return next(err);
  }
}

async function toggleArchiveNote(req, res, next) {
  try {
    const ownerType = resolveOwnerType(req.user.role);
    const { noteId } = req.params;
    const note = await notesService.toggleArchive({ ownerType, ownerId: req.user.id, noteId });

    return sendSuccess(res, {
      statusCode: 200,
      message: note.archived ? 'Note archived successfully.' : 'Note unarchived successfully.',
      data: { note },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { getNotes, createNote, togglePinNote, toggleArchiveNote, deleteNote };
