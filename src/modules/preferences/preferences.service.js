import { upsertUserMemory } from "../memory/memory.repository.js";
import { logger } from "../../config/logger.js";
import { AI_LANGUAGE_MODES, DEFAULT_USER_PREFERENCES, RTL_LANGUAGES } from "./preferences.constants.js";

export function normalizeLanguage(language) {
  return String(language || DEFAULT_USER_PREFERENCES.language)
    .trim()
    .replace("_", "-")
    .toLowerCase();
}

export function getLanguageName(language) {
  const normalized = normalizeLanguage(language);

  try {
    const displayNames = new Intl.DisplayNames(["en"], { type: "language" });
    return displayNames.of(normalized) || normalized;
  } catch {
    return normalized;
  }
}

export function isRtlLanguage(language) {
  const baseLanguage = normalizeLanguage(language).split("-")[0];
  return RTL_LANGUAGES.has(baseLanguage);
}

export function normalizePreferences(preferences = {}) {
  const appColor = preferences.appColor || preferences.accentColor || DEFAULT_USER_PREFERENCES.appColor;
  const appLanguage = normalizeLanguage(preferences.appLanguage || preferences.language);
  const aiLanguageMode = AI_LANGUAGE_MODES.includes(preferences.aiLanguageMode)
    ? preferences.aiLanguageMode
    : DEFAULT_USER_PREFERENCES.aiLanguageMode;
  const notificationPreferences = mergeNotificationPreferences(preferences.notificationPreferences);

  return {
    theme: preferences.theme || DEFAULT_USER_PREFERENCES.theme,
    appColor,
    accentColor: appColor,
    chatColor: preferences.chatColor || DEFAULT_USER_PREFERENCES.chatColor,
    appLanguage,
    language: appLanguage,
    aiLanguageMode,
    notificationsEnabled: preferences.notificationsEnabled !== false,
    birthdayGreetings: preferences.birthdayGreetings !== false,
    animations: preferences.animations !== false,
    notificationPreferences,
    openAppDirectlyToChat: preferences.openAppDirectlyToChat === true
  };
}

function mergeNotificationPreferences(preferences = {}) {
  return Object.fromEntries(Object.entries(DEFAULT_USER_PREFERENCES.notificationPreferences).map(([section, defaults]) => ([
    section,
    {
      ...defaults,
      ...((preferences && typeof preferences[section] === "object") ? preferences[section] : {})
    }
  ])));
}

export function toPreferencesResponse(user) {
  const preferences = normalizePreferences(user.preferences?.toObject?.() || user.preferences || {});

  return {
    ...preferences,
    languageName: getLanguageName(preferences.appLanguage),
    direction: isRtlLanguage(preferences.appLanguage) ? "rtl" : "ltr"
  };
}

export async function updateUserPreferences(user, patch) {
  const current = normalizePreferences(user.preferences?.toObject?.() || user.preferences || {});
  const nextPatch = { ...patch };

  if (nextPatch.accentColor && !nextPatch.appColor) {
    nextPatch.appColor = nextPatch.accentColor;
  }

  if (nextPatch.language && !nextPatch.appLanguage) {
    nextPatch.appLanguage = nextPatch.language;
  }

  const next = normalizePreferences({
    ...current,
    ...nextPatch
  });

  user.preferences = {
    ...(user.preferences?.toObject?.() || user.preferences || {}),
    ...next,
    language: next.appLanguage,
    accentColor: next.appColor,
    notificationPreferences: next.notificationPreferences
  };
  await user.save();

  try {
    await upsertUserMemory(user._id, {
      type: "preference",
      key: "profile:preferences",
      content: [
        `User interface language: ${getLanguageName(next.language)} (${next.language}).`,
        next.aiLanguageMode === "match_app"
          ? `AI response language: always match app language ${getLanguageName(next.appLanguage)} (${next.appLanguage}).`
          : "AI response language: auto-detect from the conversation.",
        `Theme: ${next.theme}.`,
        `App color: ${next.appColor}. Chat color: ${next.chatColor}.`,
        `Birthday greetings: ${next.birthdayGreetings ? "enabled" : "disabled"}. Animations: ${next.animations ? "enabled" : "reduced"}.`,
        next.openAppDirectlyToChat
          ? "Preferred app entry: open directly to chat."
          : "Preferred app entry: open the Smart Hub first."
      ].join(" "),
      tags: ["profile", "preferences", "language", next.appLanguage, next.aiLanguageMode, next.theme],
      importance: 0.75,
      confidence: 1,
      pinned: false,
      source: {
        kind: "manual"
      },
      metadata: {
        userId: user._id.toString(),
        preferences: next
      }
    });
  } catch (error) {
    logger.warn({
      err: error,
      userId: user._id.toString()
    }, "Preference memory sync failed after saving user preferences");
  }

  return {
    user: user.toSafeObject(),
    preferences: toPreferencesResponse(user)
  };
}
