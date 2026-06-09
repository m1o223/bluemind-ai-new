import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ["user", "assistant", "system"],
    required: true
  },
  content: {
    type: String,
    required: true,
    trim: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true,
  _id: true,
  versionKey: false
});

const conversationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  privateSpaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "PrivateSpace",
    index: true
  },
  title: {
    type: String,
    trim: true,
    maxlength: 120,
    default: "New conversation"
  },
  messages: {
    type: [messageSchema],
    default: []
  },
  summary: {
    type: String,
    default: ""
  },
  summaryMessageCount: {
    type: Number,
    default: 0
  },
  summaryUpdatedAt: {
    type: Date
  },
  deletedAt: {
    type: Date,
    index: true
  }
}, {
  timestamps: true,
  versionKey: false
});

conversationSchema.index({ userId: 1, privateSpaceId: 1, updatedAt: -1 });

export const Conversation = mongoose.model("Conversation", conversationSchema);
