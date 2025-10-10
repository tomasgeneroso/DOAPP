import mongoose from "mongoose";

/**
 * Contract Negotiation Model
 * Tracks proposals, counter-proposals, and negotiation history
 */

const negotiationMessageSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    message: {
      type: String,
      required: true,
      maxlength: 1000,
    },
    proposedPrice: {
      type: Number,
      min: 0,
    },
    proposedStartDate: {
      type: Date,
    },
    proposedEndDate: {
      type: Date,
    },
    proposedTerms: {
      type: String,
      maxlength: 2000,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected", "countered"],
      default: "pending",
    },
  },
  {
    timestamps: true,
  }
);

const contractNegotiationSchema = new mongoose.Schema(
  {
    contractId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contract",
      required: true,
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    doerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    messages: [negotiationMessageSchema],
    currentProposal: {
      price: Number,
      startDate: Date,
      endDate: Date,
      terms: String,
      proposedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    },
    status: {
      type: String,
      enum: ["negotiating", "agreed", "cancelled"],
      default: "negotiating",
    },
    agreedAt: {
      type: Date,
    },
    cancelledAt: {
      type: Date,
    },
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
contractNegotiationSchema.index({ contractId: 1 });
contractNegotiationSchema.index({ clientId: 1, status: 1 });
contractNegotiationSchema.index({ doerId: 1, status: 1 });

export interface INegotiationMessage {
  userId: mongoose.Types.ObjectId;
  message: string;
  proposedPrice?: number;
  proposedStartDate?: Date;
  proposedEndDate?: Date;
  proposedTerms?: string;
  status: "pending" | "accepted" | "rejected" | "countered";
  createdAt: Date;
  updatedAt: Date;
}

export interface IContractNegotiation extends mongoose.Document {
  contractId: mongoose.Types.ObjectId;
  clientId: mongoose.Types.ObjectId;
  doerId: mongoose.Types.ObjectId;
  messages: INegotiationMessage[];
  currentProposal?: {
    price?: number;
    startDate?: Date;
    endDate?: Date;
    terms?: string;
    proposedBy?: mongoose.Types.ObjectId;
  };
  status: "negotiating" | "agreed" | "cancelled";
  agreedAt?: Date;
  cancelledAt?: Date;
  cancelledBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export default mongoose.model<IContractNegotiation>("ContractNegotiation", contractNegotiationSchema);
