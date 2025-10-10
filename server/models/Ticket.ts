import mongoose, { Document, Schema } from "mongoose";

export interface ITicketMessage {
  author: mongoose.Types.ObjectId;
  message: string;
  attachments?: string[];
  createdAt: Date;
  isInternal: boolean; // Solo visible para staff
}

export interface ITicket extends Document {
  ticketNumber: string;
  subject: string;
  category: "bug" | "feature" | "support" | "report_user" | "report_contract" | "dispute" | "payment" | "other";
  priority: "low" | "medium" | "high" | "urgent";
  status: "open" | "assigned" | "in_progress" | "waiting_user" | "resolved" | "closed";

  // Referencias
  createdBy: mongoose.Types.ObjectId;
  assignedTo?: mongoose.Types.ObjectId;
  relatedUser?: mongoose.Types.ObjectId;
  relatedContract?: mongoose.Types.ObjectId;

  // Mensajes
  messages: ITicketMessage[];

  // Metadata
  tags: string[];
  resolution?: string;
  closedAt?: Date;
  closedBy?: mongoose.Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

const ticketMessageSchema = new Schema<ITicketMessage>({
  author: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  message: {
    type: String,
    required: true,
    maxlength: 5000,
  },
  attachments: [{
    type: String,
  }],
  createdAt: {
    type: Date,
    default: Date.now,
  },
  isInternal: {
    type: Boolean,
    default: false,
  },
});

const ticketSchema = new Schema<ITicket>(
  {
    ticketNumber: {
      type: String,
      required: true,
    },
    subject: {
      type: String,
      required: [true, "El asunto es requerido"],
      maxlength: [200, "El asunto no puede exceder 200 caracteres"],
    },
    category: {
      type: String,
      enum: ["bug", "feature", "support", "report_user", "report_contract", "dispute", "payment", "other"],
      required: true,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
    },
    status: {
      type: String,
      enum: ["open", "assigned", "in_progress", "waiting_user", "resolved", "closed"],
      default: "open",
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    relatedUser: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    relatedContract: {
      type: Schema.Types.ObjectId,
      ref: "Contract",
    },
    messages: [ticketMessageSchema],
    tags: [{
      type: String,
    }],
    resolution: {
      type: String,
      maxlength: 1000,
    },
    closedAt: {
      type: Date,
    },
    closedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

// Auto-generar ticket number
ticketSchema.pre("save", async function (next) {
  if (this.isNew && !this.ticketNumber) {
    const count = await mongoose.model("Ticket").countDocuments();
    this.ticketNumber = `TK-${String(count + 1).padStart(6, "0")}`;
  }
  next();
});

// Índices
ticketSchema.index({ ticketNumber: 1 }, { unique: true });
ticketSchema.index({ createdBy: 1, status: 1 });
ticketSchema.index({ assignedTo: 1, status: 1 });
ticketSchema.index({ category: 1, status: 1 });
ticketSchema.index({ priority: -1, createdAt: -1 });

export default mongoose.model<ITicket>("Ticket", ticketSchema);
