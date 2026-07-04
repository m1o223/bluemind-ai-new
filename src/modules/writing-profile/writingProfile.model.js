import mongoose from "mongoose";

const writingSampleSchema = new mongoose.Schema({
  text: {
    type: String,
    required: true,
    trim: true,
    maxlength: 8000
  },
  source: {
    type: String,
    trim: true,
    maxlength: 80,
    default: "paste"
  },
  context: {
    type: String,
    trim: true,
    maxlength: 120,
    default: ""
  }
}, {
  timestamps: true,
  _id: true,
  versionKey: false
});

const writingProfileSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true,
    index: true
  },
  status: {
    type: String,
    enum: ["empty", "draft", "ready"],
    default: "empty",
    index: true
  },
  samples: {
    type: [writingSampleSchema],
    default: []
  },
  analysis: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  summary: {
    type: String,
    default: ""
  },
  testText: {
    type: String,
    default: ""
  },
  updateReason: {
    type: String,
    default: ""
  },
  version: {
    type: Number,
    default: 1
  },
  confirmedAt: {
    type: Date
  },
  lastAnalyzedAt: {
    type: Date
  }
}, {
  timestamps: true,
  versionKey: false
});

writingProfileSchema.index({ userId: 1, updatedAt: -1 });

export const WritingProfile = mongoose.model("WritingProfile", writingProfileSchema);
