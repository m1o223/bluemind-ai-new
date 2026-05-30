import { z } from "zod";

const objectIdSchema = z.string().trim().regex(/^[0-9a-fA-F]{24}$/, "Invalid conversationId");
const imageIdSchema = z.string().trim().regex(/^[0-9a-fA-F]{24}$/, "Invalid imageId");

export const chatMessageSchema = z.object({
  body: z.object({
    conversationId: objectIdSchema.optional(),
    message: z.string().trim().min(1).max(8000).optional(),
    imageIds: z.array(imageIdSchema).max(4).default([]),
    mode: z.enum(["fast", "smart", "thinking", "instant", "deep_thinking"]).optional(),
    metadata: z.record(z.unknown()).optional()
  }).strict().refine((body) => Boolean(body.message || body.imageIds.length), {
    message: "message or imageIds is required"
  }),
  params: z.object({}),
  query: z.object({})
});

export const searchConversationsSchema = z.object({
  body: z.object({}),
  params: z.object({}),
  query: z.object({
    q: z.string().trim().min(1).max(120),
    limit: z.coerce.number().int().min(1).max(50).default(20)
  })
});

export const chatConversationParamsSchema = z.object({
  body: z.object({}),
  params: z.object({
    conversationId: objectIdSchema
  }),
  query: z.object({})
});

export const renameConversationSchema = z.object({
  body: z.object({
    title: z.string().trim().min(1).max(120)
  }).strict(),
  params: z.object({
    conversationId: objectIdSchema
  }),
  query: z.object({})
});
