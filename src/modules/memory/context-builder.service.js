import { env } from "../../config/env.js";
import { markMemoriesUsed, listActiveMemories, listPinnedMemories, listProfileMemories } from "./memory.repository.js";
import { rankMemories } from "./memory-ranking.service.js";
import { CONTEXT_SYSTEM_HEADER } from "./memory.prompt.js";
import { listUpcomingRemindersForContext } from "../reminders/reminder.repository.js";
import { getLanguageName, normalizePreferences } from "../preferences/preferences.service.js";
import { buildLearningProfileContext, getOrCreateLearningProfile } from "../learning-profile/learningProfile.service.js";

function messageToInput(message) {
  return {
    role: message.role,
    content: message.content
  };
}

function truncate(text, maxChars) {
  if (!text || text.length <= maxChars) {
    return text || "";
  }

  return `${text.slice(0, maxChars - 3)}...`;
}

function formatMemory(memory, score) {
  const tags = memory.tags?.length ? ` tags=${memory.tags.join(",")}` : "";
  const pinned = memory.pinned ? " pinned=true" : "";

  return `- [${memory.type}${pinned}${tags}] ${memory.content} (score=${score.toFixed(2)})`;
}

function formatReminder(reminder) {
  const before = reminder.reminderBefore ? ` notify ${reminder.reminderBefore}m before` : " notify at time";
  return `- [${reminder.priority}/${reminder.category}] ${reminder.title} at ${reminder.reminderDate} ${reminder.reminderTime} ${reminder.timezone};${before}`;
}

function buildMemoryContext({ conversation, pinned, profile, ranked, reminders, preferences, learningProfile }) {
  const sections = [CONTEXT_SYSTEM_HEADER];
  const normalizedPreferences = normalizePreferences(preferences);
  const languageName = getLanguageName(normalizedPreferences.appLanguage);
  const aiLanguageInstruction = normalizedPreferences.aiLanguageMode === "match_app"
    ? `- AI language mode: match_app. Always respond in ${languageName} (${normalizedPreferences.appLanguage}) unless the user explicitly asks for another language.`
    : "- AI language mode: auto. Detect the user's language from their latest message and respond in that language.";

  sections.push([
    "User interface and response preferences:",
    `- App interface language: ${languageName} (${normalizedPreferences.appLanguage}).`,
    aiLanguageInstruction,
    `- Theme: ${normalizedPreferences.theme}. App color: ${normalizedPreferences.appColor}. Chat color: ${normalizedPreferences.chatColor}.`
  ].join("\n"));

  sections.push(buildLearningProfileContext(learningProfile));

  if (profile.length) {
    sections.push([
      "User profile memory:",
      ...profile.map(({ memory, score }) => formatMemory(memory, score))
    ].join("\n"));
  }

  if (pinned.length) {
    sections.push([
      "Pinned memories:",
      ...pinned.map((memory) => formatMemory(memory, 1))
    ].join("\n"));
  }

  if (ranked.length) {
    sections.push([
      "Relevant long-term memories:",
      ...ranked.map(({ memory, score }) => formatMemory(memory, score))
    ].join("\n"));
  }

  if (reminders.length) {
    sections.push([
      "Upcoming reminders:",
      ...reminders.map(formatReminder)
    ].join("\n"));
  }

  if (conversation.summary) {
    sections.push(`Conversation summary:\n${conversation.summary}`);
  }

  return truncate(sections.join("\n\n"), env.MEMORY_CONTEXT_MAX_CHARS);
}

export async function buildChatContext({ userId, user, conversation, latestMessage, preferences }) {
  const query = [
    conversation.summary,
    latestMessage,
    ...conversation.messages.slice(-4).map((message) => message.content)
  ].filter(Boolean).join("\n");

  const [activeMemories, pinnedMemories, profileMemories, upcomingReminders, learningProfile] = await Promise.all([
    listActiveMemories(userId, 100),
    listPinnedMemories(userId, env.MEMORY_PINNED_LIMIT),
    listProfileMemories(userId, 20),
    listUpcomingRemindersForContext(userId, 6),
    getOrCreateLearningProfile(user || userId)
  ]);

  const pinnedIds = new Set(pinnedMemories.map((memory) => memory._id.toString()));
  const profileRanked = rankMemories(profileMemories, query, { limit: Math.min(6, env.MEMORY_RETRIEVAL_LIMIT) });
  const ranked = rankMemories(
    activeMemories.filter((memory) => !pinnedIds.has(memory._id.toString())),
    query,
    { limit: env.MEMORY_RETRIEVAL_LIMIT }
  );
  const selectedMemoryIds = [
    ...pinnedMemories.map((memory) => memory._id),
    ...profileRanked.map(({ memory }) => memory._id),
    ...ranked.map(({ memory }) => memory._id)
  ];
  const memoryContext = buildMemoryContext({
    conversation,
    pinned: pinnedMemories,
    profile: profileRanked,
    ranked,
    reminders: upcomingReminders,
    preferences,
    learningProfile
  });
  const recentMessages = conversation.messages
    .slice(-env.MEMORY_SHORT_TERM_MESSAGES)
    .map(messageToInput);
  const messages = memoryContext
    ? [{ role: "system", content: memoryContext }, ...recentMessages]
    : recentMessages;

  await markMemoriesUsed(selectedMemoryIds);

  return {
    messages,
    metadata: {
      memoryType: "hybrid",
      shortTermMessages: recentMessages.length,
      summaryIncluded: Boolean(conversation.summary),
      summaryMessageCount: conversation.summaryMessageCount || 0,
      pinnedMemories: pinnedMemories.length,
      profileMemories: profileRanked.length,
      retrievedMemories: ranked.length,
      upcomingReminders: upcomingReminders.length,
      learningProfileLoaded: Boolean(learningProfile),
      learningProfileUpdatedAt: learningProfile?.updatedAt,
      language: normalizePreferences(preferences).appLanguage,
      appLanguage: normalizePreferences(preferences).appLanguage,
      aiLanguageMode: normalizePreferences(preferences).aiLanguageMode,
      selectedMemoryIds: selectedMemoryIds.map((id) => id.toString()),
      contextChars: messages.reduce((total, message) => total + message.content.length, 0)
    }
  };
}
