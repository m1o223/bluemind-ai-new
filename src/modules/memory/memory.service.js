import { AppError } from "../../utils/AppError.js";
import {
  archiveUserMemory,
  createConversation,
  createUserMemory,
  findConversationById,
  findMemoryById,
  listActiveMemories,
  saveConversation,
  updateUserMemory
} from "./memory.repository.js";

export async function getOrCreateConversation({ conversationId, userId, privateSpaceId }) {
  if (!conversationId) {
    return createConversation(userId, { privateSpaceId });
  }

  const conversation = await findConversationById(conversationId, userId, { privateSpaceId });

  if (!conversation) {
    throw new AppError("Conversation was not found", 404, "CONVERSATION_NOT_FOUND");
  }

  return conversation;
}

export async function appendMessage(conversation, message) {
  conversation.messages.push(message);

  return saveConversation(conversation);
}

export function getContextMessages(conversation) {
  return conversation.messages.map((message) => ({
    role: message.role,
    content: message.content
  }));
}

export function toConversationMeta(conversation) {
  return {
    conversationId: conversation._id.toString(),
    privateSpaceId: conversation.privateSpaceId?.toString(),
    title: conversation.title,
    messageCount: conversation.messages.length,
    summaryMessageCount: conversation.summaryMessageCount || 0,
    memoryType: "hybrid"
  };
}

function toMemoryResponse(memory) {
  return {
    id: memory._id.toString(),
    type: memory.type,
    key: memory.key,
    content: memory.content,
    tags: memory.tags,
    importance: memory.importance,
    confidence: memory.confidence,
    pinned: memory.pinned,
    source: memory.source,
    useCount: memory.useCount,
    lastUsedAt: memory.lastUsedAt,
    createdAt: memory.createdAt,
    updatedAt: memory.updatedAt
  };
}

export async function listUserMemories(userId) {
  const memories = await listActiveMemories(userId, 200);

  return memories.map(toMemoryResponse);
}

export async function createManualMemory(userId, memory) {
  const created = await createUserMemory(userId, {
    ...memory,
    key: memory.key || memory.content.toLowerCase().slice(0, 90),
    pinned: Boolean(memory.pinned || memory.type === "pinned"),
    source: {
      kind: "manual"
    }
  });

  return toMemoryResponse(created);
}

export async function updateManualMemory(userId, memoryId, patch) {
  const memory = await findMemoryById(memoryId, userId);

  if (!memory) {
    throw new AppError("Memory was not found", 404, "MEMORY_NOT_FOUND");
  }

  const updated = await updateUserMemory(memory, patch);

  return toMemoryResponse(updated);
}

export async function deleteManualMemory(userId, memoryId) {
  const memory = await findMemoryById(memoryId, userId);

  if (!memory) {
    throw new AppError("Memory was not found", 404, "MEMORY_NOT_FOUND");
  }

  await archiveUserMemory(memory);

  return { deleted: true };
}
