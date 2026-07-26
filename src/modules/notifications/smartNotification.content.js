import { SMART_NOTIFICATION_TYPES } from "./smartNotification.model.js";

const SECTION_TITLES = Object.freeze({
  [SMART_NOTIFICATION_TYPES.REMINDER]: "BlueMind • Reminders",
  [SMART_NOTIFICATION_TYPES.LEARNING]: "BlueMind • Learning",
  [SMART_NOTIFICATION_TYPES.SCHEDULE]: "BlueMind • Schedule",
  [SMART_NOTIFICATION_TYPES.AI_PLANS]: "BlueMind • AI Plans",
  [SMART_NOTIFICATION_TYPES.WRITING]: "BlueMind • Writing Mode",
  [SMART_NOTIFICATION_TYPES.CHAT]: "BlueMind • Chat",
  [SMART_NOTIFICATION_TYPES.STUDIO]: "BlueMind • Studio"
});

const DEFAULT_DEEP_LINKS = Object.freeze({
  [SMART_NOTIFICATION_TYPES.REMINDER]: "/mobile/reminders",
  [SMART_NOTIFICATION_TYPES.LEARNING]: "/mobile/learning",
  [SMART_NOTIFICATION_TYPES.SCHEDULE]: "/mobile/schedule",
  [SMART_NOTIFICATION_TYPES.AI_PLANS]: "/mobile/ai-plans",
  [SMART_NOTIFICATION_TYPES.WRITING]: "/mobile/write-edit",
  [SMART_NOTIFICATION_TYPES.CHAT]: "/mobile/chat",
  [SMART_NOTIFICATION_TYPES.STUDIO]: "/mobile/create-image"
});

function clean(value, fallback = "") {
  return String(value || fallback).replace(/\s+/g, " ").trim();
}

function truncate(value, max = 180) {
  const text = clean(value);
  return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text;
}

function minutesLabel(minutes) {
  const value = Number(minutes || 0);
  if (!Number.isFinite(value) || value <= 0) return "";
  if (value === 1) return "in 1 minute";
  if (value < 60) return `in ${value} minutes`;
  if (value === 60) return "in 1 hour";
  if (value % 60 === 0) return `in ${value / 60} hours`;
  return `in ${value} minutes`;
}

function formatLocalDay(date, timezone) {
  if (!date || Number.isNaN(new Date(date).getTime())) return "";

  const nowParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
  const targetParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(date));

  const nowMidday = new Date(`${nowParts}T12:00:00Z`);
  const targetMidday = new Date(`${targetParts}T12:00:00Z`);
  const diffDays = Math.round((targetMidday - nowMidday) / (24 * 60 * 60 * 1000));

  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  return new Intl.DateTimeFormat("en", {
    timeZone: timezone || "UTC",
    weekday: "long",
    month: "short",
    day: "numeric"
  }).format(new Date(date));
}

function buildReminderBody(source = {}) {
  const title = truncate(source.title || source.name || "Your reminder", 160);
  const before = minutesLabel(source.reminderBefore);
  if (before) return `${title} ${before}.`;

  const day = formatLocalDay(source.dueAt || source.date || source.reminderDate, source.timezone);
  const time = clean(source.reminderTime || source.time);
  if (day && time) return `${title} ${day} at ${time}.`;
  if (day) return `${title} ${day}.`;
  return `${title}.`;
}

function buildLearningBody(source = {}) {
  const lesson = clean(source.lessonTitle || source.lesson || "");
  const concept = clean(source.concept || source.lastConcept || "");
  const subject = clean(source.subject || source.lastSubject || "");

  if (lesson) return `${lesson} is ready.`;
  if (concept) return `Continue ${concept}.`;
  if (subject) return `Today's ${subject} lesson is ready.`;
  return "You haven't practiced today.";
}

function buildScheduleBody(source = {}) {
  const count = Number(source.eventsCount || source.count || 0);
  const title = truncate(source.title || source.name || source.eventTitle || "", 160);
  const before = minutesLabel(source.reminderBefore);
  const startTime = clean(source.startTime || source.time || "");

  if (title && before) return `${title} starts ${before}.`;
  if (title && startTime) return `${title} begins at ${startTime}.`;
  if (count > 0) return `Today's schedule has ${count} event${count === 1 ? "" : "s"}.`;
  if (title) return `${title} is on your schedule.`;
  return "Your schedule has been updated.";
}

function buildAiPlansBody(source = {}) {
  const task = clean(source.taskTitle || source.currentTask || "");
  const phase = clean(source.phaseTitle || source.currentPhase || "");
  const plan = truncate(source.planTitle || source.title || "Your plan", 120);
  const status = clean(source.status || "");

  if (task) return `Task "${task}" is waiting.`;
  if (phase) return `Continue ${phase}.`;
  if (/complete/i.test(status)) return `${plan} completed.`;
  return `${plan} is ready.`;
}

function buildWritingBody(source = {}) {
  const documentTitle = truncate(source.documentTitle || source.title || "", 120);
  if (documentTitle) return `${documentTitle} is ready.`;
  if (source.rewritten) return "Your writing has been rewritten.";
  return "Your document is ready.";
}

function buildChatBody(source = {}) {
  const title = truncate(source.conversationTitle || source.title || "", 120);
  if (title) return `AI finished responding in ${title}.`;
  return "AI finished responding.";
}

function buildStudioBody(source = {}) {
  const prompt = truncate(source.prompt || source.title || "", 100);
  const count = Number(source.imageCount || source.count || 0);

  if (prompt && count > 1) return `${count} images for "${prompt}" have been generated.`;
  if (prompt) return `Your image for "${prompt}" has been generated.`;
  return "Your image has been generated.";
}

const BODY_BUILDERS = Object.freeze({
  [SMART_NOTIFICATION_TYPES.REMINDER]: buildReminderBody,
  [SMART_NOTIFICATION_TYPES.LEARNING]: buildLearningBody,
  [SMART_NOTIFICATION_TYPES.SCHEDULE]: buildScheduleBody,
  [SMART_NOTIFICATION_TYPES.AI_PLANS]: buildAiPlansBody,
  [SMART_NOTIFICATION_TYPES.WRITING]: buildWritingBody,
  [SMART_NOTIFICATION_TYPES.CHAT]: buildChatBody,
  [SMART_NOTIFICATION_TYPES.STUDIO]: buildStudioBody
});

export function buildSmartNotificationContent(type, source = {}) {
  const normalizedType = Object.values(SMART_NOTIFICATION_TYPES).includes(type)
    ? type
    : SMART_NOTIFICATION_TYPES.CHAT;
  const title = SECTION_TITLES[normalizedType];
  const body = BODY_BUILDERS[normalizedType]?.(source) || "BlueMind has an update for you.";
  const deepLink = clean(source.deepLink || source.url || DEFAULT_DEEP_LINKS[normalizedType], DEFAULT_DEEP_LINKS[normalizedType]);

  return {
    type: normalizedType,
    title,
    body,
    deepLink
  };
}
