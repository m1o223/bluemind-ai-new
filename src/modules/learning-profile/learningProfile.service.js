import { logger } from "../../config/logger.js";
import { generateJson } from "../ai/ai.service.js";
import { LearningProfile } from "./learningProfile.model.js";
import { LEARNING_PROFILE_CONTEXT_RULES, LEARNING_PROFILE_EXTRACTION_PROMPT } from "./learningProfile.prompt.js";

const MAX_LIST_ITEMS = 12;
const MAX_METHODS = 10;
const LEARNING_FLAG_KEYS = [
  "prefersExamples",
  "prefersShortExplanations",
  "prefersStepByStep",
  "prefersVisuals",
  "strugglesWithFormulas",
  "strugglesWithTechnicalTerms",
  "prefersLightHumor",
  "prefersSeriousTone"
];

const learningProfileUpdateSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    isLearningRelated: { type: "boolean" },
    hasUsefulLearningSignal: { type: "boolean" },
    preferredExplanationStyles: {
      type: "array",
      items: { type: "string" }
    },
    preferredExamplesStyle: {
      type: "array",
      items: { type: "string" }
    },
    preferredTone: { type: "string" },
    subjectsUserStrugglesWith: {
      type: "array",
      items: { type: "string" }
    },
    conceptsUserStrugglesWith: {
      type: "array",
      items: { type: "string" }
    },
    methodsWorked: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          method: { type: "string" },
          evidence: { type: "string" },
          confidence: { type: "number" }
        },
        required: ["method", "evidence", "confidence"]
      }
    },
    methodsFailed: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          method: { type: "string" },
          evidence: { type: "string" },
          confidence: { type: "number" }
        },
        required: ["method", "evidence", "confidence"]
      }
    },
    flags: {
      type: "object",
      additionalProperties: false,
      properties: {
        prefersExamples: { type: "boolean" },
        prefersShortExplanations: { type: "boolean" },
        prefersStepByStep: { type: "boolean" },
        prefersVisuals: { type: "boolean" },
        strugglesWithFormulas: { type: "boolean" },
        strugglesWithTechnicalTerms: { type: "boolean" },
        prefersLightHumor: { type: "boolean" },
        prefersSeriousTone: { type: "boolean" }
      },
      required: [
        "prefersExamples",
        "prefersShortExplanations",
        "prefersStepByStep",
        "prefersVisuals",
        "strugglesWithFormulas",
        "strugglesWithTechnicalTerms",
        "prefersLightHumor",
        "prefersSeriousTone"
      ]
    },
    lastLearningContext: {
      type: "object",
      additionalProperties: false,
      properties: {
        subject: { type: "string" },
        concept: { type: "string" }
      },
      required: ["subject", "concept"]
    }
  },
  required: [
    "isLearningRelated",
    "hasUsefulLearningSignal",
    "preferredExplanationStyles",
    "preferredExamplesStyle",
    "preferredTone",
    "subjectsUserStrugglesWith",
    "conceptsUserStrugglesWith",
    "methodsWorked",
    "methodsFailed",
    "flags",
    "lastLearningContext"
  ]
};

const LEARNING_KEYWORDS = [
  "study", "school", "homework", "exam", "lesson", "explain", "understand", "confused",
  "formula", "science", "math", "physics", "chemistry", "biology", "history", "geography",
  "research", "essay", "report", "summary", "summarize", "chapter", "teacher", "grade",
  "learn", "concept", "example", "step by step", "diagram", "newton", "electricity",
  "ما فهمت", "مش فاهم", "مدري", "ما بعرف", "اشرح", "درس", "واجب", "امتحان", "مدرسة",
  "رياضيات", "فيزياء", "كيمياء", "أحياء", "تاريخ", "جغرافيا", "بحث"
];

function compactText(value, max = 160) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function normalizeList(values, maxItems = MAX_LIST_ITEMS) {
  const seen = new Set();
  const result = [];

  for (const value of values || []) {
    const item = compactText(value, 120);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= maxItems) break;
  }

  return result;
}

function mergeList(existing = [], incoming = [], maxItems = MAX_LIST_ITEMS) {
  return normalizeList([...incoming, ...existing], maxItems);
}

function normalizeConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0.7;
  return Math.min(Math.max(number, 0), 1);
}

function mergeMethods(existing = [], incoming = []) {
  const byMethod = new Map();
  const now = new Date();

  for (const item of existing || []) {
    const method = compactText(item.method, 80);
    if (method) {
      byMethod.set(method.toLowerCase(), {
        method,
        evidence: compactText(item.evidence, 240),
        confidence: normalizeConfidence(item.confidence),
        lastSeenAt: item.lastSeenAt || now
      });
    }
  }

  for (const item of incoming || []) {
    const method = compactText(item.method, 80);
    if (!method) continue;
    byMethod.set(method.toLowerCase(), {
      method,
      evidence: compactText(item.evidence, 240),
      confidence: normalizeConfidence(item.confidence),
      lastSeenAt: now
    });
  }

  return [...byMethod.values()]
    .sort((a, b) => new Date(b.lastSeenAt) - new Date(a.lastSeenAt))
    .slice(0, MAX_METHODS);
}

function hasEducationalSignal(text) {
  const normalized = String(text || "").toLowerCase();
  return LEARNING_KEYWORDS.some((keyword) => normalized.includes(keyword.toLowerCase()));
}

