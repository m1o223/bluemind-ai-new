import { env } from "../../config/env.js";
import { generateJson } from "../ai/ai.service.js";
import { WritingProfile } from "./writingProfile.model.js";

const RESPONSIBLE_USE_NOTICE = [
  "BlueMind Writing Mode is designed to help users write in a way that matches their own natural style.",
  "It is meant for writing assistance, not cheating, deception, impersonation, or misuse.",
  "The user is responsible for how they use generated text."
].join(" ");

const writingProfileSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    analysis: {
      type: "object",
      additionalProperties: false,
      properties: {
        vocabularyLevel: { type: "string" },
        commonWords: { type: "array", items: { type: "string" } },
        repeatedPhrases: { type: "array", items: { type: "string" } },
        sentenceLength: { type: "string" },
        shortSentenceStyle: { type: "string" },
        longSentenceStyle: { type: "string" },
        grammarLevel: { type: "string" },
        spellingPatterns: { type: "array", items: { type: "string" } },
        punctuationStyle: { type: "string" },
        capitalizationStyle: { type: "string" },
        tone: { type: "string" },
        formality: { type: "string" },
        languageLevel: { type: "string" },
        simplicityLevel: { type: "string" },
        slangUsage: { type: "string" },
        emojiUsage: { type: "string" },
        messageOpenings: { type: "array", items: { type: "string" } },
        messageEndings: { type: "array", items: { type: "string" } },
        paragraphStructure: { type: "string" },
        contextStyles: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              context: { type: "string" },
              style: { type: "string" }
            },
            required: ["context", "style"]
          }
        },
        doUse: { type: "array", items: { type: "string" } },
        avoid: { type: "array", items: { type: "string" } },
        confidence: { type: "string" }
      },
      required: [
        "vocabularyLevel",
        "commonWords",
        "repeatedPhrases",
        "sentenceLength",
        "grammarLevel",
        "punctuationStyle",
        "tone",
        "formality",
        "languageLevel",
        "doUse",
        "avoid",
        "confidence"
      ]
    },
    testText: { type: "string" },
    statusMessage: { type: "string" }
  },
  required: ["summary", "analysis", "testText", "statusMessage"]
};

function normalizeSamples(samples = []) {
  return samples
    .map((sample) => ({
      text: String(sample.text || "").trim().slice(0, 8000),
      source: String(sample.source || "paste").trim().slice(0, 80) || "paste",
      context: String(sample.context || "").trim().slice(0, 120)
    }))
    .filter((sample) => sample.text.length >= 20)
    .slice(0, 12);
}

function toProfileResponse(profile) {
  if (!profile) {
    return {
      status: "empty",
      notice: RESPONSIBLE_USE_NOTICE,
      samplesCount: 0,
      profile: null
    };
  }

  return {
    status: profile.status,
    notice: RESPONSIBLE_USE_NOTICE,
    samplesCount: profile.samples.length,
    profile: {
      summary: profile.summary,
      analysis: profile.analysis,
      testText: profile.testText,
      updateReason: profile.updateReason,
      version: profile.version,
      confirmedAt: profile.confirmedAt,
      lastAnalyzedAt: profile.lastAnalyzedAt,
      updatedAt: profile.updatedAt
    }
  };
}

function serializeExistingProfile(profile) {
  if (!profile || profile.status === "empty") return "No existing writing profile.";

  return [
    `Status: ${profile.status}`,
    `Summary: ${profile.summary || "(none)"}`,
    `Analysis JSON: ${JSON.stringify(profile.analysis || {})}`
  ].join("\n");
}

function serializeSamples(samples) {
  return samples.map((sample, index) => [
    `Sample ${index + 1}`,
    `Source: ${sample.source}`,
    sample.context ? `Context: ${sample.context}` : "",
    "Text:",
    sample.text
  ].filter(Boolean).join("\n")).join("\n\n---\n\n");
}

