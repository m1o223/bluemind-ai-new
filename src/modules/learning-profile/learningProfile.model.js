import mongoose from "mongoose";

const learningMethodSchema = new mongoose.Schema({
  method: {
    type: String,
    required: true,
    trim: true,
    maxlength: 80
  },
  evidence: {
    type: String,
    trim: true,
    maxlength: 240,
    default: ""
  },
  confidence: {
    type: Number,
    min: 0,
    max: 1,
    default: 0.7
  },
  lastSeenAt: {
    type: Date,
    default: Date.now
  }
}, {
  _id: false,
  versionKey: false
});

const learningProfileSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true,
    index: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    default: ""
  },
  username: {
    type: String,
    trim: true,
    default: ""
  },
  preferredExplanationStyles: {
    type: [String],
    default: []
  },
  preferredExamplesStyle: {
    type: [String],
    default: []
  },
  preferredTone: {
    type: String,
    trim: true,
    maxlength: 80,
    default: ""
  },
  subjectsUserStrugglesWith: {
    type: [String],
    default: []
  },
  conceptsUserStrugglesWith: {
    type: [String],
    default: []
  },
  methodsWorked: {
    type: [learningMethodSchema],
    default: []
  },
  methodsFailed: {
    type: [learningMethodSchema],
    default: []
  },
  flags: {
    prefersExamples: { type: Boolean, default: false },
    prefersShortExplanations: { type: Boolean, default: false },
    prefersStepByStep: { type: Boolean, default: false },
    prefersVisuals: { type: Boolean, default: false },
    strugglesWithFormulas: { type: Boolean, default: false },
    strugglesWithTechnicalTerms: { type: Boolean, default: false },
    prefersLightHumor: { type: Boolean, default: false },
    prefersSeriousTone: { type: Boolean, default: false }
  },
  lastLearningContext: {
    subject: {
      type: String,
      trim: true,
      maxlength: 120,
      default: ""
    },
    concept: {
      type: String,
      trim: true,
      maxlength: 160,
      default: ""
    },
    updatedAt: Date
  },
  updateCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true,
  versionKey: false
});

learningProfileSchema.index({ userId: 1, updatedAt: -1 });

export const LearningProfile = mongoose.model("LearningProfile", learningProfileSchema);
