import mongoose, { Schema, Document } from "mongoose";

export interface IConversation extends Document {
  participants: mongoose.Types.ObjectId[];
  contractId?: mongoose.Types.ObjectId;
  type: "contract" | "direct" | "support";
  lastMessage?: string;
  lastMessageAt?: Date;
  unreadCount: Map<string, number>; // userId -> count
  archived: boolean;
  archivedBy: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const ConversationSchema = new Schema<IConversation>(
  {
    participants: [{
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    }],
    contractId: {
      type: Schema.Types.ObjectId,
      ref: "Contract",
    },
    type: {
      type: String,
      enum: ["contract", "direct", "support"],
      default: "direct",
      required: true,
    },
    lastMessage: {
      type: String,
      maxlength: 200,
    },
    lastMessageAt: {
      type: Date,
    },
    unreadCount: {
      type: Map,
      of: Number,
      default: {},
    },
    archived: {
      type: Boolean,
      default: false,
    },
    archivedBy: [{
      type: Schema.Types.ObjectId,
      ref: "User",
    }],
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
ConversationSchema.index({ participants: 1 });
ConversationSchema.index({ contractId: 1 }, { unique: true, sparse: true });
ConversationSchema.index({ type: 1 });
ConversationSchema.index({ lastMessageAt: -1 });

// Ensure participants array has at least 2 users
ConversationSchema.pre("save", function (next) {
  if (this.participants.length < 2) {
    next(new Error("Conversation must have at least 2 participants"));
  } else {
    next();
  }
});

export default mongoose.model<IConversation>("Conversation", ConversationSchema);
