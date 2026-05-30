import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { generateJson } from "../ai/ai.service.js";
import { saveConversation, upsertUserMemory } from "./memory.repository.js";
import { MEMORY_EXTRACTION_PROMPT, MEMORY_SUMMARY_PROMPT } from "./memory.prompt.js";
import { getLanguageName, normalizePreferences } from "../preferences/preferences.service.js";

const summarySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    topics: {
      type: "array",
      items: { type: "string" }
    },
    openQuestions: {
      type: "array",
      items: { type: "string" }
    }
  },
  required: ["summary", "topics", "openQuestions"]
};

const extractionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    memories: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          type: {
            type: "string",
            enum: ["profile", "preference", "fact", "goal", "project", "instruction", "pinned"]
          },
          key: { type: "string" },
          content: { type: "string" },
          tags: {
            type: "array",
            items: { type: "string" }
          },
          importance: { type: "number" },
          confidence: { type: "number" },
          pinned: { type: "boolean" }
        },
        required: ["type", "key", "content", "tags", "importance", "confidence", "pinned"]
      }
    }
  },
  required: ["memories"]
};

function serializeMessages(messages) {
  return messages
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n");
}

function normalizeMemory(memory, conversation) {
  const content = String(memory.content || "").trim();

  if (!content) {
    return null;
  }

  return {
    type: memory.type || "fact",
    key: String(memory.key || content).trim().toLowerCase().slice(0, 120),
    content: content.slice(0, 1200),
    tags: (memory.tags || []).map((tag) => String(tag).trim().toLowerCase()).filter(Boolean).slice(0, 8),
    importance: Math.min(Math.max(Number(memory.importance ?? 0.5), 0), 1),
    confidence: Math.min(Math.max(Number(memory.confidence ?? 0.7), 0), 1),
    pinned: Boolean(memory.pinned || memory.type === "pinned"),
    source: {
      conversationId: conversation._id,
      kind: "extracted"
    },
    metadata: {
      extractor: "openai-json-schema"
    }
  };
}

export function shouldSummarizeConversation(conversation) {
  const messageCount = conversation.messages.length;
  const summarizedCount = conversation.summaryMessageCount || 0;

  return messageCount >= env.MEMORY_SUMMARY_AFTER_MESSAGES
    && messageCount - summarizedCount >= env.MEMORY_SUMMARY_INTERVAL_MESSAGES;
}

function withLanguageInstruction(prompt, preferences) {
  const normalizedPreferences = normalizePreferences(preferences);
  const languageName = getLanguageName(normalizedPreferences.language);

  return [
    prompt,
    `The user's preferred language is ${languageName} (${normalizedPreferences.language}).`,
    "Write user-facing summaries and memory content in that preferred language unless preserving an exact quoted term, name, or code token."
  ].join("\n\n");
}

export async function summarizeConversation(conversation, preferences) {
  const messagesToSummarize = conversation.messages.slice(0, Math.max(
    conversation.messages.length - env.MEMORY_SHORT_TERM_MESSAGES,
    0
  ));

  if (!messagesToSummarize.length) {
    return null;
  }

  const result = await generateJson({
    name: "conversation_summary",
    schema: summarySchema,
    instructions: withLanguageInstruction(MEMORY_SUMMARY_PROMPT, preferences),
    input: [
      {
        role: "user",
        content: [
          `Existing summary:\n${conversation.summary || "(none)"}`,
          `Messages to summarize:\n${serializeMessages(messagesToSummarize)}`
        ].join("\n\n")
      }
    ],
    temperature: 0.2
  });

  conversation.summary = result.data.summary;
  conversation.summaryMessageCount = conversation.messages.length;
  conversation.summaryUpdatedAt = new Date();
  await saveConversation(conversation);

  return {
    summary: conversation.summary,
    messageCount: conversation.summaryMessageCount,
    ai: result.metadata
  };
}

export async function extractLongTermMemories({ userId, conversation, preferences }) {
  const recentMessages = conversation.messages.slice(-Math.max(env.MEMORY_SHORT_TERM_MESSAGES, 6));

  if (recentMessages.length < 2) {
    return [];
  }

  const result = await generateJson({
    name: "memory_extraction",
    schema: extractionSchema,
    instructions: withLanguageInstruction(MEMORY_EXTRACTION_PROMPT, preferences),
    input: [
      {
        role: "user",
        content: `Conversation excerpt:\n${serializeMessages(recentMessages)}`
      }
    ],
    temperature: 0.1
  });
  const candidates = (result.data.memories || [])
    .map((memory) => normalizeMemory(memory, conversation))
    .filter(Boolean)
    .filter((memory) => memory.confidence >= 0.55);
  const saved = [];

  for (const candidate of candidates) {
    saved.push(await upsertUserMemory(userId, candidate));
  }

  return saved;
}

export async function processConversationMemory({ userId, conversation, preferences }) {
  const result = {
    summaryUpdated: false,
    extractedMemories: 0
  };

  try {
    if (shouldSummarizeConversation(conversation)) {
      await summarizeConversation(conversation, preferences);
      result.summaryUpdated = true;
    }

    const memories = await extractLongTermMemories({ userId, conversation, preferences });
    result.extractedMemories = memories.length;
  } catch (error) {
    logger.warn({
      err: error,
      conversationId: conversation._id.toString(),
      userId: userId.toString()
    }, "Memory processing failed");
  }

  return result;
}
