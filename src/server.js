import { app } from "./app.js";
import { env } from "./config/env.js";
import {
  connectDatabase,
  disconnectDatabase,
  getDatabaseStatus,
  startDatabaseReconnectLoop
} from "./config/database.js";
import { logger } from "./config/logger.js";
import { startAccountDeletionScheduler, stopAccountDeletionScheduler } from "./modules/auth/accountDeletion.scheduler.js";
import { startSmartNotificationScheduler, stopSmartNotificationScheduler } from "./modules/notifications/smartNotification.scheduler.js";
import { startReminderScheduler, stopReminderScheduler } from "./modules/reminders/reminder.scheduler.js";

let server;

function bootstrap() {
  startDatabaseReconnectLoop();

  server = app.listen(env.PORT, () => {
    logger.info({
      port: env.PORT,
      environment: env.NODE_ENV,
      apiPrefix: env.API_PREFIX,
      database: getDatabaseStatus()
    }, "BlueMind AI backend started");
  });

  connectDatabase({ throwOnFailure: false }).then((databaseConnected) => {
    logger.info({
      databaseConnected,
      database: getDatabaseStatus()
    }, "Initial MongoDB connection attempt completed");
  }).catch((error) => {
    logger.error({
      err: error,
      code: error.code,
      name: error.name
    }, "Initial MongoDB connection attempt crashed");
  });

  startReminderScheduler();
  startSmartNotificationScheduler();
  startAccountDeletionScheduler();
}

async function shutdown(signal) {
  logger.info({ signal }, "Shutdown signal received");

  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }

  stopReminderScheduler();
  stopSmartNotificationScheduler();
  stopAccountDeletionScheduler();
  await disconnectDatabase();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled promise rejection");
});

process.on("uncaughtException", (error) => {
  logger.fatal({ error }, "Uncaught exception");
  process.exit(1);
});

try {
  bootstrap();
} catch (error) {
  logger.fatal({
    err: error,
    code: error.code,
    name: error.name
  }, "Failed to start backend");
  process.exit(1);
}
