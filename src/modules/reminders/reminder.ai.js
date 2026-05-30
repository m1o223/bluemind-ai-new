import { env } from "../../config/env.js";
import { generateJson } from "../ai/ai.service.js";
import { getLanguageName, normalizeLanguage } from "../preferences/preferences.service.js";
import {
  REMINDER_CATEGORIES,
  REMINDER_PRIORITIES
} from "./reminder.constants.js";
import { reminderTime } from "./reminder.service.js";

const reminderShape = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    reminderDate: { type: "string" },
    reminderTime: { type: "string" },
    timezone: { type: "string" },
    reminderBefore: { type: "number" },
    priority: {
      type: "string",
      enum: Object.values(REMINDER_PRIORITIES)
    },
    category: {
      type: "string",
      enum: Object.values(REMINDER_CATEGORIES)
    },
    tags: {
      type: "array",
      items: { type: "string" }
    },
    aiReason: { type: "string" },
    confidence: { type: "number" }
  },
  required: [
    "title",
    "description",
    "reminderDate",
    "reminderTime",
    "timezone",
    "reminderBefore",
    "priority",
    "category",
    "tags",
    "aiReason",
    "confidence"
  ]
};

const extractSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    isReminderIntent: { type: "boolean" },
    reminder: reminderShape,
    missingFields: {
      type: "array",
      items: { type: "string" }
    },
    userFacingQuestion: { type: "string" }
  },
  required: ["isReminderIntent", "reminder", "missingFields", "userFacingQuestion"]
};

const suggestionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    hasSuggestion: { type: "boolean" },
    suggestions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          reason: { type: "string" },
          confidence: { type: "number" },
          askUserText: { type: "string" },
          suggestedReminder: reminderShape
        },
        required: ["title", "reason", "confidence", "askUserText", "suggestedReminder"]
      }
    }
  },
  required: ["hasSuggestion", "suggestions"]
};

function buildTemporalContext({ timezone, referenceDate, language }) {
  const now = referenceDate ? new Date(referenceDate) : new Date();
  const resolvedTimezone = timezone || env.DEFAULT_TIMEZONE;

  return {
    now,
    timezone: resolvedTimezone,
    language: normalizeLanguage(language || "en"),
    languageName: getLanguageName(language || "en"),
    isoNow: now.toISOString(),
    local: reminderTime.formatDateTimeInZone(now, resolvedTimezone)
  };
}

function instructionsForExtraction(context) {
  return [
    "You extract reminder intents for BlueMind AI.",
    "Use ONLY the user's supplied message. Never invent tasks, bills, groceries, meetings, or dates that are not in that message.",
    "Return only structured JSON that matches the schema.",
    `The user's preferred language is ${context.languageName} (${context.language}).`,
    "Return userFacingQuestion and all user-facing strings in the user's preferred language.",
    "Understand Arabic and English natural language dates such as tomorrow, بكرا, next week, بعد ساعة.",
    "If the user clearly asks to be reminded, isReminderIntent must be true.",
    "If date or time is missing, still infer what is reasonable when the sentence strongly implies it, otherwise list missingFields.",
    "Use 24-hour HH:mm time.",
    "For Arabic imperative reminders, remove the reminder phrase from the title. Example: 'ذكرني بكرا الساعة 9 أدرس رياضيات' -> title 'أدرس رياضيات'.",
    "If the message says 'عندي امتحان بكرا' without asking to create a reminder, extraction should usually be false and suggestion should handle it.",
    `Reference UTC time: ${context.isoNow}.`,
    `User timezone: ${context.timezone}.`,
    `Local date: ${context.local.reminderDate}. Local time: ${context.local.reminderTime}.`
  ].join("\n");
}

