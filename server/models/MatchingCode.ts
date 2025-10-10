import mongoose from "mongoose";
import crypto from "crypto";

/**
 * Matching Code Model for secure user verification
 * Generates temporary codes that expire after 30 minutes
 * Both parties must exchange codes to verify they're meeting the right person
 */

const matchingCodeSchema = new mongoose.Schema(
  {
    contractId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contract",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Hash of the actual code (for security)
    codeHash: {
      type: String,
      required: true,
    },
    // When the code becomes valid (10 min before meeting)
    validFrom: {
      type: Date,
      required: true,
    },
    // When the code expires (30 min after validFrom)
    expiresAt: {
      type: Date,
      required: true,
    },
    // Whether this code has been used/verified
    isUsed: {
      type: Boolean,
      default: false,
    },
    // When it was used
    usedAt: {
      type: Date,
    },
    // IP address where it was used
    usedFromIp: {
      type: String,
    },
    // Verification with partner
    partnerVerified: {
      type: Boolean,
      default: false,
    },
    partnerVerifiedAt: {
      type: Date,
    },
    // Meeting details
    scheduledMeetingTime: {
      type: Date,
      required: true,
    },
    meetingLocation: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
matchingCodeSchema.index({ contractId: 1, userId: 1 });
matchingCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // Auto-delete expired codes

// Methods
matchingCodeSchema.methods.isValid = function (): boolean {
  const now = new Date();
  return (
    !this.isUsed &&
    now >= this.validFrom &&
    now <= this.expiresAt
  );
};

matchingCodeSchema.methods.verifyCode = function (code: string): boolean {
  const hash = crypto.createHash("sha256").update(code).digest("hex");
  return this.codeHash === hash;
};

export interface IMatchingCode extends mongoose.Document {
  contractId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  codeHash: string;
  validFrom: Date;
  expiresAt: Date;
  isUsed: boolean;
  usedAt?: Date;
  usedFromIp?: string;
  partnerVerified: boolean;
  partnerVerifiedAt?: Date;
  scheduledMeetingTime: Date;
  meetingLocation?: string;
  createdAt: Date;
  updatedAt: Date;
  isValid(): boolean;
  verifyCode(code: string): boolean;
}

/**
 * Static method to generate a new matching code
 */
matchingCodeSchema.statics.generateCode = async function (
  contractId: mongoose.Types.ObjectId,
  userId: mongoose.Types.ObjectId,
  scheduledMeetingTime: Date,
  meetingLocation?: string
): Promise<{ code: string; document: IMatchingCode }> {
  // Generate random 6-digit code
  const code = Math.floor(100000 + Math.random() * 900000).toString();

  // Hash the code
  const codeHash = crypto.createHash("sha256").update(code).digest("hex");

  // Calculate valid from (10 minutes before meeting)
  const validFrom = new Date(scheduledMeetingTime.getTime() - 10 * 60 * 1000);

  // Calculate expiry (30 minutes after valid from)
  const expiresAt = new Date(validFrom.getTime() + 30 * 60 * 1000);

  // Create document
  const document = await this.create({
    contractId,
    userId,
    codeHash,
    validFrom,
    expiresAt,
    scheduledMeetingTime,
    meetingLocation,
  });

  return { code, document };
};

export default mongoose.model<IMatchingCode>("MatchingCode", matchingCodeSchema);
