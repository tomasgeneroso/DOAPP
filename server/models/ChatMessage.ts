import mongoose, { Schema, Document } from "mongoose";

export interface IChatMessage extends Document {
  conversationId: mongoose.Types.ObjectId; // Reference to Contract or Chat Room
  sender: mongoose.Types.ObjectId;
  message: string;
  type: "text" | "image" | "file" | "system" | "proposal";
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  proposalAmount?: number;
  read: boolean;
  readAt?: Date;
  deleted: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ChatMessageSchema = new Schema<IChatMessage>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    message: {
      type: String,
      required: true,
      maxlength: 5000,
    },
    type: {
      type: String,
      enum: ["text", "image", "file", "system", "proposal"],
      default: "text",
    },
    fileUrl: {
      type: String,
    },
    fileName: {
      type: String,
    },
    fileSize: {
      type: Number,
    },
    proposalAmount: {
      type: Number,
      min: 0,
    },
    read: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
    },
    deleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries
ChatMessageSchema.index({ conversationId: 1, createdAt: -1 });
ChatMessageSchema.index({ sender: 1, conversationId: 1 });
ChatMessageSchema.index({ conversationId: 1, read: 1 });

export default mongoose.model<IChatMessage>("ChatMessage", ChatMessageSchema);