function instructionsForSuggestions(context) {
  return [
    "You detect proactive reminder opportunities for BlueMind AI.",
    "Use ONLY the user's supplied message. Never invent tasks, bills, groceries, meetings, or dates that are not in that message.",
    "The suggestedReminder.title must be grounded in the exact user message. If the message mentions an exam, mention exam or studying. If it mentions travel, mention travel preparation. If it mentions a meeting, mention the meeting.",
    "Never suggest paying a bill unless the user message mentions a bill, payment, invoice, فاتورة, دفع, or similar payment words.",
    "Suggest reminders only when the user mentions an upcoming obligation, event, travel, exam, meeting, deadline, medication, payment, or preparation need.",
    "Do not create the reminder. Suggest what BlueMind could ask the user.",
    `The user's preferred language is ${context.languageName} (${context.language}).`,
    "Return askUserText, title, reason, and suggested reminder text in the user's preferred language.",
    "Understand Arabic and English.",
    "Use 24-hour HH:mm time and the user's timezone.",
    "Example: 'عندي امتحان بكرا' can suggest asking whether to create a study reminder before the exam.",
    "Example: 'بسافر الأسبوع الجاي' can suggest a packing or travel preparation reminder.",
    `Reference UTC time: ${context.isoNow}.`,
    `User timezone: ${context.timezone}.`,
    `Local date: ${context.local.reminderDate}. Local time: ${context.local.reminderTime}.`
  ].join("\n");
}

function addDays(dateString, days) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function tokenize(value) {
  const stopWords = new Set([
    "عندي",
    "عندك",
    "بكرا",
    "غدا",
    "قبلها",
    "محتاج",
    "احتاج",
    "انا",
    "في",
    "على",
    "من",
    "to",
    "the",
    "a",
    "an",
    "next",
    "tomorrow",
    "important",
    "need"
  ]);

  return new Set((value || "")
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu)
    ?.filter((token) => token.length > 2 && !stopWords.has(token)) || []);
}

function isGroundedSuggestion(suggestion, message) {
  const messageTokens = tokenize(message);
  const suggestionTokens = tokenize([
    suggestion.title,
    suggestion.reason,
    suggestion.askUserText,
    suggestion.suggestedReminder?.title,
    suggestion.suggestedReminder?.description
  ].filter(Boolean).join(" "));

  return [...suggestionTokens].some((token) => messageTokens.has(token));
}

