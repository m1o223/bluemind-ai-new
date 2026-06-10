import { z } from "zod";

const objectIdSchema = z.string().trim().regex(/^[0-9a-fA-F]{24}$/, "Invalid conversationId");
const imageIdSchema = z.string().trim().regex(/^[0-9a-fA-F]{24}$/, "Invalid imageId");
const aiModeSchema = z.enum([
  "general",
  "study",
  "research",
  "work",
  "writing",
  "cooking",
  "fast",
  "smart",
  "thinking",
  "instant",
  "deep_thinking"
]);

function hasSearchHandoff(metadata) {
  if (!metadata || typeof metadata !== "object") {
    return false;
  }

  const context = metadata.searchContext && typeof metadata.searchContext === "object"
    ? metadata.searchContext
    : metadata;
  const source = String(context.source || metadata.source || "").toLowerCase();
  const intent = String(context.intent || metadata.intent || "");
  const category = String(context.category || metadata.category || "");
  const selectedItem = String(context.selectedItem || metadata.selectedItem || "");

  if (source !== "search" || !category) {
    return false;
  }

  if (intent === "item_not_found") {
    return true;
  }

  return intent === "learn_more_about_selected_item" && Boolean(selectedItem);
}

export const chatMessageSchema = z.object({
  body: z.object({
    conversationId: objectIdSchema.optional(),
    message: z.string().trim().min(1).max(8000).optional(),
    imageIds: z.array(imageIdSchema).max(4).default([]),
    mode: aiModeSchema.optional(),
    metadata: z.record(z.unknown()).optional()
  }).strict().refine((body) => Boolean(body.message || body.imageIds.length || hasSearchHandoff(body.metadata)), {
    message: "message, imageIds, or search context is required"
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
