import { z } from "zod";

const objectIdSchema = z.string().trim().regex(/^[0-9a-fA-F]{24}$/, "Invalid memoryId");

const memoryTypeSchema = z.enum(["profile", "preference", "fact", "goal", "project", "instruction", "pinned"]);

const createMemoryBodySchema = z.object({
  type: memoryTypeSchema.default("fact"),
  key: z.string().trim().min(1).max(120).optional(),
  content: z.string().trim().min(1).max(1200),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  importance: z.coerce.number().min(0).max(1).default(0.7),
  confidence: z.coerce.number().min(0).max(1).default(1),
  pinned: z.boolean().default(false),
  metadata: z.record(z.unknown()).optional()
}).strict();

const updateMemoryBodySchema = z.object({
  type: memoryTypeSchema.optional(),
  key: z.string().trim().min(1).max(120).optional(),
  content: z.string().trim().min(1).max(1200).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
  importance: z.coerce.number().min(0).max(1).optional(),
  confidence: z.coerce.number().min(0).max(1).optional(),
  pinned: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional()
}).strict();

export const createMemorySchema = z.object({
  body: createMemoryBodySchema,
  params: z.object({}),
  query: z.object({})
});

export const updateMemorySchema = z.object({
  body: updateMemoryBodySchema.refine((body) => Object.keys(body).length > 0, {
    message: "At least one field is required"
  }),
  params: z.object({
    memoryId: objectIdSchema
  }),
  query: z.object({})
});

export const memoryIdSchema = z.object({
  body: z.object({}),
  params: z.object({
    memoryId: objectIdSchema
  }),
  query: z.object({})
});
