export const REMINDER_STATUSES = Object.freeze({
  UPCOMING: "upcoming",
  COMPLETED: "completed",
  MISSED: "missed",
  CANCELLED: "cancelled"
});

export const REMINDER_PRIORITIES = Object.freeze({
  LOW: "low",
  NORMAL: "normal",
  HIGH: "high",
  URGENT: "urgent"
});

export const REMINDER_CATEGORIES = Object.freeze({
  GENERAL: "general",
  STUDY: "study",
  WORK: "work",
  HEALTH: "health",
  TRAVEL: "travel",
  PERSONAL: "personal"
});

export const REMINDER_RECURRENCE_FREQUENCIES = Object.freeze({
  NONE: "none",
  DAILY: "daily",
  WEEKLY: "weekly",
  MONTHLY: "monthly"
});

export const REMINDER_NOTIFICATION_STATUSES = Object.freeze({
  QUEUED: "queued",
  PROCESSING: "processing",
  SENT: "sent",
  FAILED: "failed",
  SKIPPED: "skipped",
  CANCELLED: "cancelled"
});

export const DEVICE_TOKEN_STATUSES = Object.freeze({
  ACTIVE: "active",
  REVOKED: "revoked"
});

export const DEFAULT_REMINDER_BEFORE_MINUTES = 0;
export const MAX_REMINDER_BEFORE_MINUTES = 60 * 24 * 30;
export const DEFAULT_NOTIFICATION_DEEP_LINK = "/reminders";
