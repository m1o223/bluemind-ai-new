import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { findUserById } from "../users/user.service.js";
import {
  DEFAULT_NOTIFICATION_DEEP_LINK,
  REMINDER_STATUSES
} from "./reminder.constants.js";
import {
  createNotificationQueueItem,
  findActiveNotificationQueueItem,
  findReminderByIdAnyUser,
  findReadyNotificationQueueItems,
  claimNotificationQueueItem,
  listActiveDeviceTokens,
  markQueueItemCancelled,
  markQueueItemFailed,
  markQueueItemSent,
  revokeDeviceToken,
  saveReminder,
  upsertDeviceToken
} from "./reminder.repository.js";
import { sendFirebaseMulticast } from "./firebase.service.js";
import { normalizePreferences } from "../preferences/preferences.service.js";

function toDeviceTokenResponse(deviceToken) {
  return {
    id: deviceToken._id.toString(),
    platform: deviceToken.platform,
    browser: deviceToken.browser,
    deviceId: deviceToken.deviceId,
    status: deviceToken.status,
    lastSeenAt: deviceToken.lastSeenAt,
    createdAt: deviceToken.createdAt,
    updatedAt: deviceToken.updatedAt
  };
}

function buildReminderDeepLink(reminder) {
  return reminder.metadata?.deepLink || `${DEFAULT_NOTIFICATION_DEEP_LINK}/${reminder._id}`;
}

function buildNotificationPayload({ reminder, user }) {
  const deepLink = buildReminderDeepLink(reminder);
  const preferences = normalizePreferences(user.preferences);
  const language = preferences.language.split("-")[0];
  const title = "BlueMind Reminder";
  const bodyTemplates = {
    ar: `مرحبًا ${user.name} 👋\nعندك تذكير الآن:\n${reminder.title}`,
    sv: `Hej ${user.name} 👋\nDu har en påminnelse nu:\n${reminder.title}`,
    fr: `Bonjour ${user.name} 👋\nVous avez un rappel maintenant :\n${reminder.title}`,
    hi: `नमस्ते ${user.name} 👋\nआपके पास अभी एक रिमाइंडर है:\n${reminder.title}`,
    en: `Hello ${user.name} 👋\nYou have a reminder now:\n${reminder.title}`
  };
  const body = bodyTemplates[language] || bodyTemplates.en;

  return {
    notification: {
      title,
      body
    },
    data: {
      type: "reminder",
      reminderId: reminder._id.toString(),
      title: reminder.title,
      category: reminder.category,
      priority: reminder.priority,
      reminderDate: reminder.reminderDate,
      reminderTime: reminder.reminderTime,
      timezone: reminder.timezone,
      click_action: deepLink,
      deepLink
    },
    webpush: {
      fcmOptions: {
        link: deepLink
      },
      notification: {
        title,
        body,
        tag: `reminder-${reminder._id}`,
        requireInteraction: reminder.priority === "high" || reminder.priority === "urgent",
        data: {
          reminderId: reminder._id.toString(),
          deepLink
        }
      }
    }
  };
}

async function markReminderNotificationSent(reminder, result) {
  reminder.notificationSent = true;
  reminder.notificationSentAt = new Date();
  reminder.lastNotificationAttempt = new Date();
  reminder.notificationAttempts += 1;
  reminder.notificationError = result.skipped ? result.error || "Notification skipped" : "";
  await saveReminder(reminder);
}

async function markReminderNotificationFailed(reminder, error) {
  reminder.lastNotificationAttempt = new Date();
  reminder.notificationAttempts += 1;
  reminder.notificationError = error;
  await saveReminder(reminder);
}

export async function registerReminderDevice(userId, input) {
  const deviceToken = await upsertDeviceToken(userId, input);
  return toDeviceTokenResponse(deviceToken);
}

export async function enqueueReminderNotification(reminder, reason = "scheduled") {
  const activeItem = await findActiveNotificationQueueItem(reminder._id);

  if (activeItem) {
    return {
      queued: false,
      queueId: activeItem._id.toString(),
      reason: "already_queued"
    };
  }

  const item = await createNotificationQueueItem({
    userId: reminder.userId,
    reminderId: reminder._id,
    scheduledFor: new Date(),
    maxAttempts: env.REMINDER_MAX_NOTIFICATION_ATTEMPTS,
    payload: {
      reason,
      title: reminder.title,
      deepLink: buildReminderDeepLink(reminder)
    }
  });

  return {
    queued: true,
    queueId: item._id.toString(),
    reason
  };
}

export async function deliverReminderNotification(queueItem) {
  const reminder = await findReminderByIdAnyUser(queueItem.reminderId);

  if (!reminder) {
    await markQueueItemCancelled(queueItem, "Reminder was not found");
    return { delivered: false, cancelled: true };
  }

  if (reminder.status !== REMINDER_STATUSES.UPCOMING || reminder.notificationSent) {
    await markQueueItemCancelled(queueItem, "Reminder is not deliverable");
    return { delivered: false, cancelled: true };
  }

  const [user, deviceTokens] = await Promise.all([
    findUserById(reminder.userId),
    listActiveDeviceTokens(reminder.userId)
  ]);

  if (!user) {
    await markQueueItemCancelled(queueItem, "Reminder user was not found");
    return { delivered: false, cancelled: true };
  }

  const payload = buildNotificationPayload({ reminder, user });

  if (!deviceTokens.length) {
    const result = {
      skipped: true,
      error: "No active device tokens",
      successCount: 0,
      failureCount: 0
    };

    await markReminderNotificationSent(reminder, result);
    await markQueueItemSent(queueItem, result);
    logger.info({ reminderId: reminder._id }, "Reminder notification skipped: no device tokens");
    return { delivered: true, skipped: true };
  }

  try {
    const result = await sendFirebaseMulticast({
      tokens: deviceTokens.map((item) => item.token),
      message: payload
    });

    await Promise.all((result.invalidTokens || []).map((token) => (
      revokeDeviceToken(reminder.userId, token, "FCM rejected device token")
    )));

    if (result.skipped || result.success) {
      await markReminderNotificationSent(reminder, result);
      await markQueueItemSent(queueItem, result);
      logger.info({
        reminderId: reminder._id,
        successCount: result.successCount,
        failureCount: result.failureCount,
        skipped: result.skipped
      }, "Reminder notification processed");
      return { delivered: true, result };
    }

    throw new Error(result.error || "FCM delivery failed");
  } catch (error) {
    const retryAt = new Date(Date.now() + env.REMINDER_RETRY_DELAY_MS);
    const message = error.message || "Notification delivery failed";

    await markReminderNotificationFailed(reminder, message);
    await markQueueItemFailed(queueItem, message, retryAt);
    logger.error({ error, reminderId: reminder._id, retryAt }, "Reminder notification failed");
    return { delivered: false, error: message, retryAt };
  }
}

export async function processNotificationQueue({ now = new Date(), limit = env.REMINDER_BATCH_SIZE } = {}) {
  const candidates = await findReadyNotificationQueueItems(now, limit);
  const results = [];

  for (const candidate of candidates) {
    const queueItem = await claimNotificationQueueItem(candidate._id);

    if (!queueItem) {
      continue;
    }

    results.push(await deliverReminderNotification(queueItem));
  }

  return {
    processed: results.length,
    delivered: results.filter((item) => item.delivered).length,
    failed: results.filter((item) => item.error).length
  };
}
