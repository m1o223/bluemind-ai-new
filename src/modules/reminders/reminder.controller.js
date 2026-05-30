import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendResponse } from "../../utils/sendResponse.js";
import {
  REMINDER_CATEGORIES,
  REMINDER_PRIORITIES
} from "./reminder.constants.js";
import {
  buildHeuristicSuggestion,
  extractReminderIntent,
  suggestReminderOpportunities
} from "./reminder.ai.js";
import { registerReminderDevice } from "./reminder.notification.js";
import { reminderTime } from "./reminder.service.js";
import {
  createUserReminder,
  deleteUserReminder,
  getUserReminder,
  listUserReminders,
  updateUserReminder
} from "./reminder.service.js";

function buildSuggestionFallback(input) {
  const timezone = input.timezone || "UTC";
  const now = input.referenceDate ? new Date(input.referenceDate) : new Date();
  const local = reminderTime.formatDateTimeInZone(now, timezone);
  const heuristic = buildHeuristicSuggestion(input.message, { timezone, local });

  if (heuristic) {
    return heuristic;
  }

  const lower = input.message.toLowerCase();

  if (!/deadline|موعد نهائي|تسليم/.test(lower)) {
    return null;
  }

  return {
    title: "تذكير قبل الموعد النهائي",
    reason: "المستخدم ذكر موعدًا نهائيًا وقد يحتاج تذكيرًا قبل التسليم.",
    confidence: 0.74,
    askUserText: "هل تحب أنشئ لك تذكيرًا قبل الموعد النهائي؟",
    suggestedReminder: {
      title: "الاستعداد قبل الموعد النهائي",
      description: "مراجعة المطلوب قبل الموعد النهائي.",
      reminderDate: local.reminderDate,
      reminderTime: "09:00",
      timezone,
      reminderBefore: 120,
      dueAt: reminderTime.normalizeTiming({
        reminderDate: local.reminderDate,
        reminderTime: "09:00",
        timezone,
        reminderBefore: 120
      }).dueAt,
      nextTriggerAt: reminderTime.normalizeTiming({
        reminderDate: local.reminderDate,
        reminderTime: "09:00",
        timezone,
        reminderBefore: 120
      }).nextTriggerAt,
      priority: REMINDER_PRIORITIES.HIGH,
      category: REMINDER_CATEGORIES.WORK,
      tags: ["deadline"],
      aiReason: "Fallback suggestion for a mentioned deadline.",
      confidence: 0.74
    }
  };
}

export const listReminders = asyncHandler(async (req, res) => {
  const reminders = await listUserReminders(req.user._id, req.validated.query);
  sendResponse(res, 200, { reminders });
});

export const getReminder = asyncHandler(async (req, res) => {
  const reminder = await getUserReminder(req.user._id, req.validated.params.reminderId);
  sendResponse(res, 200, { reminder });
});

export const createReminder = asyncHandler(async (req, res) => {
  const result = await createUserReminder(req.user._id, req.validated.body);

  req.log.info({
    reminderId: result.reminder.id,
    nextTriggerAt: result.reminder.schedule.nextTriggerAt
  }, "Reminder created");
  sendResponse(res, 201, result);
});

export const updateReminder = asyncHandler(async (req, res) => {
  const result = await updateUserReminder(
    req.user._id,
    req.validated.params.reminderId,
    req.validated.body
  );

  req.log.info({ reminderId: result.reminder.id }, "Reminder updated");
  sendResponse(res, 200, result);
});

export const deleteReminder = asyncHandler(async (req, res) => {
  const result = await deleteUserReminder(req.user._id, req.validated.params.reminderId);

  req.log.info({ reminderId: result.reminder.id }, "Reminder cancelled");
  sendResponse(res, 200, result);
});

export const aiExtractReminder = asyncHandler(async (req, res) => {
  const result = await extractReminderIntent({
    ...req.validated.body,
    language: req.validated.body.language || req.user.preferences?.language
  });
  sendResponse(res, 200, result);
});

export const aiSuggestReminder = asyncHandler(async (req, res) => {
  const request = {
    ...req.validated.body,
    language: req.validated.body.language || req.user.preferences?.language
  };
  const result = await suggestReminderOpportunities(request);

  if (!result.hasSuggestion) {
    const fallback = buildSuggestionFallback(request);

    if (fallback) {
      sendResponse(res, 200, {
        hasSuggestion: true,
        suggestions: [fallback],
        ai: {
          ...result.ai,
          guardrailFallback: true
        }
      });
      return;
    }
  }

  sendResponse(res, 200, result);
});

export const registerDevice = asyncHandler(async (req, res) => {
  const device = await registerReminderDevice(req.user._id, req.validated.body);

  req.log.info({ deviceId: device.id, platform: device.platform }, "Reminder device token registered");
  sendResponse(res, 201, { device });
});
