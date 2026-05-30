import { z } from "zod";

const objectIdSchema = z.string().trim().regex(/^[0-9a-fA-F]{24}$/, "Invalid id");

export const uploadImageSchema = z.object({
  body: z.object({
    fileName: z.string().trim().min(1).max(180).default("image"),
    mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]).optional(),
    dataBase64: z.string().min(1).optional(),
    dataUrl: z.string().min(1).optional(),
    conversationId: objectIdSchema.optional(),
    metadata: z.record(z.unknown()).optional()
  }).strict().refine((body) => Boolean(body.dataUrl || (body.dataBase64 && body.mimeType)), {
    message: "Provide dataUrl or dataBase64 with mimeType"
  }),
  params: z.object({}),
  query: z.object({})
});

export const binaryUploadQuerySchema = z.object({
  body: z.unknown(),
  params: z.object({}),
  query: z.object({
    conversationId: objectIdSchema.optional()
  })
});

export const imageIdSchema = z.object({
  body: z.object({}).optional().default({}),
  params: z.object({
    imageId: objectIdSchema
  }),
  query: z.object({})
});

export const analyzeImageSchema = z.object({
  body: z.object({
    prompt: z.string().trim().min(1).max(4000).optional()
  }).strict(),
  params: z.object({
    imageId: objectIdSchema
  }),
  query: z.object({})
});

export const generateImageSchema = z.object({
  body: z.object({
    prompt: z.string().trim().min(1).max(32000),
    conversationId: objectIdSchema.optional(),
    n: z.coerce.number().int().min(1).max(4).default(1),
    size: z.enum(["auto", "1024x1024", "1536x1024", "1024x1536"]).default("1024x1024"),
    quality: z.enum(["low", "medium", "high", "auto"]).default("auto"),
    outputFormat: z.enum(["png", "jpeg", "webp"]).default("png"),
    background: z.enum(["transparent", "opaque", "auto"]).default("auto"),
    metadata: z.record(z.unknown()).optional()
  }).strict(),
  params: z.object({}),
  query: z.object({})
});

export const listImagesSchema = z.object({
  body: z.object({}).optional().default({}),
  params: z.object({}),
  query: z.object({
    kind: z.enum(["upload", "generated"]).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50)
  })
});
