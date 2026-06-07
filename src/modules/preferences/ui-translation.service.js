import { generateJson } from "../ai/ai.service.js";
import { getLanguageName, normalizeLanguage } from "./preferences.service.js";
import fs from "node:fs";
import path from "node:path";

const fallbackBaseTranslation = {
  profile: "Profile",
  theme: "Theme",
  light: "Light",
  dark: "Dark",
  system: "System",
  chatColor: "Chat color",
  appColor: "App color",
  language: "Language",
  appLanguage: "App language",
  aiLanguageQuestion: "Do you want the AI to speak this language too?",
  matchAiLanguage: "Make AI respond in the same language as the app",
  aiLanguageAutoHint: "If disabled, the AI will detect the conversation language automatically.",
  email: "Email",
  password: "Password",
  fullName: "Full name",
  changeEmail: "Change email",
  changePassword: "Change password",
  logout: "Logout",
  logoutConfirmTitle: "Are you sure you want to logout?",
  logoutConfirmBody: "Your current session will be closed on this device.",
  back: "Back",
  appearance: "Appearance",
  actions: "Actions",
  security: "Security",
  saving: "Saving...",
  saved: "Saved",
  saveFailed: "Could not save settings",
  loadingSettings: "Loading settings...",
  howCanIHelp: "How can I help you today?",
  askAnything: "Ask anything...",
  askMeAnything: "Ask me anything. I'm here to assist.",
  loadingConversation: "Loading chat history...",
  uploadingImage: "Uploading image...",
  uploadImage: "Upload image",
  uploadFile: "Upload file",
  uploadPdf: "PDF",
  fileUploadComingSoon: "File and PDF chat support is coming next. Image upload is ready now.",
  stopGenerating: "Stop generating",
  sendMessage: "Send message",
  thinking: "Thinking",
  copy: "Copy",
  like: "Like",
  dislike: "Dislike",
  regenerate: "Regenerate",
  share: "Share",
  more: "More",
  close: "Close",
  tellUsMore: "Tell us more",
  feedbackHelps: "Your feedback helps improve future replies.",
  feedbackInaccurate: "The reply was inaccurate",
  feedbackBadFormatting: "The formatting was poor",
  feedbackSlow: "The reply was slow",
  feedbackDidNotUnderstand: "It did not understand the answer",
  feedbackOther: "Other",
  feedbackSaved: "Feedback saved",
  copyFailed: "Could not copy message",
  copiedToClipboard: "Copied to clipboard",
  editInComposer: "Message copied into the composer",
  regenerateFailed: "Could not regenerate this reply",
  moreActionsSoon: "More actions are coming soon",
  standardChat: "Standard chat",
  standard: "Standard",
  webSearch: "Web Search",
  web: "Web",
  createImage: "Create Image",
  image: "Image",
  deepResearch: "Deep Research",
  research: "Research",
  imageGenerated: "Image generated. You can open it from this conversation.",
  newChat: "New chat",
  chat: "Chat",
  reminders: "Reminders",
  learning: "Learning",
  history: "History",
  renameChat: "Rename chat",
  deleteChat: "Delete chat",
  deleteChatConfirm: "Delete this chat? This keeps your other conversations safe.",
  chatTitle: "Chat title",
  couldNotOpenChat: "Could not open conversation",
  myReminders: "My reminders",
  create: "Create",
  searchReminders: "Search reminders...",
  createReminder: "Create reminder",
  editReminder: "Edit reminder",
  reminderTitle: "Reminder title",
  description: "Description",
  descriptionOptional: "Add a description (optional)",
  title: "Title",
  date: "Date",
  time: "Time",
  cancel: "Cancel",
  save: "Save",
  edit: "Edit",
  delete: "Delete",
  noReminders: "No reminders yet",
  noMatch: "No reminders match your search",
  createFirst: "Create your first reminder",
  createReminderSuccess: "Reminder created",
  createReminderError: "Could not create reminder",
  invalidImageType: "Please upload PNG, JPG, or WEBP images.",
  invalidImageSize: "Image must be smaller than 8MB.",
  imageUploadFailed: "Image upload failed",
  aiFailed: "AI failed to respond",
  createReminderCta: "Create reminder",
  suggestionFallback: "This sounds important. Would you like me to create a reminder?",
  selectLanguage: "Select language",
  searchLanguages: "Search languages...",
  noLanguagesFound: "No languages found",
  schoolLevel: "School level",
  chooseYourSchoolLevel: "Choose your school level",
  grade: "Grade",
  subject: "Subject",
  book: "Book",
  part: "Part",
  continueToChat: "Continue to chat",
  learningReady: "Learning setup is ready",
  comingSoon: "Coming soon",
  redirectingToChat: "Redirecting to chat...",
  stepProgress: "Step {{current}} of {{total}}",
  welcomeBack: "Welcome back",
  welcomeBackToast: "Welcome back!",
  signInSubtitle: "Sign in to your account",
  signIn: "Sign in",
  signingIn: "Signing in...",
  createAccount: "Create account",
  createAccountSubtitle: "Join BlueMind AI and start your journey",
  creating: "Creating...",
  createAccountButton: "Create Account",
  enterEmail: "Enter your email",
  enterPassword: "Enter your password",
  enterFullName: "Enter your full name",
  createPassword: "Create a password",
  rememberMe: "Remember me",
  forgotPassword: "Forgot password?",
  orContinueWith: "or continue with",
  google: "Google",
  apple: "Apple",
  googleSignInHint: "Google sign-in uses your BlueMind account session",
  googleSignUpHint: "Google sign-up creates a real BlueMind account",
  signedInWithGoogle: "Signed in with Google",
  googleSignInFailed: "Google sign-in failed",
  finishingGoogleSignIn: "Finishing Google sign in...",
  noAccount: "Do not have an account?",
  alreadyHaveAccount: "Already have an account?",
  createOne: "Create one",
  atLeast8: "At least 8 characters",
  includeNumber: "Include a number",
  includeUppercase: "Include an uppercase letter",
  verifyEmail: "Verify your email",
  verifyEmailSubtitle: "Enter the 6 digit code we sent to your inbox.",
  verificationCode: "Verification code",
  verifyEmailButton: "Verify email",
  verifying: "Verifying...",
  resendCode: "Resend verification code",
  resendIn: "Resend code in {{seconds}}s",
  forgotPasswordTitle: "Forgot password?",
  forgotPasswordSubtitle: "Enter your email and we will send a secure reset code.",
  sendResetCode: "Send reset code",
  sending: "Sending...",
  resetPassword: "Reset password",
  resetPasswordSubtitle: "Use the reset code and choose a new secure password.",
  resetCode: "Reset code",
  newPassword: "New password",
  currentPassword: "Current password",
  confirmNewPassword: "Confirm new password",
  resetting: "Resetting...",
  updatePassword: "Update password",
  updating: "Updating...",
  sendVerificationCode: "Send verification code",
  confirmNewEmail: "Confirm new email",
  newEmail: "New email",
  codeSentTo: "Code sent to {{email}}",
  confirm: "Confirm",
  googleOAuthNotConfigured: "Google sign-in is not configured yet. Add Google OAuth credentials in the backend environment.",
  loginFailed: "Login failed. Please check your email and password.",
  registrationFailed: "Registration failed. Please check your details and try again.",
  accountCreatedCheckEmail: "Account created. Check your email for the verification code.",
  resetCodeSent: "If this email exists, a reset code was sent.",
  passwordResetSuccess: "Password reset. Please sign in again.",
  emailVerifiedSuccess: "Email verified. Welcome to BlueMind AI.",
  verificationCodeSent: "Verification code sent.",
  emailAlreadyVerified: "Email is already verified.",
  emailChangeCodeSent: "Verification code sent to your new email.",
  emailUpdated: "Email updated.",
  passwordUpdatedSessionsRevoked: "Password updated. Other sessions were revoked.",
  couldNotStartEmailChange: "Could not start email change",
  couldNotConfirmEmailChange: "Could not confirm email change",
  couldNotChangePassword: "Could not change password",
  couldNotRequestPasswordReset: "Could not request password reset",
  couldNotResetPassword: "Could not reset password",
  verificationFailed: "Verification failed",
  couldNotResendVerificationCode: "Could not resend verification code",
  features: "Features",
  start: "Start",
  heroEyebrow: "AI Assistant for Everyday Life",
  heroTitle: "Your AI assistant for learning, chatting, and staying organized",
  heroSubtitle: "BlueMind AI brings the power of AI to your fingertips. Chat, learn, set reminders, and get things done smarter and faster.",
  noCreditCard: "No credit card required",
  aiChat: "AI Chat",
  aiChatShort: "Talk with AI naturally",
  aiChatDescription: "Talk with AI naturally and get instant, context-aware support whenever you need it.",
  aiLearning: "AI Learning",
  aiLearningShort: "Watch and learn",
  aiLearningDescription: "Watch and learn with AI-powered content tailored to your pace and interests.",
  smartReminders: "Smart Reminders",
  smartRemindersShort: "Organize tasks easily",
  smartRemindersDescription: "Organize your tasks and reminders effortlessly and never miss what matters.",
  featuresTitle: "Everything you need in one place",
  featuresSubtitle: "Powerful features to simplify your day-to-day life.",
  howItWorks: "How it works",
  howItWorksSubtitle: "Get started in just 3 simple steps.",
  signUp: "Sign up",
  signUpDescription: "Create your account in seconds.",
  chooseFeature: "Choose a feature",
  chooseFeatureDescription: "Pick what you need: chat, learn, or reminders.",
  startUsingAi: "Start using AI",
  startUsingAiDescription: "Let AI help you get things done smarter.",
  bottomCtaTitle: "Start using BlueMind AI today",
  bottomCtaSubtitle: "Your AI assistant for a smarter and more productive life.",
  startNow: "Start Now",
  helloHowCanIHelp: "Hello! How can I help you today?",
  welcomeToBlueMind: "Welcome to BlueMind AI",
  authSelectionSubtitle: "Create an account to get started",
  signInInstead: "Sign in instead",
  shareFeedback: "Share Feedback",
  feedbackSubtitle: "Help us make BlueMind AI better",
  rateExperience: "Rate your experience",
  feedbackType: "Feedback type",
  suggestion: "Suggestion",
  bugReport: "Bug Report",
  praise: "Praise",
  nameOptional: "Name (optional)",
  yourName: "Your name",
  emailOptional: "Email (optional)",
  yourEmail: "your@email.com",
  yourFeedback: "Your feedback *",
  feedbackPlaceholder: "Tell us what you think...",
  pleaseEnterFeedback: "Please enter your feedback",
  thankFeedback: "Thank you for your feedback!",
  submitFeedback: "Submit Feedback"
};

