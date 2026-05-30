import cron from "node-cron";

import { isDatabaseConnected } from "../../config/database.js";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { REMINDER_STATUSES } from "./reminder.constants.js";
import {
  findDueRemindersForNotification,
  markMissedReminders
} from "./reminder.repository.js";
import {
  enqueueReminderNotification,
  processNotificationQueue
} from "./reminder.notification.js";

let cronTask;
let isTickRunning = false;
const registeredReminderJobs = new Map();

export function registerReminderSchedule(reminder) {
  if (reminder.status !== REMINDER_STATUSES.UPCOMING || !reminder.nextTriggerAt) {
    registeredReminderJobs.delete(reminder._id.toString());
    return {
      scheduled: false,
      reason: "not_upcoming"
    };
  }

  registeredReminderJobs.set(reminder._id.toString(), {
    scheduledJobId: reminder.scheduledJobId,
    nextTriggerAt: reminder.nextTriggerAt
  });

  return {
    scheduled: true,
    scheduledJobId: reminder.scheduledJobId,
    nextTriggerAt: reminder.nextTriggerAt,
    mode: "cron-polling"
  };
}

export async function runReminderSchedulerTick({ now = new Date() } = {}) {
  if (isTickRunning) {
    return {
      skipped: true,
      reason: "tick_already_running"
    };
  }

  isTickRunning = true;

  try {
    if (!isDatabaseConnected()) {
      logger.warn("Reminder scheduler tick skipped because MongoDB is unavailable");
      return {
        skipped: true,
        reason: "database_unavailable"
      };
    }

    const dueReminders = await findDueRemindersForNotification(now, env.REMINDER_BATCH_SIZE);
    const queued = [];

    for (const reminder of dueReminders) {
      queued.push(await enqueueReminderNotification(reminder, "scheduler_due"));
    }

    const queueResult = await processNotificationQueue({
      now,
      limit: env.REMINDER_BATCH_SIZE
    });
    const missedCutoff = new Date(now.getTime() - env.REMINDER_MISSED_AFTER_MINUTES * 60 * 1000);
    const missedResult = await markMissedReminders(missedCutoff);

    logger.info({
      dueReminders: dueReminders.length,
      queued: queued.filter((item) => item.queued).length,
      queueProcessed: queueResult.processed,
      missed: missedResult.modifiedCount || 0
    }, "Reminder scheduler tick completed");

    return {
      dueReminders: dueReminders.length,
      queued,
      notifications: queueResult,
      missed: missedResult.modifiedCount || 0
    };
  } catch (error) {
    logger.error({ error }, "Reminder scheduler tick failed");
    throw error;
  } finally {
    isTickRunning = false;
  }
}

export function startReminderScheduler() {
  if (!env.REMINDER_SCHEDULER_ENABLED) {
    logger.warn("Reminder scheduler is disabled by configuration");
    return null;
  }

  if (cronTask) {
    return cronTask;
  }

  cronTask = cron.schedule(env.REMINDER_SCHEDULER_CRON, () => {
    runReminderSchedulerTick().catch((error) => {
      logger.error({ error }, "Reminder scheduler background tick failed");
    });
  }, {
    timezone: "UTC"
  });

  logger.info({
    cron: env.REMINDER_SCHEDULER_CRON,
    mode: "cron-polling",
    futureQueueEngine: "BullMQ/Redis compatible"
  }, "Reminder scheduler started");

  setTimeout(() => {
    runReminderSchedulerTick().catch((error) => {
      logger.error({ error }, "Initial reminder scheduler tick failed");
    });
  }, 1000);

  return cronTask;
}

export function stopReminderScheduler() {
  if (!cronTask) {
    return;
  }

  cronTask.stop();
  cronTask = undefined;
  registeredReminderJobs.clear();
  logger.info("Reminder scheduler stopped");
}
