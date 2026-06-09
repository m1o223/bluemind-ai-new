import { generateJson, generateReply, streamReply } from "../ai/ai.service.js";
import { analyzeImagesForMemory, resolveChatImages } from "../images/image.service.js";
import { buildChatContext } from "../memory/context-builder.service.js";
import { processConversationMemory } from "../memory/memory-intelligence.service.js";
import {
  findConversationById,
  findLatestConversation,
  listUserConversations,
  saveConversation,
  searchUserConversations,
  softDeleteConversation
} from "../memory/memory.repository.js";
import {
  appendMessage,
  getOrCreateConversation,
  toConversationMeta
} from "../memory/memory.service.js";
import { findUserById } from "../users/user.service.js";
import { getLanguageName, normalizePreferences } from "../preferences/preferences.service.js";
import { AppError } from "../../utils/AppError.js";
import { env } from "../../config/env.js";

function buildMessageResponse(message) {
  return {
    id: message._id.toString(),
    role: message.role,
    content: message.content,
    metadata: message.metadata,
    createdAt: message.createdAt
  };
}

function buildAiResponse(metadata) {
  return {
    provider: metadata.provider,
    model: metadata.model,
    responseId: metadata.responseId,
    status: metadata.status,
    usage: metadata.usage
  };
}

function buildChatResponse(conversation, message, aiMetadata, memoryMetadata, memoryProcessing) {
  return {
    conversation: toConversationMeta(conversation),
    message: buildMessageResponse(message),
    ai: buildAiResponse(aiMetadata),
    memory: {
      ...memoryMetadata,
      processing: memoryProcessing
    }
  };
}

function buildConversationResponse(conversation) {
  if (!conversation) {
    return null;
  }

  return {
    ...toConversationMeta(conversation),
    summary: conversation.summary,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    messages: conversation.messages
      .filter((message) => !message.metadata?.hiddenFromChat)
      .map(buildMessageResponse)
  };
}

function shouldGenerateTitle(conversation) {
  const defaultTitle = !conversation.title || conversation.title === "New conversation";
  const userMessages = conversation.messages.filter((item) => item.role === "user");

  return defaultTitle && userMessages.length === 1;
}

function fallbackTitle(message) {
  return String(message || "New conversation")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 48) || "New conversation";
}

async function updateConversationTitleIfNeeded(conversation, latestMessage, preferences) {
  if (!shouldGenerateTitle(conversation)) {
    return conversation;
  }

  const normalizedPreferences = normalizePreferences(preferences);
  const languageName = getLanguageName(normalizedPreferences.language);

  try {
    const result = await generateJson({
      name: "conversation_title",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: {
            type: "string",
            minLength: 2,
            maxLength: 60
          }
        },
        required: ["title"]
      },
      instructions: [
        "Generate a concise chat title from the user's first message.",
        "Return only a short natural title, not a sentence.",
        "Do not include quotation marks, emojis, or punctuation unless needed.",
        `Use the user's preferred language when natural: ${languageName} (${normalizedPreferences.language}).`
      ].join("\n"),
      input: [
        {
          role: "user",
          content: String(latestMessage || "")
        }
      ],
      temperature: 0.1
    });

    conversation.title = fallbackTitle(result.data?.title);
  } catch {
    conversation.title = fallbackTitle(latestMessage);
  }

  return saveConversation(conversation);
}

function getSearchHandoffContext(metadata = {}) {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const context = metadata.searchContext && typeof metadata.searchContext === "object"
    ? metadata.searchContext
    : metadata;
  const source = String(context.source || metadata.source || "").toLowerCase();
  const intent = String(context.intent || metadata.intent || "");
  const category = String(context.category || metadata.category || "").trim();
  const categoryTitle = String(context.categoryTitle || metadata.categoryTitle || category).trim();
  const selectedItem = String(context.selectedItem || metadata.selectedItem || "").trim();

  if (source !== "search" || !category) {
    return null;
  }

  if (intent === "item_not_found") {
    return {
      source,
      intent,
      category,
      categoryTitle: categoryTitle || category
    };
  }

  if (intent === "learn_more_about_selected_item" && selectedItem) {
    return {
      source,
      intent,
      category,
      categoryTitle: categoryTitle || category,
      selectedItem
    };
  }

  return null;
}

