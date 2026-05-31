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
import { isWebPushConfigured, sendWebPushNotifications } from "./webPush.service.js";
import { normalizePreferences } from "../preferences/preferences.service.js";

function toDeviceTokenResponse(deviceToken) {
  return {
    id: deviceToken._id.toString(),
    platform: deviceToken.platform,
    browser: deviceToken.browser,
    deviceId: deviceToken.deviceId,
    provider: deviceToken.metadata?.provider || "firebase",
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

function buildWebPushPayload(payload) {
  const deepLink = payload.data.deepLink || payload.data.click_action || DEFAULT_NOTIFICATION_DEEP_LINK;

  return {
    title: payload.notification.title,
    body: payload.notification.body,
    icon: "/bluemind-logo-black.png",
    badge: "/bluemind-logo-black.png",
    tag: payload.webpush.notification.tag,
    requireInteraction: payload.webpush.notification.requireInteraction,
    data: {
      ...payload.data,
      url: deepLink,
      deepLink
    },
    actions: [
      {
        action: "open",
        title: "Open"
      }
    ]
  };
}

function splitNotificationDevices(deviceTokens) {
  const webPush = [];
  const firebase = [];

  for (const device of deviceTokens) {
    const subscription = device.metadata?.subscription;

    if (device.metadata?.provider === "web-push" && subscription?.endpoint && subscription?.keys) {
      webPush.push(subscription);
    } else if (device.token) {
      firebase.push(device.token);
    }
  }

  return { webPush, firebase };
}

function combineDeliveryResults(results) {
  const result = {
    success: false,
    skipped: false,
    successCount: 0,
    failureCount: 0,
    invalidTokens: [],
    invalidEndpoints: [],
    providers: results
  };

  for (const item of results) {
    result.successCount += item.successCount || 0;
    result.failureCount += item.failureCount || 0;
    result.invalidTokens.push(...(item.invalidTokens || []));
    result.invalidEndpoints.push(...(item.invalidEndpoints || []));
    result.success = result.success || Boolean(item.success);
  }

  result.skipped = results.length > 0 && results.every((item) => item.skipped);

  return result;
}

async function markReminderNotificationSent(reminder, result) {
  reminder.notificationSentAt = new Date();
  reminder.lastNotificationAttempt = new Date();
  reminder.notificationAttempts += 1;
  reminder.notificationError = result.skipped ? result.error || "Notification skipped" : "";

  const advanced = advanceRecurringReminder(reminder);
  reminder.notificationSent = !advanced;

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

export function getNotificationRuntimeStatus() {
  return {
    webPush: {
      configured: isWebPushConfigured(),
      publicKeyConfigured: Boolean(env.WEB_PUSH_PUBLIC_KEY),
      privateKeyConfigured: Boolean(env.WEB_PUSH_PRIVATE_KEY)
    },
    firebase: {
      configured: Boolean(
        env.FIREBASE_SERVICE_ACCOUNT_JSON ||
        (env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY)
      )
    },
    scheduler: {
      enabled: env.REMINDER_SCHEDULER_ENABLED,
      cron: env.REMINDER_SCHEDULER_CRON
    }
  };
}

export async function sendReminderTestNotification(userId, input = {}) {
  const [user, deviceTokens] = await Promise.all([
    findUserById(userId),
    listActiveDeviceTokens(userId)
  ]);

  if (!user) {
    return { delivered: false, error: "User was not found" };
  }

  const deepLink = input.url || DEFAULT_NOTIFICATION_DEEP_LINK;
  const payload = {
    notification: {
      title: input.title || "BlueMind AI",
      body: input.body || "Notifications are ready."
    },
    data: {
      type: "test",
      deepLink,
      click_action: deepLink
    },
    webpush: {
      notification: {
        tag: "bluemind-test-notification",
        requireInteraction: false
      }
    }
  };
  const { webPush, firebase } = splitNotificationDevices(deviceTokens);
  const results = [];

  if (firebase.length) {
    results.push(await sendFirebaseMulticast({
      tokens: firebase,
      message: payload
    }));
  }

  if (webPush.length) {
    results.push(await sendWebPushNotifications({
      subscriptions: webPush,
      payload: buildWebPushPayload(payload)
    }));
  }

  if (!results.length) {
    return {
      delivered: false,
      skipped: true,
      error: "No active notification devices"
    };
  }

  const result = combineDeliveryResults(results);

  await Promise.all((result.invalidTokens || []).map((token) => (
    revokeDeviceToken(userId, token, "FCM rejected device token")
  )));
  await Promise.all((result.invalidEndpoints || []).map((endpoint) => (
    revokeDeviceToken(userId, endpoint, "Web Push subscription expired")
  )));

  return {
    delivered: result.success,
    result
  };
}

function addMonthsClamped(date, months) {
  const next = new Date(date);
  const originalDay = next.getUTCDate();

  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + months);

  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(originalDay, lastDay));

  return next;
}

function advanceRecurringReminder(reminder) {
  const recurrence = reminder.recurrence || {};
  const frequency = recurrence.frequency || "none";

  if (frequency === "none") {
    return false;
  }

  const interval = Math.max(1, Number(recurrence.interval || 1));
  const currentDueAt = reminder.dueAt ? new Date(reminder.dueAt) : null;

  if (!currentDueAt || Number.isNaN(currentDueAt.getTime())) {
    return false;
  }

  let nextDueAt;

  if (frequency === "daily") {
    nextDueAt = new Date(currentDueAt.getTime() + interval * 24 * 60 * 60 * 1000);
  } else if (frequency === "weekly") {
    nextDueAt = new Date(currentDueAt.getTime() + interval * 7 * 24 * 60 * 60 * 1000);
  } else if (frequency === "monthly") {
    nextDueAt = addMonthsClamped(currentDueAt, interval);
  } else {
    return false;
  }

  if (recurrence.until && nextDueAt > new Date(recurrence.until)) {
    return false;
  }

  const nextTriggerAt = new Date(nextDueAt.getTime() - (reminder.reminderBefore || 0) * 60 * 1000);
  reminder.dueAt = nextDueAt;
  reminder.nextTriggerAt = nextTriggerAt;
  reminder.scheduledJobId = `reminder:${reminder._id}:${nextTriggerAt.getTime()}`;

  const local = reminderTimeFormat(nextDueAt, reminder.timezone);
  reminder.reminderDate = local.reminderDate;
  reminder.reminderTime = local.reminderTime;

  return true;
}

function reminderTimeFormat(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || env.DEFAULT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});

  return {
    reminderDate: `${parts.year}-${parts.month}-${parts.day}`,
    reminderTime: `${parts.hour}:${parts.minute}`
  };
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
    const { webPush, firebase } = splitNotificationDevices(deviceTokens);
    const results = [];

    if (firebase.length) {
      results.push(await sendFirebaseMulticast({
        tokens: firebase,
        message: payload
      }));
    }

    if (webPush.length) {
      results.push(await sendWebPushNotifications({
        subscriptions: webPush,
        payload: buildWebPushPayload(payload)
      }));
    }

    const result = combineDeliveryResults(results);

    await Promise.all((result.invalidTokens || []).map((token) => (
      revokeDeviceToken(reminder.userId, token, "FCM rejected device token")
    )));
    await Promise.all((result.invalidEndpoints || []).map((endpoint) => (
      revokeDeviceToken(reminder.userId, endpoint, "Web Push subscription expired")
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
