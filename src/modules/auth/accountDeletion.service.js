import { unlink } from "node:fs/promises";

import { AppError } from "../../utils/AppError.js";
import { ImageAsset } from "../images/image.model.js";
import { getImageAbsolutePath } from "../images/image-storage.service.js";
import { Conversation } from "../memory/conversation.model.js";
import { UserMemory } from "../memory/userMemory.model.js";
import { LearningProfile } from "../learning-profile/learningProfile.model.js";
import { SmartNotification } from "../notifications/smartNotification.model.js";
import { PrivateSpace } from "../private-spaces/privateSpace.model.js";
import { DeviceToken } from "../reminders/deviceToken.model.js";
import { NotificationQueue } from "../reminders/notificationQueue.model.js";
import { Reminder } from "../reminders/reminder.model.js";
import { WritingProfile } from "../writing-profile/writingProfile.model.js";
import { User } from "../users/user.model.js";
import { comparePassword } from "./password.service.js";
import { AuthSession } from "./session.model.js";

const ACCOUNT_DELETION_GRACE_MS = 5 * 60 * 1000;
const ACCOUNT_DELETION_BATCH_SIZE = 25;

function now() {
  return new Date();
}

function toStatus(user) {
  if (!user || user.deletionStatus !== "pending" || !user.deleteAt) {
    return {
      status: "normal",
      deleteAt: null,
      deletionRequestedAt: null,
      remainingSeconds: 0
    };
  }

  return {
    status: "pending",
    deleteAt: user.deleteAt,
    deletionRequestedAt: user.deletionRequestedAt,
    remainingSeconds: Math.max(0, Math.ceil((user.deleteAt.getTime() - Date.now()) / 1000))
  };
}

async function deleteImageFiles(userId) {
  const assets = await ImageAsset.find({ userId }).select("relativePath").lean();

  await Promise.allSettled(
    assets
      .map((asset) => asset.relativePath)
      .filter(Boolean)
      .map(async (relativePath) => {
        try {
          await unlink(getImageAbsolutePath(relativePath));
        } catch {
          // File cleanup is best-effort; database deletion remains the source of truth.
        }
      })
  );
}

export async function permanentlyDeleteAccount(userId) {
  const user = await User.findOneAndUpdate(
    {
      _id: userId,
      deletionStatus: "pending",
      deleteAt: { $lte: now() }
    },
    {
      $set: {
        deletionStatus: "deleting"
      }
    },
    { new: true }
  );

  if (!user) return { deleted: false };

  await deleteImageFiles(user._id);

  await Promise.all([
    AuthSession.deleteMany({ userId: user._id }),
    Conversation.deleteMany({ userId: user._id }),
    UserMemory.deleteMany({ userId: user._id }),
    ImageAsset.deleteMany({ userId: user._id }),
    SmartNotification.deleteMany({ userId: user._id }),
    DeviceToken.deleteMany({ userId: user._id }),
    NotificationQueue.deleteMany({ userId: user._id }),
    Reminder.deleteMany({
      $or: [
        { userId: user._id },
        { createdBy: user._id }
      ]
    }),
    PrivateSpace.deleteMany({ userId: user._id }),
    WritingProfile.deleteMany({ userId: user._id }),
    LearningProfile.deleteMany({ userId: user._id })
  ]);

  await User.deleteOne({ _id: user._id });

  return {
    deleted: true,
    userId: user._id.toString()
  };
}

export async function processDueAccountDeletions({ limit = ACCOUNT_DELETION_BATCH_SIZE } = {}) {
  const dueUsers = await User.find({
    deletionStatus: "pending",
    deleteAt: { $lte: now() }
  }).select("_id").limit(limit).lean();

  const results = await Promise.allSettled(
    dueUsers.map((user) => permanentlyDeleteAccount(user._id))
  );

  return {
    checked: dueUsers.length,
    deleted: results.filter((result) => result.status === "fulfilled" && result.value?.deleted).length
  };
}

export async function getAccountDeletionStatus(user) {
  if (user?.deletionStatus === "pending" && user.deleteAt <= now()) {
    await permanentlyDeleteAccount(user._id);
    throw new AppError("Account has been deleted", 401, "ACCOUNT_DELETED");
  }

  return toStatus(user);
}

export async function requestAccountDeletion(user, { password }) {
  if (user.deletionStatus === "pending" && user.deleteAt) {
    if (user.deleteAt <= now()) {
      await permanentlyDeleteAccount(user._id);
      throw new AppError("Account has already been deleted", 410, "ACCOUNT_DELETION_COMPLETED");
    }

    return toStatus(user);
  }

  if (!user.passwordHash) {
    throw new AppError("Password verification is required to delete this account", 400, "PASSWORD_LOGIN_REQUIRED");
  }

  const passwordMatches = await comparePassword(password, user.passwordHash);

  if (!passwordMatches) {
    throw new AppError("Password is incorrect", 401, "ACCOUNT_DELETE_PASSWORD_INVALID");
  }

  const requestedAt = now();
  user.deletionStatus = "pending";
  user.deletionRequestedAt = requestedAt;
  user.deleteAt = new Date(requestedAt.getTime() + ACCOUNT_DELETION_GRACE_MS);
  await user.save();

  return toStatus(user);
}

export async function cancelAccountDeletion(user) {
  if (user.deletionStatus !== "pending") {
    return toStatus(user);
  }

  if (user.deleteAt && user.deleteAt <= now()) {
    await permanentlyDeleteAccount(user._id);
    throw new AppError("Account deletion has already completed", 410, "ACCOUNT_DELETION_COMPLETED");
  }

  user.deletionStatus = "normal";
  user.deletionRequestedAt = undefined;
  user.deleteAt = undefined;
  await user.save();

  return toStatus(user);
}
