import mongoose from "mongoose";

const authSessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  refreshTokenHash: {
    type: String,
    required: true
  },
  refreshTokenId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  userAgent: {
    type: String,
    trim: true,
    maxlength: 500,
    default: ""
  },
  ipAddress: {
    type: String,
    trim: true,
    maxlength: 80,
    default: ""
  },
  expiresAt: {
    type: Date,
    required: true
  },
  lastUsedAt: {
    type: Date,
    default: Date.now
  },
  revokedAt: {
    type: Date,
    index: true
  },
  revokeReason: {
    type: String,
    trim: true,
    maxlength: 160,
    default: ""
  }
}, {
  timestamps: true,
  versionKey: false
});

authSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
authSessionSchema.index({ userId: 1, revokedAt: 1, expiresAt: 1 });

export const AuthSession = mongoose.model("AuthSession", authSessionSchema);
