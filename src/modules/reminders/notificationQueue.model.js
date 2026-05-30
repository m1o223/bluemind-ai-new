import mongoose from "mongoose";

import { REMINDER_NOTIFICATION_STATUSES } from "./reminder.constants.js";

const notificationQueueSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  reminderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Reminder",
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ["reminder"],
    default: "reminder",
    index: true
  },
  status: {
    type: String,
    enum: Object.values(REMINDER_NOTIFICATION_STATUSES),
    default: REMINDER_NOTIFICATION_STATUSES.QUEUED,
    index: true
  },
  scheduledFor: {
    type: Date,
    required: true,
    index: true
  },
  attempts: {
    type: Number,
    min: 0,
    default: 0
  },
  maxAttempts: {
    type: Number,
    min: 1,
    default: 3
  },
  lockedAt: {
    type: Date
  },
  sentAt: {
    type: Date
  },
  error: {
    type: String,
    trim: true,
    maxlength: 2000,
    default: ""
  },
  payload: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  result: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true,
  versionKey: false
});

notificationQueueSchema.index({ status: 1, scheduledFor: 1, attempts: 1 });
notificationQueueSchema.index({ reminderId: 1, status: 1 });

export const NotificationQueue = mongoose.model("NotificationQueue", notificationQueueSchema);
