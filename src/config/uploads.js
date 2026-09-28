const fs = require('fs');
const path = require('path');

const UPLOAD_ROOT = path.join(__dirname, '../../uploads');
const TASK_UPLOAD_DIR = path.join(UPLOAD_ROOT, 'tasks');
const TASK_UPLOAD_URL_PREFIX = '/uploads/tasks';
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

// Files are served back by extension, so only non-executable document/image types are allowed.
const ALLOWED_ATTACHMENT_EXTENSIONS = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.png', '.jpg', '.jpeg'];

fs.mkdirSync(TASK_UPLOAD_DIR, { recursive: true });

module.exports = {
  UPLOAD_ROOT,
  TASK_UPLOAD_DIR,
  TASK_UPLOAD_URL_PREFIX,
  MAX_ATTACHMENT_BYTES,
  ALLOWED_ATTACHMENT_EXTENSIONS,
};
