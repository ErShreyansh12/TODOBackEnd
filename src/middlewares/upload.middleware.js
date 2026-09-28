const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const AppError = require('../utils/AppError');
const ErrorCodes = require('../constants/errorCodes');
const {
  TASK_UPLOAD_DIR,
  MAX_ATTACHMENT_BYTES,
  ALLOWED_ATTACHMENT_EXTENSIONS,
} = require('../config/uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, TASK_UPLOAD_DIR),
  // The client's file name is never used on disk, so it can't overwrite files or traverse paths.
  filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
});

function fileFilter(req, file, cb) {
  const extension = path.extname(file.originalname).toLowerCase();

  if (!ALLOWED_ATTACHMENT_EXTENSIONS.includes(extension)) {
    return cb(
      new AppError(
        `Attachment type not allowed. Allowed types: ${ALLOWED_ATTACHMENT_EXTENSIONS.join(', ')}.`,
        422,
        ErrorCodes.VALIDATION_ERROR
      )
    );
  }

  return cb(null, true);
}

const uploader = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 },
});

const MULTER_MESSAGES = {
  LIMIT_FILE_SIZE: `Attachment must be ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB or smaller.`,
  LIMIT_UNEXPECTED_FILE: 'Send a single file in the "attachment" field.',
  LIMIT_FILE_COUNT: 'Only one attachment is allowed.',
};

function uploadTaskAttachment(req, res, next) {
  uploader.single('attachment')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      const message = MULTER_MESSAGES[err.code] || err.message;
      return next(new AppError(message, 422, ErrorCodes.VALIDATION_ERROR));
    }

    if (err) {
      return next(err);
    }

    // If anything later in the request fails (validation, database), don't leave the file behind.
    if (req.file) {
      res.on('finish', () => {
        if (res.statusCode >= 400) {
          fs.unlink(req.file.path, () => {});
        }
      });
    }

    return next();
  });
}

module.exports = { uploadTaskAttachment };
