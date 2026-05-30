import mongoose from "mongoose";

import { env } from "../src/config/env.js";
import { AuthSession } from "../src/modules/auth/session.model.js";
import { ImageAsset } from "../src/modules/images/image.model.js";
import { Conversation } from "../src/modules/memory/conversation.model.js";
import { UserMemory } from "../src/modules/memory/userMemory.model.js";
import { DeviceToken } from "../src/modules/reminders/deviceToken.model.js";
import { NotificationQueue } from "../src/modules/reminders/notificationQueue.model.js";
import { Reminder } from "../src/modules/reminders/reminder.model.js";
import { User } from "../src/modules/users/user.model.js";

const CONFIRMATION = "RESET_AUTH_DEV";

function hasConfirmation() {
  return process.argv.includes(`--confirm=${CONFIRMATION}`);
}

function assertDevelopmentResetAllowed() {
  if (env.NODE_ENV === "production") {
    throw new Error("Refusing to reset auth data in production.");
  }

  if (!hasConfirmation()) {
    throw new Error(`Missing --confirm=${CONFIRMATION}`);
  }
}

function emptyLinkedQuery(userIds) {
  return userIds.length ? { userId: { $in: userIds } } : { _id: null };
}

async function countState(userIds) {
  const linkedQuery = emptyLinkedQuery(userIds);

  return {
    users: await User.countDocuments({}),
    authSessions: await AuthSession.countDocuments({}),
    linkedDeviceTokens: await DeviceToken.countDocuments(linkedQuery),
    linkedNotificationQueue: await NotificationQueue.countDocuments(linkedQuery),
    linkedReminders: await Reminder.countDocuments(linkedQuery),
    linkedUserMemories: await UserMemory.countDocuments(linkedQuery),
    linkedConversations: await Conversation.countDocuments(linkedQuery),
    linkedImageAssets: await ImageAsset.countDocuments(linkedQuery),
  };
}

async function run() {
  assertDevelopmentResetAllowed();

  await mongoose.connect(env.MONGODB_URI, {
    serverSelectionTimeoutMS: env.MONGODB_CONNECT_TIMEOUT_MS,
    connectTimeoutMS: env.MONGODB_CONNECT_TIMEOUT_MS,
  });

  const users = await User.find({}).select("_id").lean();
  const userIds = users.map((user) => user._id);
  const linkedQuery = emptyLinkedQuery(userIds);
  const before = await countState(userIds);

  const deleted = {
    authSessions: (await AuthSession.deleteMany({})).deletedCount || 0,
    deviceTokens: (await DeviceToken.deleteMany(linkedQuery)).deletedCount || 0,
    notificationQueue: (await NotificationQueue.deleteMany(linkedQuery)).deletedCount || 0,
    reminders: (await Reminder.deleteMany(linkedQuery)).deletedCount || 0,
    userMemories: (await UserMemory.deleteMany(linkedQuery)).deletedCount || 0,
    conversations: (await Conversation.deleteMany(linkedQuery)).deletedCount || 0,
    imageAssets: (await ImageAsset.deleteMany(linkedQuery)).deletedCount || 0,
    users: (await User.deleteMany({})).deletedCount || 0,
  };

  const after = await countState([]);

  await mongoose.disconnect();

  console.log(JSON.stringify({
    ok: true,
    mode: "development-auth-reset",
    before,
    deleted,
    after,
  }, null, 2));
}

run().catch(async (error) => {
  await mongoose.disconnect().catch(() => {});
  console.error(JSON.stringify({
    ok: false,
    message: error.message,
  }, null, 2));
  process.exitCode = 1;
});
