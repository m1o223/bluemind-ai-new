import { z } from "zod";

const objectIdSchema = z.string().trim().regex(/^[0-9a-fA-F]{24}$/, "Invalid privateSpaceId");
const conversationIdSchema = z.string().trim().regex(/^[0-9a-fA-F]{24}$/, "Invalid conversationId");
const imageIdSchema = z.string().trim().regex(/^[0-9a-fA-F]{24}$/, "Invalid imageId");
const pinSchema = z.string().trim().regex(/^\d{4,}$/, "PIN must be at least 4 digits");
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

export const createPrivateSpaceSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1).max(80),
    pin: pinSchema,
    confirmPin: pinSchema
  }).strict().refine((body) => body.pin === body.confirmPin, {
    message: "PINs do not match",
    path: ["confirmPin"]
  }),
  params: z.object({}),
  query: z.object({})
});

export const privateSpaceParamsSchema = z.object({
  body: z.object({}),
  params: z.object({
    id: objectIdSchema
  }),
  query: z.object({})
});

export const unlockPrivateSpaceSchema = z.object({
  body: z.object({
    pin: pinSchema
  }).strict(),
  params: z.object({
    id: objectIdSchema
  }),
  query: z.object({})
});

export const renamePrivateSpaceSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1).max(80)
  }).strict(),
  params: z.object({
    id: objectIdSchema
  }),
  query: z.object({})
});

export const changePrivateSpacePinSchema = z.object({
  body: z.object({
    currentPin: pinSchema,
    newPin: pinSchema,
    confirmNewPin: pinSchema
  }).strict().refine((body) => body.newPin === body.confirmNewPin, {
    message: "PINs do not match",
    path: ["confirmNewPin"]
  }),
  params: z.object({
    id: objectIdSchema
  }),
  query: z.object({})
});

export const privateSpaceChatParamsSchema = z.object({
  body: z.object({}),
  params: z.object({
    id: objectIdSchema
  }),
  query: z.object({})
});

export const privateSpaceConversationParamsSchema = z.object({
  body: z.object({}),
  params: z.object({
    id: objectIdSchema,
    conversationId: conversationIdSchema
  }),
  query: z.object({})
});

export const privateSpaceMessageSchema = z.object({
  body: z.object({
    conversationId: conversationIdSchema.optional(),
    message: z.string().trim().min(1).max(8000).optional(),
    imageIds: z.array(imageIdSchema).max(4).default([]),
    mode: aiModeSchema.optional(),
    metadata: z.record(z.unknown()).optional(),
    privateSpaceAccessToken: z.string().trim().optional()
  }).strict().refine((body) => Boolean(body.message || body.imageIds.length || hasSearchHandoff(body.metadata)), {
    message: "message, imageIds, or search context is required"
  }),
  params: z.object({
    id: objectIdSchema
  }),
  query: z.object({})
});
