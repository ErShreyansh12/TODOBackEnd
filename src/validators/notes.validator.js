const Joi = require('joi');

const createNoteSchema = Joi.object({
  title: Joi.string().trim().min(1).max(200).required(),
  contentHtml: Joi.string().min(1).max(50000).required(),
});

module.exports = { createNoteSchema };