const heuristicCopy = {
  en: {
    exam: {
      title: "Study reminder before the exam",
      reason: "The user mentioned an upcoming exam and may need a reminder to study.",
      askUserText: "Would you like me to create a study reminder before the exam?",
      reminderTitle: "Study before the exam",
      description: "Prepare and review before the exam.",
      aiReason: "Proactive suggestion based on an upcoming exam."
    },
    travel: {
      title: "Travel preparation reminder",
      reason: "The user mentioned upcoming travel and may need a preparation reminder.",
      askUserText: "Would you like me to remind you about what to prepare before travel?",
      reminderTitle: "Prepare travel essentials",
      description: "Review and prepare important items before travel.",
      aiReason: "Proactive suggestion based on upcoming travel."
    },
    meeting: {
      title: "Meeting preparation reminder",
      reason: "The user mentioned a meeting and may need a reminder before it.",
      askUserText: "Would you like me to create a reminder before the meeting?",
      reminderTitle: "Prepare for the meeting",
      description: "Prepare important notes or files before the meeting.",
      aiReason: "Proactive suggestion based on a mentioned meeting."
    }
  },
  ar: {
    exam: {
      title: "تذكير بالمراجعة قبل الامتحان",
      reason: "المستخدم ذكر امتحانًا قادمًا وقد يحتاج تذكيرًا للمراجعة.",
      askUserText: "شو رأيك أنشئ لك تذكير للمراجعة قبل الامتحان؟",
      reminderTitle: "مراجعة قبل الامتحان",
      description: "الاستعداد والمراجعة قبل الامتحان.",
      aiReason: "اقتراح ذكي بناءً على امتحان قادم."
    },
    travel: {
      title: "تذكير بتجهيز السفر",
      reason: "المستخدم ذكر سفرًا قادمًا وقد يحتاج تذكيرًا للتحضير.",
      askUserText: "شو رأيك أذكرك بالأشياء اللي لازم تجهزها قبل السفر؟",
      reminderTitle: "تجهيز أغراض السفر",
      description: "مراجعة وتجهيز الأشياء المهمة قبل السفر.",
      aiReason: "اقتراح ذكي بناءً على سفر قادم."
    },
    meeting: {
      title: "تذكير بالاستعداد للاجتماع",
      reason: "المستخدم ذكر اجتماعًا وقد يحتاج تذكيرًا قبل الموعد.",
      askUserText: "هل تحب أنشئ لك تذكيرًا قبل الاجتماع؟",
      reminderTitle: "الاستعداد للاجتماع",
      description: "تحضير النقاط أو الملفات المهمة قبل الاجتماع.",
      aiReason: "اقتراح ذكي بناءً على اجتماع مذكور."
    }
  },
  sv: {
    exam: {
      title: "Studiepåminnelse inför provet",
      reason: "Användaren nämnde ett kommande prov och kan behöva en påminnelse om att plugga.",
      askUserText: "Vill du att jag skapar en påminnelse om att plugga inför provet?",
      reminderTitle: "Plugga inför provet",
      description: "Förbered dig och repetera inför provet.",
      aiReason: "Proaktivt förslag baserat på ett kommande prov."
    },
    travel: {
      title: "Påminnelse om reseförberedelser",
      reason: "Användaren nämnde en kommande resa och kan behöva en påminnelse om förberedelser.",
      askUserText: "Vill du att jag påminner dig om vad du behöver förbereda inför resan?",
      reminderTitle: "Förbered det viktiga inför resan",
      description: "Gå igenom och förbered viktiga saker inför resan.",
      aiReason: "Proaktivt förslag baserat på en kommande resa."
    },
    meeting: {
      title: "Påminnelse om mötesförberedelser",
      reason: "Användaren nämnde ett möte och kan behöva en påminnelse innan det börjar.",
      askUserText: "Vill du att jag skapar en påminnelse inför mötet?",
      reminderTitle: "Förbered dig inför mötet",
      description: "Förbered viktiga punkter eller filer inför mötet.",
      aiReason: "Proaktivt förslag baserat på ett nämnt möte."
    }
  },
  fr: {
    exam: {
      title: "Rappel de révision avant l'examen",
      reason: "L'utilisateur a mentionné un examen à venir et peut avoir besoin d'un rappel pour réviser.",
      askUserText: "Voulez-vous que je crée un rappel pour réviser avant l'examen ?",
      reminderTitle: "Réviser avant l'examen",
      description: "Préparer et réviser avant l'examen.",
      aiReason: "Suggestion proactive basée sur un examen à venir."
    },
    travel: {
      title: "Rappel de préparation de voyage",
      reason: "L'utilisateur a mentionné un voyage à venir et peut avoir besoin d'un rappel de préparation.",
      askUserText: "Voulez-vous que je vous rappelle quoi préparer avant le voyage ?",
      reminderTitle: "Préparer les essentiels du voyage",
      description: "Vérifier et préparer les éléments importants avant le voyage.",
      aiReason: "Suggestion proactive basée sur un voyage à venir."
    },
    meeting: {
      title: "Rappel de préparation de réunion",
      reason: "L'utilisateur a mentionné une réunion et peut avoir besoin d'un rappel avant celle-ci.",
      askUserText: "Voulez-vous que je crée un rappel avant la réunion ?",
      reminderTitle: "Préparer la réunion",
      description: "Préparer les points ou fichiers importants avant la réunion.",
      aiReason: "Suggestion proactive basée sur une réunion mentionnée."
    }
  },
  hi: {
    exam: {
      title: "परीक्षा से पहले पढ़ाई का रिमाइंडर",
      reason: "उपयोगकर्ता ने आने वाली परीक्षा का ज़िक्र किया है और उसे पढ़ाई के लिए रिमाइंडर चाहिए हो सकता है।",
      askUserText: "क्या आप चाहते हैं कि मैं परीक्षा से पहले पढ़ाई का रिमाइंडर बना दूँ?",
      reminderTitle: "परीक्षा से पहले पढ़ाई करें",
      description: "परीक्षा से पहले तैयारी और रिविज़न करें।",
      aiReason: "आने वाली परीक्षा के आधार पर सक्रिय सुझाव।"
    },
    travel: {
      title: "यात्रा तैयारी रिमाइंडर",
      reason: "उपयोगकर्ता ने आने वाली यात्रा का ज़िक्र किया है और उसे तैयारी के लिए रिमाइंडर चाहिए हो सकता है।",
      askUserText: "क्या आप चाहते हैं कि मैं यात्रा से पहले तैयारी की चीज़ों के लिए रिमाइंडर दूँ?",
      reminderTitle: "यात्रा की ज़रूरी चीज़ें तैयार करें",
      description: "यात्रा से पहले ज़रूरी चीज़ें जाँचें और तैयार करें।",
      aiReason: "आने वाली यात्रा के आधार पर सक्रिय सुझाव।"
    },
    meeting: {
      title: "मीटिंग तैयारी रिमाइंडर",
      reason: "उपयोगकर्ता ने मीटिंग का ज़िक्र किया है और उसे पहले से रिमाइंडर चाहिए हो सकता है।",
      askUserText: "क्या आप चाहते हैं कि मैं मीटिंग से पहले रिमाइंडर बना दूँ?",
      reminderTitle: "मीटिंग की तैयारी करें",
      description: "मीटिंग से पहले ज़रूरी नोट्स या फाइलें तैयार करें।",
      aiReason: "बताई गई मीटिंग के आधार पर सक्रिय सुझाव।"
    }
  }
};

