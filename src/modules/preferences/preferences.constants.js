export const THEME_VALUES = ["light", "dark", "system"];
export const AI_LANGUAGE_MODES = ["auto", "match_app"];

export const DEFAULT_USER_PREFERENCES = {
  theme: "system",
  appColor: "#193B68",
  chatColor: "#193B68",
  appLanguage: "en",
  language: "en",
  aiLanguageMode: "auto",
  notificationsEnabled: true,
  notificationPreferences: {
    ai: {
      taskCompleted: false,
      researchCompleted: false,
      imageGenerationCompleted: false,
      longRunningTaskCompleted: false,
      recommendations: false
    },
    reminders: {
      alerts: true,
      daily: false,
      weekly: false,
      missed: false,
      overdue: false
    },
    studyPlan: {
      sessionReminders: false,
      dailyGoals: false,
      weeklyProgress: false,
      missedSessions: false,
      streakAlerts: false
    },
    calendar: {
      upcomingEvents: false,
      eventStartingSoon: false,
      eventReminders: false,
      calendarChanges: false
    },
    email: {
      importantAccountEmails: false,
      securityEmails: false,
      notificationSummaries: false,
      marketingEmails: false
    },
    security: {
      newLoginDetected: false,
      passwordChanged: false,
      emailChanged: false,
      securityAlerts: false,
      accountActivityAlerts: false
    },
    projects: {
      updates: false,
      sharedActivity: false,
      deadlines: false,
      reminders: false
    },
    system: {
      newFeatures: false,
      appUpdates: false,
      maintenanceAnnouncements: false,
      serviceAlerts: false
    },
    channels: {
      push: true,
      email: false,
      inApp: false
    }
  },
  openAppDirectlyToChat: false
};

export const RTL_LANGUAGES = new Set([
  "ar",
  "fa",
  "he",
  "ur",
  "ps",
  "sd",
  "ku",
  "dv",
  "ug",
  "yi"
]);
