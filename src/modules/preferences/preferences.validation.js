import { z } from "zod";

import { AI_LANGUAGE_MODES, THEME_VALUES } from "./preferences.constants.js";

const colorSchema = z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/, "Use a hex color like #193B68");
const languageSchema = z.string().trim().min(2).max(35).regex(/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/, "Use a valid BCP-47 language code");

export const preferencesBodySchema = z.object({
  language: languageSchema.optional(),
  appLanguage: languageSchema.optional(),
  aiLanguageMode: z.enum(AI_LANGUAGE_MODES).optional(),
  theme: z.enum(THEME_VALUES).optional(),
  appColor: colorSchema.optional(),
  accentColor: colorSchema.optional(),
  chatColor: colorSchema.optional(),
  notificationsEnabled: z.boolean().optional(),
  openAppDirectlyToChat: z.boolean().optional()
}).strict().refine((body) => Object.keys(body).length > 0, {
  message: "At least one preference is required"
});

export const updatePreferencesSchema = z.object({
  body: preferencesBodySchema,
  params: z.object({}),
  query: z.object({})
});

export const languageParamsSchema = z.object({
  body: z.object({}),
  params: z.object({
    language: languageSchema
  }),
  query: z.object({})
});
