import { logger } from "../../config/logger.js";
import { processDueAccountDeletions } from "./accountDeletion.service.js";

const ACCOUNT_DELETION_INTERVAL_MS = 30 * 1000;

let scheduler;
let running = false;

async function runAccountDeletionSweep() {
  if (running) return;
  running = true;

  try {
    const result = await processDueAccountDeletions();

    if (result.deleted > 0) {
      logger.info(result, "Pending account deletions completed");
    }
  } catch (error) {
    logger.error({
      err: error,
      code: error.code,
      name: error.name
    }, "Account deletion scheduler failed");
  } finally {
    running = false;
  }
}

export function startAccountDeletionScheduler() {
  if (scheduler) return scheduler;

  scheduler = setInterval(runAccountDeletionSweep, ACCOUNT_DELETION_INTERVAL_MS);
  scheduler.unref?.();
  void runAccountDeletionSweep();

  logger.info({
    intervalMs: ACCOUNT_DELETION_INTERVAL_MS
  }, "Account deletion scheduler started");

  return scheduler;
}

export function stopAccountDeletionScheduler() {
  if (!scheduler) return;

  clearInterval(scheduler);
  scheduler = undefined;
  logger.info("Account deletion scheduler stopped");
}
