const mongoose = require('mongoose');
const NoteOwnerType = require('../constants/noteOwnerType');

const privateNoteSchema = new mongoose.Schema(
  {
    owner_type: {
      type: String,
      enum: Object.values(NoteOwnerType),
      required: true,
    },
    owner_id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    content_html: {
      type: String,
      required: true,
    },
    is_pinned: {
      type: Boolean,
      default: false,
    },
    is_archived: {
      type: Boolean,
      default: false,
    },
    deleted_at: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

privateNoteSchema.index({ owner_type: 1, owner_id: 1 });

module.exports = mongoose.model('PrivateNote', privateNoteSchema, 'private_notes');
