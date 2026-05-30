import { env } from "../../config/env.js";
import {
  DEVICE_TOKEN_STATUSES,
  REMINDER_NOTIFICATION_STATUSES,
  REMINDER_STATUSES
} from "./reminder.constants.js";
import { DeviceToken } from "./deviceToken.model.js";
import { NotificationQueue } from "./notificationQueue.model.js";
import { Reminder } from "./reminder.model.js";

export function createReminder(data) {
  return Reminder.create(data);
}

export function saveReminder(reminder) {
  return reminder.save();
}

export function findReminderById(reminderId, userId) {
  return Reminder.findOne({ _id: reminderId, userId });
}

export function findReminderByIdAnyUser(reminderId) {
  return Reminder.findById(reminderId);
}

export function listRemindersByUser(userId, {
  status,
  category,
  priority,
  from,
  to,
  limit = 50
} = {}) {
  const query = { userId };

  if (status) query.status = status;
  if (category) query.category = category;
  if (priority) query.priority = priority;
  if (from || to) {
    query.dueAt = {};
    if (from) query.dueAt.$gte = new Date(from);
    if (to) query.dueAt.$lte = new Date(to);
  }

  return Reminder.find(query)
    .sort({ dueAt: 1, createdAt: -1 })
    .limit(limit);
}

export function listUpcomingRemindersForContext(userId, limit = 5) {
  return Reminder.find({
    userId,
    status: REMINDER_STATUSES.UPCOMING,
    dueAt: { $gte: new Date() }
  })
    .sort({ dueAt: 1 })
    .limit(limit);
}

export function findDueRemindersForNotification(now = new Date(), limit = env.REMINDER_BATCH_SIZE) {
  return Reminder.find({
    status: REMINDER_STATUSES.UPCOMING,
    notificationSent: false,
    nextTriggerAt: { $lte: now }
  })
    .sort({ nextTriggerAt: 1 })
    .limit(limit);
}

export function markMissedReminders(cutoffDate) {
  return Reminder.updateMany(
    {
      status: REMINDER_STATUSES.UPCOMING,
      dueAt: { $lt: cutoffDate }
    },
    {
      $set: {
        status: REMINDER_STATUSES.MISSED
      }
    }
  );
}

export function upsertDeviceToken(userId, input) {
  return DeviceToken.findOneAndUpdate(
    {
      userId,
      token: input.token
    },
    {
      $set: {
        platform: input.platform || "web",
        browser: input.browser || "",
        deviceId: input.deviceId || "",
        status: DEVICE_TOKEN_STATUSES.ACTIVE,
        lastSeenAt: new Date(),
        lastError: "",
        metadata: input.metadata || {}
      },
      $setOnInsert: {
        userId,
        token: input.token
      }
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true
    }
  );
}

export function listActiveDeviceTokens(userId) {
  return DeviceToken.find({
    userId,
    status: DEVICE_TOKEN_STATUSES.ACTIVE
  }).sort({ lastSeenAt: -1 });
}

export function revokeDeviceToken(userId, token, reason = "") {
  return DeviceToken.findOneAndUpdate(
    { userId, token },
    {
      $set: {
        status: DEVICE_TOKEN_STATUSES.REVOKED,
        lastError: reason
      }
    },
    { new: true }
  );
}

export function createNotificationQueueItem(data) {
  return NotificationQueue.create(data);
}

export function findActiveNotificationQueueItem(reminderId) {
  return NotificationQueue.findOne({
    reminderId,
    status: {
      $in: [
        REMINDER_NOTIFICATION_STATUSES.QUEUED,
        REMINDER_NOTIFICATION_STATUSES.PROCESSING,
        REMINDER_NOTIFICATION_STATUSES.FAILED
      ]
    }
  });
}

export function findReadyNotificationQueueItems(now = new Date(), limit = env.REMINDER_BATCH_SIZE) {
  return NotificationQueue.find({
    status: {
      $in: [
        REMINDER_NOTIFICATION_STATUSES.QUEUED,
        REMINDER_NOTIFICATION_STATUSES.FAILED
      ]
    },
    scheduledFor: { $lte: now },
    $expr: { $lt: ["$attempts", "$maxAttempts"] }
  })
    .sort({ scheduledFor: 1, updatedAt: 1 })
    .limit(limit);
}

export function claimNotificationQueueItem(queueItemId) {
  return NotificationQueue.findOneAndUpdate(
    {
      _id: queueItemId,
      status: {
        $in: [
          REMINDER_NOTIFICATION_STATUSES.QUEUED,
          REMINDER_NOTIFICATION_STATUSES.FAILED
        ]
      },
      $expr: { $lt: ["$attempts", "$maxAttempts"] }
    },
    {
      $set: {
        status: REMINDER_NOTIFICATION_STATUSES.PROCESSING,
        lockedAt: new Date()
      },
      $inc: {
        attempts: 1
      }
    },
    { new: true }
  );
}

export function markQueueItemSent(queueItem, result = {}) {
  queueItem.status = result.skipped
    ? REMINDER_NOTIFICATION_STATUSES.SKIPPED
    : REMINDER_NOTIFICATION_STATUSES.SENT;
  queueItem.sentAt = new Date();
  queueItem.error = "";
  queueItem.result = result;
  queueItem.lockedAt = undefined;
  return queueItem.save();
}

export function markQueueItemFailed(queueItem, error, retryAt) {
  queueItem.status = REMINDER_NOTIFICATION_STATUSES.FAILED;
  queueItem.error = error;
  queueItem.scheduledFor = retryAt;
  queueItem.lockedAt = undefined;
  return queueItem.save();
}

export function markQueueItemCancelled(queueItem, reason) {
  queueItem.status = REMINDER_NOTIFICATION_STATUSES.CANCELLED;
  queueItem.error = reason;
  queueItem.lockedAt = undefined;
  return queueItem.save();
}