function buildSearchHandoffMessage(metadata) {
  const context = getSearchHandoffContext(metadata);

  if (!context) {
    return "";
  }

  const categoryLabel = context.categoryTitle || context.category;
  const missingItemHints = {
    books: "title, author, cover color, topic, genre, school subject, or anything the user remembers",
    schools: "country, city, program, grade level, curriculum, or nearby location",
    universities: "country, major, degree, admissions need, scholarship goal, or study level",
    people: "name, profession, era, country, achievement, appearance, or any remembered detail",
    "research-papers": "topic, author, field, keywords, journal, method, or citation clue",
    "technology-ai": "device, tool, programming topic, AI concept, product, or trend",
    "travel-places": "country, city, landmark, climate, activity, or travel goal"
  };
  const missingHints = missingItemHints[context.category] || "name, topic, description, location, keywords, or anything the user remembers";

  if (context.intent === "learn_more_about_selected_item") {
    return [
      "Search handoff context. The user tapped Ask AI from a selected Search result.",
      `Category: ${categoryLabel}`,
      `Selected item: ${context.selectedItem}`,
      "Intent: learn_more_about_selected_item",
      "",
      "Start the conversation directly as BlueMind AI. Do not mention internal metadata or that this is a hidden handoff.",
      `Open with the selected item name: ${context.selectedItem}.`,
      `Ask what they would like to know about ${context.selectedItem}.`,
      "Offer concise, relevant options such as summary, key ideas, similar resources, background, author/source information, or a plan when relevant.",
      "Keep the message short and useful. The user should not need to type first before seeing your opening question."
    ].join("\n");
  }

  return [
    "Search handoff context. The user tapped Ask AI because they did not find the item they wanted in Search.",
    `Category: ${categoryLabel}`,
    "Intent: item_not_found",
    "",
    "Start the conversation directly as BlueMind AI. Do not mention internal metadata or that this is a hidden handoff.",
    `Open with a short category-aware line for ${categoryLabel}.`,
    `Ask the user to share ${missingHints} so you can help them find it.`,
    "Use a compact bullet list only if it improves clarity.",
    "Make the first message short, helpful, and category-aware. The user should not need to type first before seeing your opening question."
  ].join("\n");
}

function buildSearchHandoffTitleSeed(context) {
  if (!context) {
    return "";
  }

  if (context.selectedItem) {
    return `${context.selectedItem} search help`;
  }

  return `${context.categoryTitle || context.category} search help`;
}

function buildUserMessageContent(message, images, metadata) {
  if (message) {
    return message;
  }

  const searchHandoffMessage = buildSearchHandoffMessage(metadata);
  if (searchHandoffMessage) {
    return searchHandoffMessage;
  }

  return images.length === 1
    ? "Please analyze the attached image."
    : "Please analyze the attached images.";
}

function buildAttachmentMetadata(images) {
  return images.map((image) => ({
    id: image.response.id,
    kind: image.response.kind,
    mimeType: image.response.mimeType,
    url: image.response.url,
    analysis: image.response.analysis?.description ? image.response.analysis : undefined
  }));
}

function attachImagesToLatestUserMessage(messages, images, fallbackText) {
  if (!images.length) {
    return messages;
  }

  const nextMessages = [...messages];
  const index = nextMessages.findLastIndex((item) => item.role === "user");

  if (index === -1) {
    return nextMessages;
  }

  nextMessages[index] = {
    ...nextMessages[index],
    content: [
      {
        type: "input_text",
        text: nextMessages[index].content || fallbackText
      },
      ...images.map((image) => ({
        type: "input_image",
        image_url: image.dataUrl,
        detail: "auto"
      }))
    ]
  };

  return nextMessages;
}

