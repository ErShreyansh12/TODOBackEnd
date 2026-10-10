const Joi = require('joi');

const createNoteSchema = Joi.object({
  // A note may be just a title or just a body; an empty title is saved as "Untitled note".
  title: Joi.string().trim().allow('').max(200).default(''),
  contentHtml: Joi.string().allow('').max(50000).default(''),
});

const updateNoteSchema = createNoteSchema;

module.exports = { createNoteSchema, updateNoteSchema };
