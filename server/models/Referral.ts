import mongoose, { Document, Schema } from "mongoose";

export interface IReferral extends Document {
  referrer: mongoose.Types.ObjectId; // User who sent the referral
  referred: mongoose.Types.ObjectId; // User who was referred
  referralCode: string; // Code used for referral
  status: "pending" | "completed" | "credited"; // Referral status
  firstContractId?: mongoose.Types.ObjectId; // First contract completed by referred user
  firstContractCompletedAt?: Date; // When the first contract was completed
  creditedAt?: Date; // When the free contract was credited to referrer
  metadata?: {
    signupSource?: string; // Where the user signed up from
    ipAddress?: string; // IP address at signup
    userAgent?: string; // User agent at signup
  };
  createdAt: Date;
  updatedAt: Date;
}

const referralSchema = new Schema<IReferral>(
  {
    referrer: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    referred: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true, // Each user can only be referred once
      index: true,
    },
    referralCode: {
      type: String,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "completed", "credited"],
      default: "pending",
      index: true,
    },
    firstContractId: {
      type: Schema.Types.ObjectId,
      ref: "Contract",
    },
    firstContractCompletedAt: {
      type: Date,
    },
    creditedAt: {
      type: Date,
    },
    metadata: {
      type: {
        signupSource: { type: String },
        ipAddress: { type: String },
        userAgent: { type: String },
      },
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient queries
referralSchema.index({ referrer: 1, status: 1 });
referralSchema.index({ referred: 1, status: 1 });

// Prevent duplicate referrals
referralSchema.index({ referrer: 1, referred: 1 }, { unique: true });

export default mongoose.model<IReferral>("Referral", referralSchema);
