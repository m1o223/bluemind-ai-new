import { z } from "zod";

import {
  MAX_REMINDER_BEFORE_MINUTES,
  REMINDER_CATEGORIES,
  REMINDER_PRIORITIES,
  REMINDER_STATUSES
} from "./reminder.constants.js";

const objectIdSchema = z.string().trim().regex(/^[0-9a-fA-F]{24}$/, "Invalid id");
const dateSchema = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const timeSchema = z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm");

function isValidTimezone(timezone) {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

const timezoneSchema = z.string().trim().min(1).refine(isValidTimezone, {
  message: "Invalid timezone"
});

const metadataSchema = z.record(z.unknown()).optional();

const reminderBodyBaseSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional(),
  reminderDate: dateSchema.optional(),
  reminderTime: timeSchema.optional(),
  timezone: timezoneSchema.optional(),
  reminderBefore: z.coerce.number().int().min(0).max(MAX_REMINDER_BEFORE_MINUTES).optional(),
  dueAt: z.string().datetime().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
  category: z.enum(Object.values(REMINDER_CATEGORIES)).optional(),
  priority: z.enum(Object.values(REMINDER_PRIORITIES)).optional(),
  aiGenerated: z.boolean().optional(),
  aiSuggested: z.boolean().optional(),
  aiContext: z.string().trim().max(4000).optional(),
  aiReason: z.string().trim().max(1000).optional(),
  linkedConversationId: objectIdSchema.optional(),
  linkedMemoryId: objectIdSchema.optional(),
  metadata: metadataSchema
}).strict();

const reminderBodySchema = reminderBodyBaseSchema.refine((body) => {
  const hasDateParts = Boolean(body.reminderDate && body.reminderTime);
  return hasDateParts || Boolean(body.dueAt);
}, {
  message: "reminderDate and reminderTime, or dueAt, are required"
});

const updateReminderBodySchema = reminderBodyBaseSchema.partial().extend({
  status: z.enum(Object.values(REMINDER_STATUSES)).optional()
}).strict().refine((body) => Object.keys(body).length > 0, {
  message: "At least one field is required"
});

const reminderParamsSchema = z.object({
  reminderId: objectIdSchema
});

export const createReminderSchema = z.object({
  body: reminderBodySchema,
  params: z.object({}),
  query: z.object({})
});

export const listRemindersSchema = z.object({
  body: z.object({}),
  params: z.object({}),
  query: z.object({
    status: z.enum(Object.values(REMINDER_STATUSES)).optional(),
    category: z.enum(Object.values(REMINDER_CATEGORIES)).optional(),
    priority: z.enum(Object.values(REMINDER_PRIORITIES)).optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50)
  })
});

export const updateReminderSchema = z.object({
  body: updateReminderBodySchema,
  params: reminderParamsSchema,
  query: z.object({})
});

export const reminderIdSchema = z.object({
  body: z.object({}),
  params: reminderParamsSchema,
  query: z.object({})
});

export const aiExtractReminderSchema = z.object({
  body: z.object({
    message: z.string().trim().min(1).max(4000),
    timezone: timezoneSchema.optional(),
    referenceDate: z.string().datetime().optional(),
    language: z.string().trim().min(2).max(35).optional(),
    linkedConversationId: objectIdSchema.optional()
  }).strict(),
  params: z.object({}),
  query: z.object({})
});

export const aiSuggestReminderSchema = z.object({
  body: z.object({
    message: z.string().trim().min(1).max(4000),
    conversationId: objectIdSchema.optional(),
    timezone: timezoneSchema.optional(),
    referenceDate: z.string().datetime().optional(),
    language: z.string().trim().min(2).max(35).optional()
  }).strict(),
  params: z.object({}),
  query: z.object({})
});

export const registerDeviceSchema = z.object({
  body: z.object({
    token: z.string().trim().min(16).max(4096),
    platform: z.enum(["web", "android", "ios", "unknown"]).default("web"),
    browser: z.string().trim().max(80).optional(),
    deviceId: z.string().trim().max(160).optional(),
    metadata: metadataSchema
  }).strict(),
  params: z.object({}),
  query: z.object({})
});