const CHAT_MODE_INSTRUCTIONS = {
  web_search: [
    "The user selected Web Search mode.",
    "Use the most current information available to you and be explicit when live browsing/search data is not available.",
    "Do not invent sources. If you cite or mention sources, only do so when they are actually present in the conversation or tool context.",
    "Structure the answer clearly and include a short sources/verification note when relevant."
  ].join("\n"),
  write_edit: [
    "The user selected Write/Edit mode.",
    "Act as a professional writing, editing, productivity, and document assistant.",
    "When improving text, preserve the user's intent while making the output clearer, more useful, and better structured.",
    "For CVs, cover letters, proposals, reports, summaries, translations, and study material, produce polished ready-to-use content with concise notes when helpful."
  ].join("\n"),
  deep_research: [
    "The user selected Deep Research mode.",
    "Give a more thorough, structured answer with clear sections, assumptions, tradeoffs, and next steps.",
    "Prefer concise depth over verbosity. Use tables or bullets only when they improve readability."
  ].join("\n"),
  create_image: [
    "The user selected Create Image mode.",
    "Help refine image prompts and describe generated-image intent clearly. If an image generation result is provided, explain it briefly."
  ].join("\n"),
  hidden: [
    "The user is in Hidden Chat mode.",
    "Do not rely on persistent conversation memory for this exchange.",
    "Answer normally, but do not mention that the chat is temporary unless the user asks."
  ].join("\n")
};

const RESPONSE_MODE_ALIASES = {
  instant: "fast",
  default: "smart",
  balanced: "smart",
  thinking: "thinking",
  deep_thinking: "thinking"
};

const RESPONSE_MODE_CONFIG = {
  fast: {
    id: "fast",
    label: "Fast",
    model: () => env.OPENAI_INSTANT_MODEL || env.OPENAI_MODEL,
    temperature: 0.25,
    maxOutputTokens: 900,
    reasoningEffort: "low",
    instruction: [
      "Response mode: Fast.",
      "Prioritize fastest response time, directness, and lower token usage.",
      "Use lightweight reasoning, answer succinctly, and avoid unnecessary preamble."
    ].join("\n")
  },
  smart: {
    id: "smart",
    label: "Smart",
    model: () => env.OPENAI_THINKING_MODEL || env.OPENAI_MODEL,
    temperature: 0.55,
    maxOutputTokens: 1800,
    reasoningEffort: "medium",
    instruction: [
      "Response mode: Smart.",
      "Balance speed and quality with better reasoning than Fast mode.",
      "Give a clear, useful medium-length answer with enough explanation to be trustworthy, without becoming verbose."
    ].join("\n")
  },
  thinking: {
    id: "thinking",
    label: "Thinking",
    model: () => env.OPENAI_DEEP_THINKING_MODEL || env.OPENAI_THINKING_MODEL || env.OPENAI_MODEL,
    temperature: 0.45,
    maxOutputTokens: 3200,
    reasoningEffort: "high",
    instruction: [
      "Response mode: Thinking.",
      "Analyze the problem deeply before responding.",
      "Use deeper reasoning for coding, problem solving, planning, and analysis.",
      "Consider edge cases, tradeoffs, assumptions, and the user's underlying goal.",
      "Use a longer, more accurate structured answer when the task is complex, but keep it readable."
    ].join("\n")
  }
};

function normalizeResponseMode(metadata, mode) {
  const rawValue = String(mode || metadata?.mode || metadata?.responseMode || metadata?.thinkingMode || "smart").trim().toLowerCase();
  const value = RESPONSE_MODE_ALIASES[rawValue] || rawValue;
  return RESPONSE_MODE_CONFIG[value] ? value : "smart";
}

function supportsReasoningEffort(model) {
  return /(^o\d|gpt-5|reasoning)/i.test(String(model || ""));
}

function buildResponseModeOptions(metadata, mode) {
  const config = RESPONSE_MODE_CONFIG[normalizeResponseMode(metadata, mode)];
  const model = config.model();
  const aiOptions = {
    model,
    temperature: config.temperature,
    max_output_tokens: config.maxOutputTokens
  };

  if (supportsReasoningEffort(model)) {
    aiOptions.reasoning = {
      effort: config.reasoningEffort
    };
  }

  return {
    responseMode: config.id,
    aiOptions,
    instruction: config.instruction
  };
}

function applyChatModeInstruction(messages, metadata, responseModeName) {
  const chatMode = metadata?.chatMode;
  const responseMode = buildResponseModeOptions(metadata, responseModeName);
  const instructions = [responseMode.instruction, CHAT_MODE_INSTRUCTIONS[chatMode]].filter(Boolean);

  if (!instructions.length) {
    return messages;
  }

  return [
    {
      role: "system",
      content: instructions.join("\n\n")
    },
    ...messages
  ];
}