function serializeRecentMessages(conversation, limit = 8) {
  return conversation.messages
    .filter((message) => !message.metadata?.hiddenFromChat)
    .slice(-limit)
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n");
}

function formatMethods(methods) {
  return (methods || [])
    .filter((item) => item.method)
    .map((item) => `- ${item.method}${item.evidence ? ` (${item.evidence})` : ""}`)
    .join("\n");
}

export async function getOrCreateLearningProfile(user) {
  const userId = user?._id || user;
  if (!userId) return null;

  return LearningProfile.findOneAndUpdate(
    { userId },
    {
      $set: {
        email: user?.email || "",
        username: user?.name || ""
      },
      $setOnInsert: {
        userId
      }
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true
    }
  );
}

export function buildLearningProfileContext(profile) {
  if (!profile) {
    return LEARNING_PROFILE_CONTEXT_RULES;
  }

  const sections = [LEARNING_PROFILE_CONTEXT_RULES];
  const flags = profile.flags || {};
  const activeFlags = LEARNING_FLAG_KEYS.filter((key) => flags[key] === true);

  const profileLines = [
    profile.preferredExplanationStyles?.length ? `- Preferred explanation styles: ${profile.preferredExplanationStyles.join(", ")}` : "",
    profile.preferredExamplesStyle?.length ? `- Examples that help: ${profile.preferredExamplesStyle.join(", ")}` : "",
    profile.preferredTone ? `- Preferred tone: ${profile.preferredTone}` : "",
    profile.subjectsUserStrugglesWith?.length ? `- Subjects the user struggles with: ${profile.subjectsUserStrugglesWith.join(", ")}` : "",
    profile.conceptsUserStrugglesWith?.length ? `- Concepts the user struggles with: ${profile.conceptsUserStrugglesWith.join(", ")}` : "",
    activeFlags.length ? `- Learning flags: ${activeFlags.join(", ")}` : "",
    profile.methodsWorked?.length ? `Methods that worked:\n${formatMethods(profile.methodsWorked)}` : "",
    profile.methodsFailed?.length ? `Methods that failed:\n${formatMethods(profile.methodsFailed)}` : "",
    profile.lastLearningContext?.subject || profile.lastLearningContext?.concept
      ? `- Last study context: ${[profile.lastLearningContext.subject, profile.lastLearningContext.concept].filter(Boolean).join(" / ")}`
      : ""
  ].filter(Boolean);

  if (profileLines.length) {
    sections.push(["User Learning Profile:", ...profileLines].join("\n"));
  }

  return sections.join("\n\n");
}

export async function processLearningProfileUpdate({ user, conversation, latestUserMessage }) {
  if (!user?._id || !conversation) {
    return { skipped: true, reason: "missing_user_or_conversation" };
  }

  const recentText = serializeRecentMessages(conversation);
  const signalText = [latestUserMessage, recentText].filter(Boolean).join("\n");
  if (!hasEducationalSignal(signalText)) {
    await getOrCreateLearningProfile(user);
    return { skipped: true, reason: "not_learning_related" };
  }

  try {
    const profile = await getOrCreateLearningProfile(user);
    const result = await generateJson({
      name: "learning_profile_update",
      schema: learningProfileUpdateSchema,
      instructions: LEARNING_PROFILE_EXTRACTION_PROMPT,
      input: [
        {
          role: "user",
          content: [
            "Existing Learning Profile:",
            buildLearningProfileContext(profile),
            "",
            "Recent chat excerpt:",
            recentText
          ].join("\n")
        }
      ],
      temperature: 0.1
    });
    const update = result.data || {};

    if (!update.isLearningRelated || !update.hasUsefulLearningSignal) {
      return { skipped: true, reason: "no_useful_learning_signal", ai: result.metadata };
    }

    profile.preferredExplanationStyles = mergeList(profile.preferredExplanationStyles, update.preferredExplanationStyles);
    profile.preferredExamplesStyle = mergeList(profile.preferredExamplesStyle, update.preferredExamplesStyle);
    profile.subjectsUserStrugglesWith = mergeList(profile.subjectsUserStrugglesWith, update.subjectsUserStrugglesWith);
    profile.conceptsUserStrugglesWith = mergeList(profile.conceptsUserStrugglesWith, update.conceptsUserStrugglesWith);
    profile.methodsWorked = mergeMethods(profile.methodsWorked, update.methodsWorked);
    profile.methodsFailed = mergeMethods(profile.methodsFailed, update.methodsFailed);

    const preferredTone = compactText(update.preferredTone, 80);
    if (preferredTone) {
      profile.preferredTone = preferredTone;
    }

    for (const [key, value] of Object.entries(update.flags || {})) {
      if (value === true && LEARNING_FLAG_KEYS.includes(key)) {
        profile.flags[key] = true;
      }
    }

    const subject = compactText(update.lastLearningContext?.subject, 120);
    const concept = compactText(update.lastLearningContext?.concept, 160);
    if (subject || concept) {
      profile.lastLearningContext = {
        subject,
        concept,
        updatedAt: new Date()
      };
    }

    profile.updateCount += 1;
    await profile.save();

    return {
      updated: true,
      updateCount: profile.updateCount,
      ai: result.metadata
    };
  } catch (error) {
    logger.warn({
      err: error,
      conversationId: conversation._id?.toString(),
      userId: user._id.toString()
    }, "Learning profile update failed");

    return { skipped: true, reason: "learning_profile_update_failed" };
  }
}
