import mongoose from "mongoose";

const userMemorySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ["profile", "preference", "fact", "goal", "project", "instruction", "pinned", "summary"],
    required: true,
    index: true
  },
  key: {
    type: String,
    trim: true,
    lowercase: true,
    maxlength: 120,
    default: ""
  },
  content: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1200
  },
  tags: {
    type: [String],
    default: []
  },
  importance: {
    type: Number,
    min: 0,
    max: 1,
    default: 0.5
  },
  confidence: {
    type: Number,
    min: 0,
    max: 1,
    default: 0.7
  },
  pinned: {
    type: Boolean,
    default: false,
    index: true
  },
  source: {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation"
    },
    messageId: String,
    kind: {
      type: String,
      enum: ["manual", "extracted", "summary", "profile"],
      default: "extracted"
    }
  },
  useCount: {
    type: Number,
    default: 0
  },
  lastUsedAt: Date,
  archivedAt: Date,
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true,
  versionKey: false
});

userMemorySchema.index({ userId: 1, type: 1, key: 1 });
userMemorySchema.index({ userId: 1, pinned: 1, importance: -1 });
userMemorySchema.index({ userId: 1, archivedAt: 1, updatedAt: -1 });
userMemorySchema.index({
  content: "text",
  key: "text",
  tags: "text"
});

export const UserMemory = mongoose.model("UserMemory", userMemorySchema);