export async function createChatReply({ userId, conversationId, privateSpaceId, message, imageIds = [], metadata, mode }) {
  const conversation = await getOrCreateConversation({ userId, conversationId, privateSpaceId });
  const user = await findUserById(userId);
  const images = await resolveChatImages(userId, imageIds);
  const searchHandoffContext = getSearchHandoffContext(metadata);
  const hiddenSearchHandoff = Boolean(searchHandoffContext && !message && !images.length);
  const userMessageContent = buildUserMessageContent(message, images, metadata);

  await appendMessage(conversation, {
    role: "user",
    content: userMessageContent,
    metadata: {
      ...(metadata || {}),
      hiddenFromChat: hiddenSearchHandoff || undefined,
      searchHandoff: searchHandoffContext || undefined,
      mode: normalizeResponseMode(metadata, mode),
      attachments: buildAttachmentMetadata(images)
    }
  });

  const context = await buildChatContext({
    userId,
    conversation,
    latestMessage: userMessageContent,
    preferences: user?.preferences
  });
  const aiInput = attachImagesToLatestUserMessage(context.messages, images, userMessageContent);
  const responseMode = buildResponseModeOptions(metadata, mode);
  const aiResult = await generateReply(applyChatModeInstruction(aiInput, metadata, mode), responseMode.aiOptions);

  await appendMessage(conversation, {
    role: "assistant",
    content: aiResult.content,
    metadata: {
      ...aiResult.metadata,
      responseMode: responseMode.responseMode,
      memory: context.metadata
    }
  });

  const assistantMessage = conversation.messages.at(-1);
  const [memoryProcessing, imageMemory] = await Promise.all([
    processConversationMemory({ userId, conversation, preferences: user?.preferences }),
    analyzeImagesForMemory(userId, images)
  ]);

  await updateConversationTitleIfNeeded(conversation, buildSearchHandoffTitleSeed(searchHandoffContext) || userMessageContent, user?.preferences);

  return buildChatResponse(conversation, assistantMessage, aiResult.metadata, context.metadata, {
    ...memoryProcessing,
    imageMemories: imageMemory.length
  });
}

export async function createStreamingChatReply({
  userId,
  conversationId,
  privateSpaceId,
  message,
  imageIds = [],
  metadata,
  mode,
  signal,
  onStart,
  onDelta,
  onResponseStart
}) {
  const conversation = await getOrCreateConversation({ userId, conversationId, privateSpaceId });
  const user = await findUserById(userId);
  const images = await resolveChatImages(userId, imageIds);
  const searchHandoffContext = getSearchHandoffContext(metadata);
  const hiddenSearchHandoff = Boolean(searchHandoffContext && !message && !images.length);
  const userMessageContent = buildUserMessageContent(message, images, metadata);

  await appendMessage(conversation, {
    role: "user",
    content: userMessageContent,
    metadata: {
      ...(metadata || {}),
      hiddenFromChat: hiddenSearchHandoff || undefined,
      searchHandoff: searchHandoffContext || undefined,
      mode: normalizeResponseMode(metadata, mode),
      attachments: buildAttachmentMetadata(images)
    }
  });

  await onStart?.(toConversationMeta(conversation));

  const context = await buildChatContext({
    userId,
    conversation,
    latestMessage: userMessageContent,
    preferences: user?.preferences
  });
  const aiInput = attachImagesToLatestUserMessage(context.messages, images, userMessageContent);
  const responseMode = buildResponseModeOptions(metadata, mode);
  const aiResult = await streamReply(applyChatModeInstruction(aiInput, metadata, mode), {
    aiOptions: responseMode.aiOptions,
    signal,
    onDelta,
    onResponseStart
  });

  await appendMessage(conversation, {
    role: "assistant",
    content: aiResult.content,
    metadata: {
      ...aiResult.metadata,
      responseMode: responseMode.responseMode,
      memory: context.metadata
    }
  });

  const assistantMessage = conversation.messages.at(-1);
  const [memoryProcessing, imageMemory] = await Promise.all([
    processConversationMemory({ userId, conversation, preferences: user?.preferences }),
    analyzeImagesForMemory(userId, images)
  ]);

  await updateConversationTitleIfNeeded(conversation, buildSearchHandoffTitleSeed(searchHandoffContext) || userMessageContent, user?.preferences);

  return buildChatResponse(conversation, assistantMessage, aiResult.metadata, context.metadata, {
    ...memoryProcessing,
    imageMemories: imageMemory.length
  });
}

