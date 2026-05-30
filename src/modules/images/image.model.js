import mongoose from "mongoose";

const imageAssetSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Conversation",
    index: true
  },
  kind: {
    type: String,
    enum: ["upload", "generated"],
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ["ready", "processing", "failed"],
    default: "ready",
    index: true
  },
  originalName: {
    type: String,
    trim: true,
    maxlength: 180,
    default: ""
  },
  fileName: {
    type: String,
    required: true
  },
  relativePath: {
    type: String,
    required: true
  },
  mimeType: {
    type: String,
    required: true
  },
  extension: {
    type: String,
    required: true
  },
  sizeBytes: {
    type: Number,
    required: true
  },
  sha256: {
    type: String,
    required: true,
    index: true
  },
  prompt: {
    type: String,
    trim: true,
    maxlength: 32000,
    default: ""
  },
  revisedPrompt: {
    type: String,
    trim: true,
    default: ""
  },
  analysis: {
    description: {
      type: String,
      default: ""
    },
    extractedText: {
      type: String,
      default: ""
    },
    objects: {
      type: [String],
      default: []
    },
    safetyNotes: {
      type: String,
      default: ""
    },
    analyzedAt: Date,
    ai: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true,
  versionKey: false
});

imageAssetSchema.index({ userId: 1, createdAt: -1 });
imageAssetSchema.index({ userId: 1, conversationId: 1, createdAt: -1 });

export const ImageAsset = mongoose.model("ImageAsset", imageAssetSchema);
