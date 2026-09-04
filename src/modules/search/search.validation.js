import { z } from "zod";

const empty = z.object({}).strict();

export const universalSearchSchema = z.object({
  body: empty,
  params: empty,
  query: z.object({
    q: z.string().trim().min(1).max(120),
    type: z.enum(["all", "chats", "images", "documents", "projects"]).default("all"),
    limit: z.coerce.number().int().min(1).max(50).default(30)
  }).strict()
});
