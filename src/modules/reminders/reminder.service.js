import mongoose from "mongoose";

import { env } from "../../config/env.js";
import { AppError } from "../../utils/AppError.js";
import {
  findConversationById,
  findMemoryById,
  upsertUserMemory
} from "../memory/memory.repository.js";
import {
  DEFAULT_REMINDER_BEFORE_MINUTES,
  REMINDER_CATEGORIES,
  REMINDER_PRIORITIES,
  REMINDER_STATUSES
} from "./reminder.constants.js";
import {
  createReminder,
  findReminderById,
  listRemindersByUser,
  saveReminder
} from "./reminder.repository.js";
import { registerReminderSchedule } from "./reminder.scheduler.js";

function getTimeZoneOffsetMs(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== "literal") {
      acc[part.type] = part.value;
    }

    return acc;
  }, {});
  const hour = parts.hour === "24" ? "00" : parts.hour;
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(hour),
    Number(parts.minute),
    Number(parts.second)
  );

  return asUtc - date.getTime();
}

function zonedDateTimeToUtc(reminderDate, reminderTime, timezone) {
  const [year, month, day] = reminderDate.split("-").map(Number);
  const [hour, minute] = reminderTime.split(":").map(Number);
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
  const offset = getTimeZoneOffsetMs(utcGuess, timezone);
  let utcDate = new Date(utcGuess.getTime() - offset);
  const correctedOffset = getTimeZoneOffsetMs(utcDate, timezone);

  if (correctedOffset !== offset) {
    utcDate = new Date(utcGuess.getTime() - correctedOffset);
  }

  return utcDate;
}

function formatDateTimeInZone(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== "literal") {
      acc[part.type] = part.value;
    }

    return acc;
  }, {});
  const hour = parts.hour === "24" ? "00" : parts.hour;

  return {
    reminderDate: `${parts.year}-${parts.month}-${parts.day}`,
    reminderTime: `${hour}:${parts.minute}`
  };
}

function buildScheduledJobId(reminderId, nextTriggerAt) {
  return `reminder:${reminderId}:${nextTriggerAt ? nextTriggerAt.getTime() : "none"}`;
}

function buildReminderEvent(type, reminder) {
  return {
    type,
    reminderId: reminder._id.toString(),
    userId: reminder.userId.toString(),
    scheduledJobId: reminder.scheduledJobId,
    nextTriggerAt: reminder.nextTriggerAt,
    generatedAt: new Date()
  };
}

function normalizeTiming(input, existingReminder) {
  const timezone = input.timezone || existingReminder?.timezone || env.DEFAULT_TIMEZONE;
  const reminderBefore = input.reminderBefore ?? existingReminder?.reminderBefore ?? DEFAULT_REMINDER_BEFORE_MINUTES;
  let reminderDate = input.reminderDate ?? existingReminder?.reminderDate;
  let reminderTime = input.reminderTime ?? existingReminder?.reminderTime;
  let dueAt = existingReminder?.dueAt;

  if (input.dueAt && !input.reminderDate && !input.reminderTime) {
    dueAt = new Date(input.dueAt);
    ({ reminderDate, reminderTime } = formatDateTimeInZone(dueAt, timezone));
  } else if (reminderDate && reminderTime) {
    dueAt = zonedDateTimeToUtc(reminderDate, reminderTime, timezone);
  }

  if (!dueAt || Number.isNaN(dueAt.getTime())) {
    throw new AppError("Reminder date/time is invalid", 400, "REMINDER_INVALID_DATE");
  }

  const nextTriggerAt = new Date(dueAt.getTime() - reminderBefore * 60 * 1000);

  return {
    reminderDate,
    reminderTime,
    timezone,
    reminderBefore,
    dueAt,
    nextTriggerAt
  };
}

