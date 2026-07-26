import { z } from "zod";

import { SMART_NOTIFICATION_TYPES } from "./smartNotification.model.js";

const sourceSchema = z.record(z.unknown()).default({});

export const listSmartNotificationsSchema = z.object({
  body: z.object({}),
  params: z.object({}),
  query: z.object({
    type: z.enum(Object.values(SMART_NOTIFICATION_TYPES)).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50)
  })
});

export const createFeatureNotificationSchema = z.object({
  body: z.object({
    type: z.enum(Object.values(SMART_NOTIFICATION_TYPES)),
    source: sourceSchema,
    sourceId: z.string().trim().max(160).optional(),
    scheduledFor: z.string().datetime().optional(),
    dedupeKey: z.string().trim().max(240).optional()
  }).strict(),
  params: z.object({}),
  query: z.object({})
});
