const sanitizeHtml = require('sanitize-html');

// Task descriptions are HTML from the rich text editor (TipTap). Only the formatting the editor produces
// is kept: text styles, lists, and checklists (<ul data-type="taskList"><li data-type="taskItem" data-checked>).
const DESCRIPTION_OPTIONS = {
  allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li', 'label', 'input', 'span', 'div', 'h2', 'h3', 'blockquote', 'code'],
  allowedAttributes: {
    ul: ['data-type'],
    li: ['data-type', 'data-checked'],
    input: ['type', 'checked'],
  },
  allowedSchemes: [],
};

const TASK_ITEM_TAG = /<li\b[^>]*>/g;
const CHECKED_ATTR = /\s*data-checked="[^"]*"/;

// Returns null for an empty editor ("<p></p>") so "no description" stays null in the database.
function sanitizeDescription(html) {
  if (!html) return null;
  const clean = sanitizeHtml(html, DESCRIPTION_OPTIONS).trim();
  const hasText = sanitizeHtml(clean, { allowedTags: [], allowedAttributes: {} }).trim() !== '';
  return hasText || clean.includes('data-type="taskItem"') ? clean : null;
}

// The series keeps the description as a template: every new occurrence starts with its checklist unticked.
function uncheckAll(html) {
  return html ? html.replace(/data-checked="true"/g, 'data-checked="false"') : html;
}

function countChecklistItems(html) {
  return (html?.match(TASK_ITEM_TAG) || []).filter((tag) => tag.includes('data-type="taskItem"')).length;
}

// Ticks or unticks the checklist item at `index` (document order). Returns null when there is no such item.
function setChecklistItem(html, index, checked) {
  let seen = -1;
  let found = false;
  const updated = (html || '').replace(TASK_ITEM_TAG, (tag) => {
    if (!tag.includes('data-type="taskItem"')) return tag;
    seen += 1;
    if (seen !== index) return tag;
    found = true;
    return tag.replace(CHECKED_ATTR, '').replace(/>$/, ` data-checked="${checked}">`);
  });
  return found ? updated : null;
}

module.exports = { sanitizeDescription, uncheckAll, countChecklistItems, setChecklistItem };