function getHeuristicCopy(kind, context) {
  const language = context.language.split("-")[0];
  return (heuristicCopy[language] || heuristicCopy.en)[kind];
}

function createHeuristicSuggestion({
  kind,
  context,
  reminderDate,
  reminderTime,
  reminderBefore,
  priority,
  category,
  tags,
  confidence
}) {
  const copy = getHeuristicCopy(kind, context);

  return {
    title: copy.title,
    reason: copy.reason,
    confidence,
    askUserText: copy.askUserText,
    suggestedReminder: normalizeReminder({
      title: copy.reminderTitle,
      description: copy.description,
      reminderDate,
      reminderTime,
      timezone: context.timezone,
      reminderBefore,
      priority,
      category,
      tags,
      aiReason: copy.aiReason,
      confidence
    }, context.timezone)
  };
}

function buildLocalizedHeuristicSuggestion({ lower, context, reminderDate }) {
  if (/امتحان|اختبار|exam|test/u.test(lower)) {
    return createHeuristicSuggestion({
      kind: "exam",
      context,
      reminderDate,
      reminderTime: "08:00",
      reminderBefore: 60,
      priority: REMINDER_PRIORITIES.HIGH,
      category: REMINDER_CATEGORIES.STUDY,
      tags: ["exam", "study"],
      confidence: 0.82
    });
  }

  if (/سفر|بسافر|رحلة|travel|trip|flight/u.test(lower)) {
    return createHeuristicSuggestion({
      kind: "travel",
      context,
      reminderDate,
      reminderTime: "18:00",
      reminderBefore: 0,
      priority: REMINDER_PRIORITIES.NORMAL,
      category: REMINDER_CATEGORIES.TRAVEL,
      tags: ["travel", "packing"],
      confidence: 0.78
    });
  }

  if (/اجتماع|موعد|meeting/u.test(lower)) {
    return createHeuristicSuggestion({
      kind: "meeting",
      context,
      reminderDate,
      reminderTime: "09:00",
      reminderBefore: 30,
      priority: REMINDER_PRIORITIES.HIGH,
      category: REMINDER_CATEGORIES.WORK,
      tags: ["meeting"],
      confidence: 0.76
    });
  }

  return null;
}