async function analyzeWritingSamples({ samples, existingProfile, updateReason }) {
  const input = [
    {
      role: "system",
      content: [
        "You analyze a user's own writing samples to create a private BlueMind Writing Profile.",
        "Do not copy sensitive personal details, names, addresses, secrets, or private events into the profile.",
        "Extract reusable writing style characteristics only.",
        "Analyze vocabulary, repeated phrases, sentence length, grammar level, spelling patterns, punctuation, capitalization, tone, formality, language level, slang, emoji usage, openings, endings, paragraph structure, and context-specific differences.",
        "Create a short test text that imitates the user's style without using private sample content.",
        "Responsible-use rule: this is a writing assistance profile, not a deception or impersonation tool."
      ].join("\n")
    },
    {
      role: "user",
      content: [
        updateReason ? `Update reason: ${updateReason}` : "Create or refresh the writing profile.",
        "Existing profile:",
        serializeExistingProfile(existingProfile),
        "New user-provided writing samples:",
        serializeSamples(samples)
      ].join("\n\n")
    }
  ];

  return generateJson({
    name: "writing_profile_analysis",
    schema: writingProfileSchema,
    input,
    instructions: "Return only JSON matching the schema. Keep the profile privacy-safe and useful for future writing generation.",
    model: env.OPENAI_THINKING_MODEL || env.OPENAI_MODEL,
    temperature: 0.2,
    maxOutputTokens: 2600
  });
}

export async function getWritingProfile(userId) {
  const profile = await WritingProfile.findOne({ userId });
  return toProfileResponse(profile);
}

export async function analyzeAndDraftWritingProfile(userId, { samples, updateReason = "" }) {
  const normalizedSamples = normalizeSamples(samples);
  if (!normalizedSamples.length) {
    const error = new Error("Please add at least one writing sample with 20 or more characters.");
    error.statusCode = 400;
    error.code = "WRITING_SAMPLES_REQUIRED";
    throw error;
  }

  const existingProfile = await WritingProfile.findOne({ userId });
  const result = await analyzeWritingSamples({
    samples: normalizedSamples,
    existingProfile,
    updateReason
  });

  const profile = await WritingProfile.findOneAndUpdate(
    { userId },
    {
      $set: {
        status: "draft",
        analysis: result.data.analysis,
        summary: result.data.summary,
        testText: result.data.testText,
        updateReason,
        lastAnalyzedAt: new Date()
      },
      $push: {
        samples: { $each: normalizedSamples }
      },
      $inc: {
        version: existingProfile ? 1 : 0
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return {
    ...toProfileResponse(profile),
    statusMessage: result.data.statusMessage,
    ai: result.metadata
  };
}

export async function confirmWritingProfile(userId, { accepted, adjustments = "" }) {
  const profile = await WritingProfile.findOne({ userId });
  if (!profile) {
    const error = new Error("Writing Profile was not found.");
    error.statusCode = 404;
    error.code = "WRITING_PROFILE_NOT_FOUND";
    throw error;
  }

  if (accepted) {
    profile.status = "ready";
    profile.confirmedAt = new Date();
    await profile.save();

    return {
      ...toProfileResponse(profile),
      statusMessage: "Writing Profile saved."
    };
  }

  profile.status = "draft";
  profile.updateReason = adjustments || "User asked to adjust the writing style profile.";
  await profile.save();

  return {
    ...toProfileResponse(profile),
    statusMessage: "Add more samples or explain what should change, then analyze again."
  };
}

export function buildWritingProfileContext(profileResponse) {
  const profile = profileResponse?.profile;
  if (!profile || profileResponse.status !== "ready") return "";

  return [
    "User Writing Profile:",
    `- Summary: ${profile.summary}`,
    `- Tone: ${profile.analysis?.tone || "not specified"}`,
    `- Formality: ${profile.analysis?.formality || "not specified"}`,
    `- Vocabulary level: ${profile.analysis?.vocabularyLevel || "not specified"}`,
    `- Sentence length: ${profile.analysis?.sentenceLength || "not specified"}`,
    `- Punctuation style: ${profile.analysis?.punctuationStyle || "not specified"}`,
    profile.analysis?.emojiUsage ? `- Emoji usage: ${profile.analysis.emojiUsage}` : "",
    profile.analysis?.doUse?.length ? `- Do use: ${profile.analysis.doUse.join("; ")}` : "",
    profile.analysis?.avoid?.length ? `- Avoid: ${profile.analysis.avoid.join("; ")}` : "",
    "Use this profile only to help the user write in their own natural style. Do not mention the profile unless helpful."
  ].filter(Boolean).join("\n");
}
