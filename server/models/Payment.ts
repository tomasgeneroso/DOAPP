import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    contractId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contract",
      required: true,
    },
    payerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: "USD",
    },
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed", "refunded", "held_escrow"],
      default: "pending",
    },
    paymentType: {
      type: String,
      enum: ["contract_payment", "escrow_deposit", "escrow_release", "refund"],
      required: true,
    },
    // PayPal specific fields
    paypalOrderId: {
      type: String,
    },
    paypalCaptureId: {
      type: String,
    },
    paypalPayerId: String,
    paypalPayerEmail: String,
    // Escrow management
    isEscrow: {
      type: Boolean,
      default: false,
    },
    escrowReleasedAt: Date,
    escrowReleasedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    // Refund tracking
    refundReason: String,
    refundedAt: Date,
    refundedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    // Metadata
    description: String,
    metadata: mongoose.Schema.Types.Mixed,
    // Platform fee
    platformFee: {
      type: Number,
      default: 0,
    },
    platformFeePercentage: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
paymentSchema.index({ contractId: 1, status: 1 });
paymentSchema.index({ payerId: 1, createdAt: -1 });
paymentSchema.index({ recipientId: 1, createdAt: -1 });
paymentSchema.index({ paypalOrderId: 1 }, { unique: true, sparse: true });
paymentSchema.index({ paypalCaptureId: 1 }, { unique: true, sparse: true });

export interface IPayment extends mongoose.Document {
  contractId: mongoose.Types.ObjectId;
  payerId: mongoose.Types.ObjectId;
  recipientId: mongoose.Types.ObjectId;
  amount: number;
  currency: string;
  status: "pending" | "processing" | "completed" | "failed" | "refunded" | "held_escrow";
  paymentType: "contract_payment" | "escrow_deposit" | "escrow_release" | "refund";
  paypalOrderId?: string;
  paypalCaptureId?: string;
  paypalPayerId?: string;
  paypalPayerEmail?: string;
  isEscrow: boolean;
  escrowReleasedAt?: Date;
  escrowReleasedBy?: mongoose.Types.ObjectId;
  refundReason?: string;
  refundedAt?: Date;
  refundedBy?: mongoose.Types.ObjectId;
  description?: string;
  metadata?: any;
  platformFee: number;
  platformFeePercentage: number;
  createdAt: Date;
  updatedAt: Date;
}

export default mongoose.model<IPayment>("Payment", paymentSchema);
