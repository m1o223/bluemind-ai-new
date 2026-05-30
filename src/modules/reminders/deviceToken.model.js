import mongoose from "mongoose";

import { DEVICE_TOKEN_STATUSES } from "./reminder.constants.js";

const deviceTokenSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  token: {
    type: String,
    required: true,
    trim: true
  },
  platform: {
    type: String,
    enum: ["web", "android", "ios", "unknown"],
    default: "web",
    index: true
  },
  browser: {
    type: String,
    trim: true,
    maxlength: 80,
    default: ""
  },
  deviceId: {
    type: String,
    trim: true,
    maxlength: 160,
    default: ""
  },
  status: {
    type: String,
    enum: Object.values(DEVICE_TOKEN_STATUSES),
    default: DEVICE_TOKEN_STATUSES.ACTIVE,
    index: true
  },
  lastSeenAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  lastError: {
    type: String,
    trim: true,
    maxlength: 1000,
    default: ""
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true,
  versionKey: false
});

deviceTokenSchema.index({ userId: 1, token: 1 }, { unique: true });

export const DeviceToken = mongoose.model("DeviceToken", deviceTokenSchema);
