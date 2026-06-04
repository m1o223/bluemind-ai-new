import { z } from "zod";

import { AI_LANGUAGE_MODES, THEME_VALUES } from "./preferences.constants.js";

const colorSchema = z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/, "Use a hex color like #193B68");
const languageSchema = z.string().trim().min(2).max(35).regex(/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/, "Use a valid BCP-47 language code");
const notificationPreferencesSchema = z.object({
  ai: z.object({
    taskCompleted: z.boolean().optional(),
    researchCompleted: z.boolean().optional(),
    imageGenerationCompleted: z.boolean().optional(),
    longRunningTaskCompleted: z.boolean().optional(),
    recommendations: z.boolean().optional()
  }).partial().optional(),
  reminders: z.object({
    alerts: z.boolean().optional(),
    daily: z.boolean().optional(),
    weekly: z.boolean().optional(),
    missed: z.boolean().optional(),
    overdue: z.boolean().optional()
  }).partial().optional(),
  studyPlan: z.object({
    sessionReminders: z.boolean().optional(),
    dailyGoals: z.boolean().optional(),
    weeklyProgress: z.boolean().optional(),
    missedSessions: z.boolean().optional(),
    streakAlerts: z.boolean().optional()
  }).partial().optional(),
  calendar: z.object({
    upcomingEvents: z.boolean().optional(),
    eventStartingSoon: z.boolean().optional(),
    eventReminders: z.boolean().optional(),
    calendarChanges: z.boolean().optional()
  }).partial().optional(),
  email: z.object({
    importantAccountEmails: z.boolean().optional(),
    securityEmails: z.boolean().optional(),
    notificationSummaries: z.boolean().optional(),
    marketingEmails: z.boolean().optional()
  }).partial().optional(),
  security: z.object({
    newLoginDetected: z.boolean().optional(),
    passwordChanged: z.boolean().optional(),
    emailChanged: z.boolean().optional(),
    securityAlerts: z.boolean().optional(),
    accountActivityAlerts: z.boolean().optional()
  }).partial().optional(),
  projects: z.object({
    updates: z.boolean().optional(),
    sharedActivity: z.boolean().optional(),
    deadlines: z.boolean().optional(),
    reminders: z.boolean().optional()
  }).partial().optional(),
  system: z.object({
    newFeatures: z.boolean().optional(),
    appUpdates: z.boolean().optional(),
    maintenanceAnnouncements: z.boolean().optional(),
    serviceAlerts: z.boolean().optional()
  }).partial().optional(),
  channels: z.object({
    push: z.boolean().optional(),
    email: z.boolean().optional(),
    inApp: z.boolean().optional()
  }).partial().optional()
}).partial().optional();

export const preferencesBodySchema = z.object({
  language: languageSchema.optional(),
  appLanguage: languageSchema.optional(),
  aiLanguageMode: z.enum(AI_LANGUAGE_MODES).optional(),
  theme: z.enum(THEME_VALUES).optional(),
  appColor: colorSchema.optional(),
  accentColor: colorSchema.optional(),
  chatColor: colorSchema.optional(),
  notificationsEnabled: z.boolean().optional(),
  notificationPreferences: notificationPreferencesSchema,
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
