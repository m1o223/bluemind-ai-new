import { z } from "zod";

export const analyzeScheduleDocumentSchema = z.object({
  body: z.unknown(),
  params: z.object({}),
  query: z.object({})
});
