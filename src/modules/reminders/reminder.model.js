import mongoose from "mongoose";

import {
  DEFAULT_REMINDER_BEFORE_MINUTES,
  REMINDER_CATEGORIES,
  REMINDER_PRIORITIES,
  REMINDER_STATUSES
} from "./reminder.constants.js";

const reminderSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 160
  },
  description: {
    type: String,
    trim: true,
    maxlength: 2000,
    default: ""
  },
  reminderDate: {
    type: String,
    required: true,
    trim: true
  },
  reminderTime: {
    type: String,
    required: true,
    trim: true
  },
  timezone: {
    type: String,
    required: true,
    trim: true,
    default: "UTC"
  },
  reminderBefore: {
    type: Number,
    min: 0,
    default: DEFAULT_REMINDER_BEFORE_MINUTES
  },
  dueAt: {
    type: Date,
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: Object.values(REMINDER_STATUSES),
    default: REMINDER_STATUSES.UPCOMING,
    index: true
  },
  notificationSent: {
    type: Boolean,
    default: false,
    index: true
  },
  notificationSentAt: {
    type: Date
  },
  lastNotificationAttempt: {
    type: Date
  },
  notificationAttempts: {
    type: Number,
    min: 0,
    default: 0
  },
  notificationError: {
    type: String,
    trim: true,
    maxlength: 2000,
    default: ""
  },
  aiGenerated: {
    type: Boolean,
    default: false,
    index: true
  },
  aiSuggested: {
    type: Boolean,
    default: false
  },
  aiContext: {
    type: String,
    trim: true,
    maxlength: 4000,
    default: ""
  },
  aiReason: {
    type: String,
    trim: true,
    maxlength: 1000,
    default: ""
  },
  linkedConversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Conversation",
    index: true
  },
  linkedMemoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "UserMemory",
    index: true
  },
  scheduledJobId: {
    type: String,
    trim: true,
    index: true
  },
  nextTriggerAt: {
    type: Date,
    index: true
  },
  tags: {
    type: [String],
    default: []
  },
  category: {
    type: String,
    enum: Object.values(REMINDER_CATEGORIES),
    default: REMINDER_CATEGORIES.GENERAL,
    index: true
  },
  priority: {
    type: String,
    enum: Object.values(REMINDER_PRIORITIES),
    default: REMINDER_PRIORITIES.NORMAL,
    index: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true,
  versionKey: false
});

reminderSchema.index({
  userId: 1,
  status: 1,
  nextTriggerAt: 1,
  notificationSent: 1
});
reminderSchema.index({ userId: 1, dueAt: 1 });

export const Reminder = mongoose.model("Reminder", reminderSchema);
