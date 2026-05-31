import webpush from "web-push";

import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";

let configured = false;

function configureWebPush() {
  if (configured) return true;

  if (!env.WEB_PUSH_PUBLIC_KEY || !env.WEB_PUSH_PRIVATE_KEY) {
    return false;
  }

  webpush.setVapidDetails(
    env.WEB_PUSH_SUBJECT,
    env.WEB_PUSH_PUBLIC_KEY,
    env.WEB_PUSH_PRIVATE_KEY
  );
  configured = true;
  return true;
}

export function isWebPushConfigured() {
  return configureWebPush();
}

export async function sendWebPushNotifications({ subscriptions, payload }) {
  if (!subscriptions.length) {
    return {
      skipped: true,
      success: true,
      successCount: 0,
      failureCount: 0,
      invalidEndpoints: []
    };
  }

  if (!configureWebPush()) {
    return {
      skipped: false,
      success: false,
      successCount: 0,
      failureCount: subscriptions.length,
      invalidEndpoints: [],
      error: "WEB_PUSH_PUBLIC_KEY and WEB_PUSH_PRIVATE_KEY are not configured"
    };
  }

  const message = JSON.stringify(payload);
  const results = await Promise.allSettled(
    subscriptions.map((subscription) => webpush.sendNotification(subscription, message))
  );
  const invalidEndpoints = [];
  let successCount = 0;
  let failureCount = 0;

  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      successCount += 1;
      return;
    }

    failureCount += 1;
    const statusCode = result.reason?.statusCode;

    if ([404, 410].includes(statusCode)) {
      invalidEndpoints.push(subscriptions[index].endpoint);
    }

    logger.warn({
      error: result.reason?.message,
      statusCode,
      endpoint: subscriptions[index].endpoint
    }, "Web Push delivery failed");
  });

  return {
    success: successCount > 0,
    successCount,
    failureCount,
    invalidEndpoints
  };
}
