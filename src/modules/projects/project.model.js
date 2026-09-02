import mongoose from "mongoose";

const projectSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 100
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500,
    default: ""
  },
  chatCount: {
    type: Number,
    min: 0,
    default: 0
  },
  fileCount: {
    type: Number,
    min: 0,
    default: 0
  },
  taskCount: {
    type: Number,
    min: 0,
    default: 0
  },
  deletedAt: {
    type: Date,
    index: true
  }
}, {
  timestamps: true,
  versionKey: false
});

projectSchema.index({ userId: 1, updatedAt: -1 });
projectSchema.index({ userId: 1, name: 1 });

export const Project = mongoose.model("Project", projectSchema);
