const mongoose = require('mongoose');

const revokedTokenSchema = new mongoose.Schema(
  {
    token_hash: {
      type: String,
      required: true,
      unique: true,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    role: {
      type: String,
      required: true,
    },
    // MongoDB deletes the row automatically once the token would have expired anyway.
    expires_at: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 },
    },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } }
);

module.exports = mongoose.model('RevokedToken', revokedTokenSchema, 'revoked_tokens');
