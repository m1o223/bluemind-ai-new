import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 80
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    index: true
  },
  passwordHash: {
    type: String,
    default: ""
  },
  authProvider: {
    type: String,
    enum: ["local", "google", "mixed", "guest"],
    default: "local",
    index: true
  },
  googleId: {
    type: String,
    trim: true,
    sparse: true,
    index: true
  },
  avatarUrl: {
    type: String,
    trim: true,
    default: ""
  },
  birthday: {
    type: String,
    trim: true,
    default: ""
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationCodeHash: {
    type: String,
    trim: true,
    default: ""
  },
  emailVerificationExpiresAt: {
    type: Date
  },
  emailVerificationAttempts: {
    type: Number,
    default: 0
  },
  emailVerificationLastSentAt: {
    type: Date
  },
  passwordResetCodeHash: {
    type: String,
    trim: true,
    default: ""
  },
  passwordResetExpiresAt: {
    type: Date
  },
  passwordResetAttempts: {
    type: Number,
    default: 0
  },
  passwordResetLastSentAt: {
    type: Date
  },
  pendingEmail: {
    type: String,
    trim: true,
    lowercase: true,
    default: ""
  },
  pendingEmailCodeHash: {
    type: String,
    trim: true,
    default: ""
  },
  pendingEmailExpiresAt: {
    type: Date
  },
  pendingEmailAttempts: {
    type: Number,
    default: 0
  },
  pendingEmailLastSentAt: {
    type: Date
  },
  passwordChangedAt: {
    type: Date
  },
  lastLoginAt: {
    type: Date
  },
  preferences: {
    appLanguage: {
      type: String,
      default: "en"
    },
    language: {
      type: String,
      default: "en"
    },
    theme: {
      type: String,
      enum: ["light", "dark", "system"],
      default: "system"
    },
    appColor: {
      type: String,
      default: "#193B68"
    },
    chatColor: {
      type: String,
      default: "#193B68"
    },
    accentColor: {
      type: String,
      default: "#193B68"
    },
    aiLanguageMode: {
      type: String,
      enum: ["auto", "match_app"],
      default: "auto"
    },
    notificationsEnabled: {
      type: Boolean,
      default: true
    },
    notificationPreferences: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined
    },
    openAppDirectlyToChat: {
      type: Boolean,
      default: false
    }
  }
}, {
  timestamps: true,
  versionKey: false
});

userSchema.methods.toSafeObject = function toSafeObject() {
  const preferences = this.preferences?.toObject?.() || this.preferences || {};
  const appColor = preferences.appColor || preferences.accentColor || "#193B68";
  const appLanguage = preferences.appLanguage || preferences.language || "en";

  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    authProvider: this.authProvider,
    avatarUrl: this.avatarUrl,
    birthday: this.birthday || "",
    emailVerified: this.emailVerified,
    lastLoginAt: this.lastLoginAt,
    preferences: {
      appLanguage,
      language: appLanguage,
      aiLanguageMode: ["auto", "match_app"].includes(preferences.aiLanguageMode) ? preferences.aiLanguageMode : "auto",
      theme: preferences.theme || "system",
      appColor,
      accentColor: appColor,
      chatColor: preferences.chatColor || "#193B68",
      notificationsEnabled: preferences.notificationsEnabled !== false,
      notificationPreferences: preferences.notificationPreferences || undefined,
      openAppDirectlyToChat: preferences.openAppDirectlyToChat === true
    },
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

export const User = mongoose.model("User", userSchema);
