import { z } from "zod";

const sampleSchema = z.object({
  text: z.string().trim().min(20).max(8000),
  source: z.string().trim().max(80).optional(),
  context: z.string().trim().max(120).optional()
}).strict();

export const analyzeWritingProfileSchema = z.object({
  body: z.object({
    samples: z.array(sampleSchema).min(1).max(12),
    updateReason: z.string().trim().max(500).optional()
  }).strict(),
  params: z.object({}).optional(),
  query: z.object({}).optional()
});

export const confirmWritingProfileSchema = z.object({
  body: z.object({
    accepted: z.boolean(),
    adjustments: z.string().trim().max(1000).optional()
  }).strict(),
  params: z.object({}).optional(),
  query: z.object({}).optional()
});
