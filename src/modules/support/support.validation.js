import { z } from "zod";

const dataUrlSchema = z.string().trim().regex(/^data:[^;]+;base64,[A-Za-z0-9+/=]+$/, "Attachment must be a base64 data URL");

export const reportIssueSchema = z.object({
  body: z.object({
    title: z.string().trim().min(3).max(140),
    description: z.string().trim().min(10).max(6000),
    platform: z.enum(["desktop", "mobile"]).default("desktop"),
    appVersion: z.string().trim().min(1).max(40).default("0.1.0"),
    attachments: z.array(z.object({
      name: z.string().trim().min(1).max(160),
      type: z.string().trim().min(1).max(120),
      size: z.number().int().min(1).max(8 * 1024 * 1024),
      dataUrl: dataUrlSchema
    })).max(3).default([])
  }),
  params: z.object({}),
  query: z.object({})
});
