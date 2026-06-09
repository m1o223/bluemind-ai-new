import mongoose from "mongoose";

const privateSpaceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  name: {
    type: String,
    trim: true,
    required: true,
    minlength: 1,
    maxlength: 80
  },
  hashedPin: {
    type: String,
    required: true,
    select: false
  },
  deletedAt: {
    type: Date,
    index: true
  }
}, {
  timestamps: true,
  versionKey: false
});

privateSpaceSchema.index({ userId: 1, name: 1 });

export const PrivateSpace = mongoose.model("PrivateSpace", privateSpaceSchema);