export async function createHiddenStreamingChatReply({
  userId,
  message,
  imageIds = [],
  metadata,
  mode,
  signal,
  onDelta,
  onResponseStart
}) {
  const user = await findUserById(userId);
  const images = await resolveChatImages(userId, imageIds);
  const userMessageContent = buildUserMessageContent(message, images, metadata);
  const responseMode = buildResponseModeOptions(metadata, mode);
  const baseMessages = [{
    role: "user",
    content: userMessageContent
  }];
  const aiInput = attachImagesToLatestUserMessage(baseMessages, images, userMessageContent);
  const aiResult = await streamReply(applyChatModeInstruction(aiInput, {
    ...(metadata || {}),
    chatMode: metadata?.chatMode || "hidden"
  }, mode), {
    aiOptions: responseMode.aiOptions,
    signal,
    onDelta,
    onResponseStart
  });

  return {
    conversation: null,
    message: {
      id: `hidden-${Date.now()}`,
      role: "assistant",
      content: aiResult.content,
      metadata: {
        ...aiResult.metadata,
        responseMode: responseMode.responseMode,
        hiddenChat: true,
        preferredLanguage: user?.preferences?.language
      },
      createdAt: new Date()
    },
    ai: buildAiResponse(aiResult.metadata),
    memory: {
      processing: {
        skipped: true,
        reason: "hidden_chat"
      }
    }
  };
}

export async function listChatConversations(userId, options = {}) {
  const conversations = await listUserConversations(userId, 20, options);

  return {
    items: conversations.map((conversation) => ({
      ...toConversationMeta(conversation),
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      lastMessageAt: conversation.messages.at(-1)?.createdAt || conversation.updatedAt
    }))
  };
}

function findMatchingMessage(conversation, query) {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return null;

  return conversation.messages.find((message) =>
    String(message.content || "").toLowerCase().includes(needle)
  );
}

export async function searchChatConversations(userId, query, limit = 20, options = {}) {
  const conversations = await searchUserConversations(userId, query, limit, options);

  return {
    items: conversations.map((conversation) => {
      const match = findMatchingMessage(conversation, query);

      return {
        ...toConversationMeta(conversation),
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        lastMessageAt: conversation.messages.at(-1)?.createdAt || conversation.updatedAt,
        match: match ? {
          messageId: match._id.toString(),
          role: match.role,
          content: String(match.content || "").slice(0, 220),
          createdAt: match.createdAt
        } : null
      };
    })
  };
}

export async function getLatestChatConversation(userId, options = {}) {
  const conversation = await findLatestConversation(userId, options);

  return {
    conversation: buildConversationResponse(conversation)
  };
}

export async function getChatConversation(userId, conversationId, options = {}) {
  const conversation = await findConversationById(conversationId, userId, options);

  if (!conversation) {
    throw new AppError("Conversation was not found", 404, "CONVERSATION_NOT_FOUND");
  }

  return {
    conversation: buildConversationResponse(conversation)
  };
}

export async function renameChatConversation(userId, conversationId, title, options = {}) {
  const conversation = await findConversationById(conversationId, userId, options);

  if (!conversation) {
    throw new AppError("Conversation was not found", 404, "CONVERSATION_NOT_FOUND");
  }

  conversation.title = title.trim();
  await saveConversation(conversation);

  return {
    conversation: buildConversationResponse(conversation)
  };
}

export async function deleteChatConversation(userId, conversationId, options = {}) {
  const conversation = await findConversationById(conversationId, userId, options);

  if (!conversation) {
    throw new AppError("Conversation was not found", 404, "CONVERSATION_NOT_FOUND");
  }

  await softDeleteConversation(conversation);

  return {
    deleted: true,
    conversationId
  };
}
