import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { findUserById } from "../users/user.service.js";
import { normalizePreferences } from "../preferences/preferences.service.js";
import {
  listActiveDeviceTokens,
  revokeDeviceToken
} from "../reminders/reminder.repository.js";
import { sendFirebaseMulticast } from "../reminders/firebase.service.js";
import { isWebPushConfigured, sendWebPushNotifications } from "../reminders/webPush.service.js";
import { buildSmartNotificationContent } from "./smartNotification.content.js";
import {
  SMART_NOTIFICATION_STATUSES,
  SMART_NOTIFICATION_TYPES,
  SmartNotification
} from "./smartNotification.model.js";

function canSendSmartPush(user) {
  const preferences = normalizePreferences(user.preferences);
  const notificationPreferences = preferences.notificationPreferences || {};

  return preferences.notificationsEnabled !== false
    && notificationPreferences.channels?.push !== false;
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

function buildPushPayload(notification) {
  return {
    notification: {
      title: notification.title,
      body: notification.body
    },
    data: {
      type: notification.type,
      notificationId: notification._id.toString(),
      sourceId: notification.sourceId || "",
      title: notification.title,
      body: notification.body,
      icon: notification.icon,
      badge: notification.badge,
      deepLink: notification.deepLink,
      click_action: notification.deepLink,
      url: notification.deepLink
    },
    webpush: {
      fcmOptions: {
        link: notification.deepLink
      },
      notification: {
        title: notification.title,
        body: notification.body,
        tag: `${notification.type}-${notification.sourceId || notification._id}`,
        requireInteraction: false,
        data: {
          notificationId: notification._id.toString(),
          type: notification.type,
          deepLink: notification.deepLink,
          url: notification.deepLink
        }
      }
    }
  };
}

function buildWebPushPayload(payload) {
  const deepLink = payload.data.deepLink || payload.data.click_action || payload.data.url || "/";

  return {
    title: payload.notification.title,
    body: payload.notification.body,
    icon: payload.data.icon || "/bluemind-logo-black.png",
    badge: payload.data.badge || "/bluemind-logo-black.png",
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

function toNotificationResponse(notification) {
  return {
    id: notification._id.toString(),
    type: notification.type,
    sourceId: notification.sourceId,
    title: notification.title,
    body: notification.body,
    deepLink: notification.deepLink,
    status: notification.status,
    scheduledFor: notification.scheduledFor,
    sentAt: notification.sentAt,
    error: notification.error,
    createdAt: notification.createdAt,
    updatedAt: notification.updatedAt
  };
}

export function getSmartNotificationRuntimeStatus() {
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

export async function queueSmartNotification({
  userId,
  type,
  source = {},
  sourceId = "",
  scheduledFor = new Date(),
  dedupeKey = "",
  maxAttempts = env.REMINDER_MAX_NOTIFICATION_ATTEMPTS
}) {
  if (!userId) return null;

  const content = buildSmartNotificationContent(type, source);
  const cleanSourceId = String(sourceId || source.id || source._id || "").trim();
  const cleanDedupeKey = String(dedupeKey || `${content.type}:${cleanSourceId || Date.now()}`).trim();
  const scheduledDate = new Date(scheduledFor || Date.now());

  const update = {
    $setOnInsert: {
      userId,
      type: content.type,
      sourceId: cleanSourceId,
      dedupeKey: cleanDedupeKey,
      title: content.title,
      body: content.body,
      deepLink: content.deepLink,
      scheduledFor: Number.isNaN(scheduledDate.getTime()) ? new Date() : scheduledDate,
      maxAttempts,
      payload: {
        source
      }
    }
  };

  const notification = await SmartNotification.findOneAndUpdate(
    { userId, dedupeKey: cleanDedupeKey },
    update,
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true
    }
  );

  return toNotificationResponse(notification);
}

export async function listSmartNotifications(userId, { type, limit = 50 } = {}) {
  const query = { userId };
  if (type && Object.values(SMART_NOTIFICATION_TYPES).includes(type)) {
    query.type = type;
  }

  const notifications = await SmartNotification.find(query)
    .sort({ createdAt: -1 })
    .limit(limit);

  return notifications.map(toNotificationResponse);
}

async function markNotificationSent(notification, result = {}) {
  notification.status = result.skipped
    ? SMART_NOTIFICATION_STATUSES.SKIPPED
    : SMART_NOTIFICATION_STATUSES.SENT;
  notification.sentAt = new Date();
  notification.error = "";
  notification.result = result;
  notification.lockedAt = undefined;
  await notification.save();
}

async function markNotificationFailed(notification, error, retryAt) {
  notification.status = SMART_NOTIFICATION_STATUSES.FAILED;
  notification.error = error;
  notification.scheduledFor = retryAt;
  notification.lockedAt = undefined;
  await notification.save();
}

export async function deliverSmartNotification(notification) {
  const [user, deviceTokens] = await Promise.all([
    findUserById(notification.userId),
    listActiveDeviceTokens(notification.userId)
  ]);

  if (!user) {
    notification.status = SMART_NOTIFICATION_STATUSES.CANCELLED;
    notification.error = "Notification user was not found";
    notification.lockedAt = undefined;
    await notification.save();
    return { delivered: false, cancelled: true };
  }

  if (!canSendSmartPush(user)) {
    const result = {
      skipped: true,
      error: "Push notifications disabled by user preferences",
      successCount: 0,
      failureCount: 0
    };
    await markNotificationSent(notification, result);
    return { delivered: true, skipped: true };
  }

  if (!deviceTokens.length) {
    const result = {
      skipped: true,
      error: "No active notification devices",
      successCount: 0,
      failureCount: 0
    };
    await markNotificationSent(notification, result);
    return { delivered: true, skipped: true };
  }

  try {
    const payload = buildPushPayload(notification);
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
      revokeDeviceToken(notification.userId, token, "Notification provider rejected device token")
    )));
    await Promise.all((result.invalidEndpoints || []).map((endpoint) => (
      revokeDeviceToken(notification.userId, endpoint, "Web Push subscription expired")
    )));

    if (result.skipped || result.success) {
      await markNotificationSent(notification, result);
      return { delivered: true, result };
    }

    throw new Error(result.error || "Notification delivery failed");
  } catch (error) {
    const retryAt = new Date(Date.now() + env.REMINDER_RETRY_DELAY_MS);
    const message = error.message || "Notification delivery failed";

    await markNotificationFailed(notification, message, retryAt);
    logger.error({ error, notificationId: notification._id, retryAt }, "Smart notification failed");
    return { delivered: false, error: message, retryAt };
  }
}

