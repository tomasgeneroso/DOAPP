import mongoose, { Document, Schema } from "mongoose";

export interface IDispute extends Document {
  contractId: mongoose.Types.ObjectId;
  initiatedBy: mongoose.Types.ObjectId;
  respondent: mongoose.Types.ObjectId;
  reason: string;
  description: string;
  evidence: {
    type: "image" | "document" | "link";
    url: string;
    description?: string;
  }[];
  status: "open" | "under_review" | "resolved" | "closed";
  resolution?: string;
  resolvedBy?: mongoose.Types.ObjectId;
  resolvedAt?: Date;
  refundAmount?: number;
  refundTo?: "client" | "doer" | "split";
  adminNotes?: string;
  messages: {
    userId: mongoose.Types.ObjectId;
    message: string;
    createdAt: Date;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

const disputeSchema = new Schema<IDispute>(
  {
    contractId: {
      type: Schema.Types.ObjectId,
      ref: "Contract",
      required: true,
      unique: true,
      index: true,
    },
    initiatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    respondent: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    reason: {
      type: String,
      required: [true, "El motivo de la disputa es requerido"],
      enum: [
        "work_not_completed",
        "poor_quality",
        "payment_issue",
        "communication_issue",
        "contract_breach",
        "other",
      ],
    },
    description: {
      type: String,
      required: [true, "La descripción es requerida"],
      maxlength: [2000, "La descripción no puede exceder 2000 caracteres"],
    },
    evidence: [{
      type: {
        type: String,
        enum: ["image", "document", "link"],
        required: true,
      },
      url: {
        type: String,
        required: true,
      },
      description: String,
    }],
    status: {
      type: String,
      enum: ["open", "under_review", "resolved", "closed"],
      default: "open",
      index: true,
    },
    resolution: {
      type: String,
      maxlength: [2000, "La resolución no puede exceder 2000 caracteres"],
    },
    resolvedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    resolvedAt: {
      type: Date,
    },
    refundAmount: {
      type: Number,
      min: 0,
    },
    refundTo: {
      type: String,
      enum: ["client", "doer", "split"],
    },
    adminNotes: {
      type: String,
      maxlength: [2000, "Las notas del administrador no pueden exceder 2000 caracteres"],
    },
    messages: [{
      userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
      message: {
        type: String,
        required: true,
        maxlength: [1000, "El mensaje no puede exceder 1000 caracteres"],
      },
      createdAt: {
        type: Date,
        default: Date.now,
      },
    }],
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
disputeSchema.index({ status: 1, createdAt: -1 });
disputeSchema.index({ initiatedBy: 1, status: 1 });

export default mongoose.model<IDispute>("Dispute", disputeSchema);
