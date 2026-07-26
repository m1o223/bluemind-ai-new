import cron from "node-cron";
import mongoose from "mongoose";

import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { processSmartNotificationQueue } from "./smartNotification.service.js";

let cronTask;

export async function runSmartNotificationSchedulerTick({ now = new Date() } = {}) {
  try {
    if (mongoose.connection.readyState !== 1) {
      logger.warn("Smart notification scheduler tick skipped because MongoDB is unavailable");
      return { skipped: true, reason: "mongodb_unavailable" };
    }

    const result = await processSmartNotificationQueue({ now });
    logger.info(result, "Smart notification scheduler tick completed");
    return result;
  } catch (error) {
    logger.error({ error }, "Smart notification scheduler tick failed");
    return { error: error.message };
  }
}

export function startSmartNotificationScheduler() {
  if (!env.REMINDER_SCHEDULER_ENABLED) {
    logger.warn("Smart notification scheduler is disabled by configuration");
    return;
  }

  if (cronTask) return;

  cronTask = cron.schedule(env.REMINDER_SCHEDULER_CRON, () => {
    runSmartNotificationSchedulerTick().catch((error) => {
      logger.error({ error }, "Smart notification background tick failed");
    });
  });

  logger.info({ cron: env.REMINDER_SCHEDULER_CRON }, "Smart notification scheduler started");

  setTimeout(() => {
    runSmartNotificationSchedulerTick().catch((error) => {
      logger.error({ error }, "Initial smart notification scheduler tick failed");
    });
  }, 5000).unref?.();
}

export function stopSmartNotificationScheduler() {
  if (!cronTask) return;
  cronTask.stop();
  cronTask = undefined;
  logger.info("Smart notification scheduler stopped");
}