function loadFrontendTranslationDictionary() {
  const candidatePaths = [
    path.resolve(process.cwd(), "frontend/src/locales/en/common.json"),
    path.resolve(process.cwd(), "../frontend/src/locales/en/common.json")
  ];

  for (const frontendDictionaryPath of candidatePaths) {
    try {
      return JSON.parse(fs.readFileSync(frontendDictionaryPath, "utf8"));
    } catch {
      // Try the next likely workspace layout.
    }
  }

  return fallbackBaseTranslation;
}

const baseTranslation = loadFrontendTranslationDictionary();

const cache = new Map();

const translationSchema = {
  type: "object",
  additionalProperties: {
    type: "string"
  }
};

function sanitizeTranslations(translations) {
  const sanitized = {};

  for (const key of Object.keys(baseTranslation)) {
    sanitized[key] = typeof translations?.[key] === "string" && translations[key].trim()
      ? translations[key].trim()
      : baseTranslation[key];
  }

  return sanitized;
}

export async function getUiTranslations(language) {
  const normalized = normalizeLanguage(language);

  if (normalized === "en") {
    return {
      language: normalized,
      languageName: getLanguageName(normalized),
      translations: baseTranslation
    };
  }

  if (cache.has(normalized)) {
    return cache.get(normalized);
  }

  const languageName = getLanguageName(normalized);
  const result = await generateJson({
    name: "ui_translations",
    schema: translationSchema,
    instructions: [
      "Translate this web app UI dictionary into the requested target language.",
      "Keep every object key exactly the same.",
      "Translate values only.",
      "Keep interpolation variables like {{email}}, {{seconds}}, {{current}}, and {{total}} unchanged.",
      "Use concise natural UI copy, not long explanations.",
      `Target language: ${languageName} (${normalized}).`
    ].join("\n"),
    input: [
      {
        role: "user",
        content: JSON.stringify(baseTranslation)
      }
    ],
    temperature: 0.1
  });
  const payload = {
    language: normalized,
    languageName,
    translations: sanitizeTranslations(result.data)
  };

  cache.set(normalized, payload);

  return payload;
}
