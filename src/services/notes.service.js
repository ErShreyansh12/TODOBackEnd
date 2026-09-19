const mongoose = require('mongoose');
const PrivateNote = require('../models/PrivateNote');
const ErrorCodes = require('../constants/errorCodes');
const AppError = require('../utils/AppError');

const RECENT_NOTES_LIMIT = 5;

function formatNoteResponse(note) {
  return {
    id: note._id,
    title: note.title,
    contentHtml: note.content_html,
    pinned: note.is_pinned,
    archived: note.is_archived,
    createdAt: note.created_at,
    updatedAt: note.updated_at,
    deletedAt: note.deleted_at || null,
  };
}

async function getNotesForOwner({ ownerType, ownerId }) {
  const notes = await PrivateNote.find({
    owner_type: ownerType,
    owner_id: ownerId,
    deleted_at: null,
  }).sort({ updated_at: -1 });

  const formatted = notes.map(formatNoteResponse);

  const all = formatted.filter((note) => !note.archived);
  const pinned = all.filter((note) => note.pinned);
  const recent = all.slice(0, RECENT_NOTES_LIMIT);
  const archive = formatted.filter((note) => note.archived);

  return {
    all,
    pinned,
    recent,
    archive,
    counts: {
      all: all.length,
      pinned: pinned.length,
      recent: recent.length,
      archive: archive.length,
    },
  };
}

async function createNote({ ownerType, ownerId, title, contentHtml }) {
  const note = await PrivateNote.create({
    owner_type: ownerType,
    owner_id: ownerId,
    title,
    content_html: contentHtml,
    is_pinned: false,
    is_archived: false,
  });

  return formatNoteResponse(note);
}

async function findOwnedNote({ ownerType, ownerId, noteId }) {
  if (!mongoose.Types.ObjectId.isValid(noteId)) {
    throw new AppError('Note not found.', 404, ErrorCodes.NOT_FOUND);
  }

  const note = await PrivateNote.findOne({
    _id: noteId,
    owner_type: ownerType,
    owner_id: ownerId,
    deleted_at: null,
  });

  if (!note) {
    throw new AppError('Note not found.', 404, ErrorCodes.NOT_FOUND);
  }

  return note;
}

async function togglePin({ ownerType, ownerId, noteId }) {
  const note = await findOwnedNote({ ownerType, ownerId, noteId });

  note.is_pinned = !note.is_pinned;
  await note.save();

  return formatNoteResponse(note);
}

async function toggleArchive({ ownerType, ownerId, noteId }) {
  const note = await findOwnedNote({ ownerType, ownerId, noteId });

  note.is_archived = !note.is_archived;
  await note.save();

  return formatNoteResponse(note);
}

async function deleteNote({ ownerType, ownerId, noteId }) {
  const note = await findOwnedNote({ ownerType, ownerId, noteId });

  note.deleted_at = new Date();
  await note.save();

  return formatNoteResponse(note);
}

module.exports = { getNotesForOwner, createNote, togglePin, toggleArchive, deleteNote };
