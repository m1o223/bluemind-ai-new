import { z } from "zod";

const objectIdSchema = z.string().trim().regex(/^[0-9a-fA-F]{24}$/, "Invalid image id");

export const analyzeTimetableSchema = z.object({
  body: z.object({
    imageId: objectIdSchema,
    languageHint: z.string().trim().max(35).optional()
  }).strict(),
  params: z.object({}),
  query: z.object({})
});