function toReminderResponse(reminder) {
  return {
    id: reminder._id.toString(),
    title: reminder.title,
    description: reminder.description,
    reminderDate: reminder.reminderDate,
    reminderTime: reminder.reminderTime,
    timezone: reminder.timezone,
    reminderBefore: reminder.reminderBefore,
    dueAt: reminder.dueAt,
    status: reminder.status,
    notification: {
      sent: reminder.notificationSent,
      sentAt: reminder.notificationSentAt,
      lastAttempt: reminder.lastNotificationAttempt,
      attempts: reminder.notificationAttempts,
      error: reminder.notificationError
    },
    ai: {
      generated: reminder.aiGenerated,
      suggested: reminder.aiSuggested,
      context: reminder.aiContext,
      reason: reminder.aiReason,
      linkedConversationId: reminder.linkedConversationId?.toString(),
      linkedMemoryId: reminder.linkedMemoryId?.toString()
    },
    schedule: {
      scheduledJobId: reminder.scheduledJobId,
      nextTriggerAt: reminder.nextTriggerAt
    },
    recurrence: {
      frequency: reminder.recurrence?.frequency || "none",
      interval: reminder.recurrence?.interval || 1,
      until: reminder.recurrence?.until
    },
    tags: reminder.tags,
    category: reminder.category,
    priority: reminder.priority,
    metadata: reminder.metadata,
    createdAt: reminder.createdAt,
    updatedAt: reminder.updatedAt
  };
}

async function assertLinks(userId, input) {
  if (input.linkedConversationId) {
    const conversation = await findConversationById(input.linkedConversationId, userId);

    if (!conversation) {
      throw new AppError("Linked conversation was not found", 404, "CONVERSATION_NOT_FOUND");
    }
  }

  if (input.linkedMemoryId) {
    const memory = await findMemoryById(input.linkedMemoryId, userId);

    if (!memory) {
      throw new AppError("Linked memory was not found", 404, "MEMORY_NOT_FOUND");
    }
  }
}

async function saveReminderMemory(userId, reminder) {
  const content = [
    `Reminder: ${reminder.title}`,
    `When: ${reminder.reminderDate} ${reminder.reminderTime} ${reminder.timezone}`,
    reminder.description && `Details: ${reminder.description}`,
    reminder.aiReason && `Reason: ${reminder.aiReason}`
  ].filter(Boolean).join("\n").slice(0, 1200);
  const memory = await upsertUserMemory(userId, {
    type: "summary",
    key: `reminder:${reminder._id}`,
    content,
    tags: ["reminder", reminder.category, reminder.priority, ...reminder.tags].filter(Boolean),
    importance: reminder.priority === REMINDER_PRIORITIES.URGENT
      ? 0.9
      : reminder.priority === REMINDER_PRIORITIES.HIGH
        ? 0.75
        : 0.55,
    confidence: reminder.aiGenerated ? 0.78 : 0.92,
    pinned: reminder.priority === REMINDER_PRIORITIES.URGENT,
    source: {
      conversationId: reminder.linkedConversationId,
      kind: reminder.aiGenerated ? "extracted" : "manual"
    },
    metadata: {
      reminderId: reminder._id.toString(),
      dueAt: reminder.dueAt,
      nextTriggerAt: reminder.nextTriggerAt
    }
  });

  if (!reminder.linkedMemoryId) {
    reminder.linkedMemoryId = memory._id;
    await saveReminder(reminder);
  }

  return memory;
}

export async function listUserReminders(userId, filters) {
  const reminders = await listRemindersByUser(userId, filters);
  return reminders.map(toReminderResponse);
}

export async function getUserReminder(userId, reminderId) {
  const reminder = await findReminderById(reminderId, userId);

  if (!reminder) {
    throw new AppError("Reminder was not found", 404, "REMINDER_NOT_FOUND");
  }

  return toReminderResponse(reminder);
}

