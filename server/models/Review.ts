import mongoose from "mongoose";

/**
 * Review Model for user ratings and feedback
 * Allows users to review each other after contract completion
 */

const reviewSchema = new mongoose.Schema(
  {
    contractId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contract",
      required: true,
    },
    reviewerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    reviewedId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      required: true,
      minlength: 10,
      maxlength: 1000,
    },
    // Specific ratings
    communication: {
      type: Number,
      min: 1,
      max: 5,
    },
    professionalism: {
      type: Number,
      min: 1,
      max: 5,
    },
    quality: {
      type: Number,
      min: 1,
      max: 5,
    },
    timeliness: {
      type: Number,
      min: 1,
      max: 5,
    },
    // Moderation
    isVisible: {
      type: Boolean,
      default: true,
    },
    isFlagged: {
      type: Boolean,
      default: false,
    },
    flagReason: {
      type: String,
    },
    moderatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    moderatedAt: {
      type: Date,
    },
    // Response from reviewed user
    response: {
      type: String,
      maxlength: 500,
    },
    respondedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
reviewSchema.index({ contractId: 1 });
reviewSchema.index({ reviewerId: 1, createdAt: -1 });
reviewSchema.index({ reviewedId: 1, isVisible: 1, createdAt: -1 });
reviewSchema.index({ rating: 1 });

// Ensure one review per user per contract
reviewSchema.index({ contractId: 1, reviewerId: 1 }, { unique: true });

export interface IReview extends mongoose.Document {
  contractId: mongoose.Types.ObjectId;
  reviewerId: mongoose.Types.ObjectId;
  reviewedId: mongoose.Types.ObjectId;
  rating: number;
  comment: string;
  communication?: number;
  professionalism?: number;
  quality?: number;
  timeliness?: number;
  isVisible: boolean;
  isFlagged: boolean;
  flagReason?: string;
  moderatedBy?: mongoose.Types.ObjectId;
  moderatedAt?: Date;
  response?: string;
  respondedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export default mongoose.model<IReview>("Review", reviewSchema);
