import mongoose from "mongoose";

export const SMART_NOTIFICATION_TYPES = Object.freeze({
  REMINDER: "reminder",
  LEARNING: "learning",
  SCHEDULE: "schedule",
  AI_PLANS: "ai_plans",
  WRITING: "writing",
  CHAT: "chat",
  STUDIO: "studio"
});

export const SMART_NOTIFICATION_STATUSES = Object.freeze({
  QUEUED: "queued",
  PROCESSING: "processing",
  SENT: "sent",
  FAILED: "failed",
  SKIPPED: "skipped",
  CANCELLED: "cancelled"
});

const smartNotificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: Object.values(SMART_NOTIFICATION_TYPES),
    required: true,
    index: true
  },
  sourceId: {
    type: String,
    trim: true,
    default: "",
    index: true
  },
  dedupeKey: {
    type: String,
    trim: true,
    default: "",
    index: true
  },
  title: {
    type: String,
    trim: true,
    required: true,
    maxlength: 140
  },
  body: {
    type: String,
    trim: true,
    required: true,
    maxlength: 600
  },
  deepLink: {
    type: String,
    trim: true,
    default: "/"
  },
  icon: {
    type: String,
    trim: true,
    default: "/bluemind-logo-black.png"
  },
  badge: {
    type: String,
    trim: true,
    default: "/bluemind-logo-black.png"
  },
  scheduledFor: {
    type: Date,
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: Object.values(SMART_NOTIFICATION_STATUSES),
    default: SMART_NOTIFICATION_STATUSES.QUEUED,
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
  lockedAt: Date,
  sentAt: Date,
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

smartNotificationSchema.index({ status: 1, scheduledFor: 1, attempts: 1 });
smartNotificationSchema.index({ userId: 1, type: 1, createdAt: -1 });
smartNotificationSchema.index(
  { userId: 1, dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: "string", $gt: "" } } }
);

export const SmartNotification = mongoose.model("SmartNotification", smartNotificationSchema);