export async function createUserReminder(userId, input) {
  await assertLinks(userId, input);

  const reminderId = new mongoose.Types.ObjectId();
  const timing = normalizeTiming(input);
  const reminder = await createReminder({
    _id: reminderId,
    userId,
    createdBy: userId,
    title: input.title,
    description: input.description || "",
    ...timing,
    status: REMINDER_STATUSES.UPCOMING,
    aiGenerated: Boolean(input.aiGenerated),
    aiSuggested: Boolean(input.aiSuggested),
    aiContext: input.aiContext || "",
    aiReason: input.aiReason || "",
    linkedConversationId: input.linkedConversationId,
    linkedMemoryId: input.linkedMemoryId,
    scheduledJobId: buildScheduledJobId(reminderId, timing.nextTriggerAt),
    tags: input.tags || [],
    category: input.category || REMINDER_CATEGORIES.GENERAL,
    priority: input.priority || REMINDER_PRIORITIES.NORMAL,
    recurrence: input.recurrence || { frequency: "none", interval: 1 },
    metadata: input.metadata || {}
  });
  const memory = await saveReminderMemory(userId, reminder);
  const schedule = registerReminderSchedule(reminder);

  return {
    reminder: toReminderResponse(reminder),
    event: buildReminderEvent("reminder.created", reminder),
    memory: {
      id: memory._id.toString(),
      type: memory.type
    },
    schedule
  };
}

export async function updateUserReminder(userId, reminderId, input) {
  const reminder = await findReminderById(reminderId, userId);

  if (!reminder) {
    throw new AppError("Reminder was not found", 404, "REMINDER_NOT_FOUND");
  }

  await assertLinks(userId, input);

  const timingKeys = ["reminderDate", "reminderTime", "timezone", "reminderBefore", "dueAt"];
  const shouldRecomputeTiming = timingKeys.some((key) => input[key] !== undefined);

  if (input.title !== undefined) reminder.title = input.title;
  if (input.description !== undefined) reminder.description = input.description;
  if (input.tags !== undefined) reminder.tags = input.tags;
  if (input.category !== undefined) reminder.category = input.category;
  if (input.priority !== undefined) reminder.priority = input.priority;
  if (input.aiGenerated !== undefined) reminder.aiGenerated = input.aiGenerated;
  if (input.aiSuggested !== undefined) reminder.aiSuggested = input.aiSuggested;
  if (input.aiContext !== undefined) reminder.aiContext = input.aiContext;
  if (input.aiReason !== undefined) reminder.aiReason = input.aiReason;
  if (input.linkedConversationId !== undefined) reminder.linkedConversationId = input.linkedConversationId;
  if (input.linkedMemoryId !== undefined) reminder.linkedMemoryId = input.linkedMemoryId;
  if (input.metadata !== undefined) reminder.metadata = input.metadata;
  if (input.recurrence !== undefined) reminder.recurrence = input.recurrence;

  if (shouldRecomputeTiming) {
    const timing = normalizeTiming(input, reminder);
    Object.assign(reminder, timing);
    reminder.scheduledJobId = buildScheduledJobId(reminder._id, timing.nextTriggerAt);
    reminder.notificationSent = false;
    reminder.notificationSentAt = undefined;
    reminder.notificationError = "";
  }

  if (input.status !== undefined) {
    reminder.status = input.status;
  }

  if (reminder.status !== REMINDER_STATUSES.UPCOMING) {
    reminder.nextTriggerAt = undefined;
  } else if (!reminder.nextTriggerAt) {
    const timing = normalizeTiming({}, reminder);
    reminder.nextTriggerAt = timing.nextTriggerAt;
    reminder.scheduledJobId = buildScheduledJobId(reminder._id, timing.nextTriggerAt);
  }

  await saveReminder(reminder);
  const memory = await saveReminderMemory(userId, reminder);
  const schedule = registerReminderSchedule(reminder);

  return {
    reminder: toReminderResponse(reminder),
    event: buildReminderEvent("reminder.updated", reminder),
    memory: {
      id: memory._id.toString(),
      type: memory.type
    },
    schedule
  };
}

export async function deleteUserReminder(userId, reminderId) {
  const reminder = await findReminderById(reminderId, userId);

  if (!reminder) {
    throw new AppError("Reminder was not found", 404, "REMINDER_NOT_FOUND");
  }

  reminder.status = REMINDER_STATUSES.CANCELLED;
  reminder.nextTriggerAt = undefined;
  reminder.notificationError = "";
  await saveReminder(reminder);

  return {
    reminder: toReminderResponse(reminder),
    event: buildReminderEvent("reminder.cancelled", reminder)
  };
}

export const reminderTime = {
  zonedDateTimeToUtc,
  formatDateTimeInZone,
  normalizeTiming
};
