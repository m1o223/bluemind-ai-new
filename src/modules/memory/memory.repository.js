import { Conversation } from "./conversation.model.js";
import { UserMemory } from "./userMemory.model.js";

export function createConversation(userId) {
  return Conversation.create({ userId });
}

export function findConversationById(conversationId, userId) {
  return Conversation.findOne({ _id: conversationId, userId, deletedAt: { $exists: false } });
}

export function findLatestConversation(userId) {
  return Conversation.findOne({
    userId,
    deletedAt: { $exists: false },
    "messages.0": { $exists: true }
  }).sort({ updatedAt: -1 });
}

export function listUserConversations(userId, limit = 20) {
  return Conversation.find({
    userId,
    deletedAt: { $exists: false },
    "messages.0": { $exists: true }
  })
    .sort({ updatedAt: -1 })
    .limit(limit);
}

export function searchUserConversations(userId, query, limit = 20) {
  const safeQuery = String(query || "").trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(safeQuery, "i");

  return Conversation.find({
    userId,
    deletedAt: { $exists: false },
    "messages.0": { $exists: true },
    $or: [
      { title: pattern },
      { "messages.content": pattern }
    ]
  })
    .sort({ updatedAt: -1 })
    .limit(limit);
}

export function saveConversation(conversation) {
  return conversation.save();
}

export function softDeleteConversation(conversation) {
  conversation.deletedAt = new Date();
  return conversation.save();
}

export function listActiveMemories(userId, limit = 100) {
  return UserMemory.find({
    userId,
    archivedAt: { $exists: false }
  })
    .sort({ pinned: -1, importance: -1, updatedAt: -1 })
    .limit(limit);
}

export function listPinnedMemories(userId, limit = 8) {
  return UserMemory.find({
    userId,
    pinned: true,
    archivedAt: { $exists: false }
  })
    .sort({ importance: -1, updatedAt: -1 })
    .limit(limit);
}

export function listProfileMemories(userId, limit = 20) {
  return UserMemory.find({
    userId,
    type: { $in: ["profile", "preference", "instruction"] },
    archivedAt: { $exists: false }
  })
    .sort({ importance: -1, updatedAt: -1 })
    .limit(limit);
}

export function findMemoryById(memoryId, userId) {
  return UserMemory.findOne({ _id: memoryId, userId, archivedAt: { $exists: false } });
}

export function createUserMemory(userId, memory) {
  return UserMemory.create({
    ...memory,
    userId
  });
}

export async function upsertUserMemory(userId, memory) {
  const key = memory.key || memory.content.toLowerCase().slice(0, 90);

  return UserMemory.findOneAndUpdate(
    {
      userId,
      type: memory.type,
      key,
      archivedAt: { $exists: false }
    },
    {
      $set: {
        content: memory.content,
        tags: memory.tags || [],
        importance: memory.importance,
        confidence: memory.confidence,
        pinned: Boolean(memory.pinned),
        source: memory.source,
        metadata: memory.metadata || {}
      },
      $setOnInsert: {
        userId,
        type: memory.type,
        key
      }
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true
    }
  );
}

export function updateUserMemory(memory, patch) {
  Object.assign(memory, patch);
  return memory.save();
}

export function archiveUserMemory(memory) {
  memory.archivedAt = new Date();
  return memory.save();
}

export function markMemoriesUsed(memoryIds) {
  if (!memoryIds.length) {
    return Promise.resolve({ modifiedCount: 0 });
  }

  return UserMemory.updateMany(
    { _id: { $in: memoryIds } },
    {
      $inc: { useCount: 1 },
      $set: { lastUsedAt: new Date() }
    }
  );
}