export async function processSmartNotificationQueue({ now = new Date(), limit = env.REMINDER_BATCH_SIZE } = {}) {
  const candidates = await SmartNotification.find({
    status: {
      $in: [
        SMART_NOTIFICATION_STATUSES.QUEUED,
        SMART_NOTIFICATION_STATUSES.FAILED
      ]
    },
    scheduledFor: { $lte: now },
    $expr: { $lt: ["$attempts", "$maxAttempts"] }
  })
    .sort({ scheduledFor: 1, updatedAt: 1 })
    .limit(limit);
  const results = [];

  for (const candidate of candidates) {
    const notification = await SmartNotification.findOneAndUpdate(
      {
        _id: candidate._id,
        status: {
          $in: [
            SMART_NOTIFICATION_STATUSES.QUEUED,
            SMART_NOTIFICATION_STATUSES.FAILED
          ]
        },
        $expr: { $lt: ["$attempts", "$maxAttempts"] }
      },
      {
        $set: {
          status: SMART_NOTIFICATION_STATUSES.PROCESSING,
          lockedAt: new Date()
        },
        $inc: {
          attempts: 1
        }
      },
      { new: true }
    );

    if (!notification) continue;
    results.push(await deliverSmartNotification(notification));
  }

  return {
    processed: results.length,
    delivered: results.filter((item) => item.delivered).length,
    failed: results.filter((item) => item.error).length
  };
}