export function buildHeuristicSuggestion(message, context) {
  const lower = message.toLowerCase();
  const isTomorrow = /بكرا|غد|tomorrow/.test(lower);
  const isNextWeek = /الأسبوع الجاي|الاسبوع الجاي|next week/.test(lower);
  const reminderDate = isNextWeek
    ? addDays(context.local.reminderDate, 7)
    : isTomorrow
      ? addDays(context.local.reminderDate, 1)
      : context.local.reminderDate;
  const localizedSuggestion = buildLocalizedHeuristicSuggestion({ lower, context, reminderDate });

  if (localizedSuggestion) {
    return localizedSuggestion;
  }

  if (/امتحان|اختبار|exam|test/.test(lower)) {
    return {
      title: "تذكير بالمراجعة قبل الامتحان",
      reason: "المستخدم ذكر امتحانًا قادمًا وقد يحتاج تذكيرًا للمراجعة.",
      confidence: 0.82,
      askUserText: "شو رأيك أنشئ لك تذكير للمراجعة قبل الامتحان؟",
      suggestedReminder: normalizeReminder({
        title: "مراجعة قبل الامتحان",
        description: "الاستعداد والمراجعة قبل الامتحان.",
        reminderDate,
        reminderTime: "08:00",
        timezone: context.timezone,
        reminderBefore: 60,
        priority: REMINDER_PRIORITIES.HIGH,
        category: REMINDER_CATEGORIES.STUDY,
        tags: ["exam", "study"],
        aiReason: "Proactive suggestion based on an upcoming exam.",
        confidence: 0.82
      }, context.timezone)
    };
  }

  if (/سفر|بسافر|رحلة|travel|trip|flight/.test(lower)) {
    return {
      title: "تذكير بتجهيز السفر",
      reason: "المستخدم ذكر سفرًا قادمًا وقد يحتاج تذكيرًا للتحضير.",
      confidence: 0.78,
      askUserText: "شو رأيك أذكرك بالأشياء اللي لازم تجهزها قبل السفر؟",
      suggestedReminder: normalizeReminder({
        title: "تجهيز أغراض السفر",
        description: "مراجعة وتجهيز الأشياء المهمة قبل السفر.",
        reminderDate,
        reminderTime: "18:00",
        timezone: context.timezone,
        reminderBefore: 0,
        priority: REMINDER_PRIORITIES.NORMAL,
        category: REMINDER_CATEGORIES.TRAVEL,
        tags: ["travel", "packing"],
        aiReason: "Proactive suggestion based on upcoming travel.",
        confidence: 0.78
      }, context.timezone)
    };
  }

  if (/اجتماع|meeting|موعد/.test(lower)) {
    return {
      title: "تذكير بالاستعداد للاجتماع",
      reason: "المستخدم ذكر اجتماعًا وقد يحتاج تذكيرًا قبل الموعد.",
      confidence: 0.76,
      askUserText: "هل تحب أنشئ لك تذكيرًا قبل الاجتماع؟",
      suggestedReminder: normalizeReminder({
        title: "الاستعداد للاجتماع",
        description: "تحضير النقاط أو الملفات المهمة قبل الاجتماع.",
        reminderDate,
        reminderTime: "09:00",
        timezone: context.timezone,
        reminderBefore: 30,
        priority: REMINDER_PRIORITIES.HIGH,
        category: REMINDER_CATEGORIES.WORK,
        tags: ["meeting"],
        aiReason: "Proactive suggestion based on a mentioned meeting.",
        confidence: 0.76
      }, context.timezone)
    };
  }

  return null;
}

function normalizeReminder(reminder, fallbackTimezone) {
  const timezone = reminder.timezone || fallbackTimezone;
  const timing = reminderTime.normalizeTiming({
    reminderDate: reminder.reminderDate,
    reminderTime: reminder.reminderTime,
    timezone,
    reminderBefore: reminder.reminderBefore
  });

  return {
    title: reminder.title,
    description: reminder.description || "",
    reminderDate: timing.reminderDate,
    reminderTime: timing.reminderTime,
    timezone: timing.timezone,
    reminderBefore: timing.reminderBefore,
    dueAt: timing.dueAt,
    nextTriggerAt: timing.nextTriggerAt,
    priority: reminder.priority || REMINDER_PRIORITIES.NORMAL,
    category: reminder.category || REMINDER_CATEGORIES.GENERAL,
    tags: reminder.tags || [],
    aiReason: reminder.aiReason || "",
    confidence: Math.max(0, Math.min(1, Number(reminder.confidence || 0)))
  };
}

export async function extractReminderIntent({ message, timezone, referenceDate, language }) {
  const context = buildTemporalContext({ timezone, referenceDate, language });
  const result = await generateJson({
    name: "reminder_intent_extraction",
    schema: extractSchema,
    instructions: instructionsForExtraction(context),
    input: [
      {
        role: "user",
        content: [
          "Analyze this exact user message for a reminder intent.",
          "Do not use examples or any prior conversation.",
          `USER_MESSAGE: ${message}`
        ].join("\n")
      }
    ],
    temperature: 0.1
  });
  const extracted = result.data;

  if (!extracted.isReminderIntent) {
    return {
      isReminderIntent: false,
      reminder: null,
      missingFields: extracted.missingFields || [],
      userFacingQuestion: extracted.userFacingQuestion || "",
      ai: result.metadata
    };
  }

  return {
    isReminderIntent: true,
    reminder: normalizeReminder(extracted.reminder, context.timezone),
    missingFields: extracted.missingFields || [],
    userFacingQuestion: extracted.userFacingQuestion || "",
    ai: result.metadata
  };
}

export async function suggestReminderOpportunities({ message, timezone, referenceDate, language }) {
  const context = buildTemporalContext({ timezone, referenceDate, language });
  const highConfidenceFallback = buildHeuristicSuggestion(message, context);

  if (highConfidenceFallback) {
    return {
      hasSuggestion: true,
      suggestions: [highConfidenceFallback],
      ai: {
        provider: "hybrid",
        model: "heuristic-guardrail",
        reason: "high-confidence reminder opportunity detected before model call"
      }
    };
  }

  const result = await generateJson({
    name: "reminder_opportunity_suggestions",
    schema: suggestionSchema,
    instructions: instructionsForSuggestions(context),
    input: [
      {
        role: "user",
        content: [
          "Analyze this exact user message for proactive reminder suggestions.",
          "Do not use examples or any prior conversation.",
          `USER_MESSAGE: ${message}`
        ].join("\n")
      }
    ],
    temperature: 0.2
  });

  const suggestions = (result.data.suggestions || []).map((suggestion) => ({
      title: suggestion.title,
      reason: suggestion.reason,
      confidence: Math.max(0, Math.min(1, Number(suggestion.confidence || 0))),
      askUserText: suggestion.askUserText,
      suggestedReminder: normalizeReminder(suggestion.suggestedReminder, context.timezone)
    }))
    .filter((suggestion) => isGroundedSuggestion(suggestion, message));
  const fallback = suggestions.length ? null : buildHeuristicSuggestion(message, context);
  const groundedSuggestions = fallback ? [fallback] : suggestions;

  return {
    hasSuggestion: groundedSuggestions.length > 0 && Boolean(result.data.hasSuggestion || fallback),
    suggestions: groundedSuggestions,
    ai: result.metadata
  };
}
