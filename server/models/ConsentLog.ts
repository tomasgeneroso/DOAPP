import mongoose, { Schema, Document } from "mongoose";

export interface IConsentLog extends Document {
  userId: mongoose.Types.ObjectId;
  consentType:
    | "terms_and_conditions"
    | "privacy_policy"
    | "data_processing"
    | "marketing_emails"
    | "push_notifications"
    | "cookies"
    | "data_sharing"
    | "analytics";
  action: "accepted" | "rejected" | "updated" | "revoked";
  version: string; // Versión del documento aceptado
  ipAddress: string;
  userAgent: string;
  consentData?: any; // Datos adicionales del consentimiento
  previousValue?: boolean; // Valor anterior (para updates)
  newValue: boolean; // Valor nuevo
  timestamp: Date;
  expiresAt?: Date; // Algunos consentimientos pueden expirar
}

const ConsentLogSchema = new Schema<IConsentLog>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  consentType: {
    type: String,
    enum: [
      "terms_and_conditions",
      "privacy_policy",
      "data_processing",
      "marketing_emails",
      "push_notifications",
      "cookies",
      "data_sharing",
      "analytics",
    ],
    required: true,
    index: true,
  },
  action: {
    type: String,
    enum: ["accepted", "rejected", "updated", "revoked"],
    required: true,
  },
  version: {
    type: String,
    required: true,
  },
  ipAddress: {
    type: String,
    required: true,
  },
  userAgent: {
    type: String,
    required: true,
  },
  consentData: Schema.Types.Mixed,
  previousValue: Boolean,
  newValue: {
    type: Boolean,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
  },
  expiresAt: Date,
});

// Compound index for querying user consents
ConsentLogSchema.index({ userId: 1, consentType: 1, timestamp: -1 });

// Static method to log consent
ConsentLogSchema.statics.logConsent = async function (consentData: {
  userId: mongoose.Types.ObjectId;
  consentType: string;
  action: string;
  version: string;
  ipAddress: string;
  userAgent: string;
  newValue: boolean;
  previousValue?: boolean;
  expiresAt?: Date;
}) {
  return await this.create(consentData);
};

// Static method to get user's consent history
ConsentLogSchema.statics.getUserConsents = async function (
  userId: mongoose.Types.ObjectId,
  consentType?: string
) {
  const query: any = { userId };
  if (consentType) {
    query.consentType = consentType;
  }

  return await this.find(query).sort({ timestamp: -1 });
};

// Static method to get latest consent for a type
ConsentLogSchema.statics.getLatestConsent = async function (
  userId: mongoose.Types.ObjectId,
  consentType: string
) {
  return await this.findOne({ userId, consentType }).sort({ timestamp: -1 });
};

// Static method to check if user has valid consent
ConsentLogSchema.statics.hasValidConsent = async function (
  userId: mongoose.Types.ObjectId,
  consentType: string,
  requiredVersion?: string
): Promise<boolean> {
  const latestConsent = await this.findOne({ userId, consentType }).sort({
    timestamp: -1,
  });

  if (!latestConsent) return false;

  // Check if consent is not expired
  if (latestConsent.expiresAt && latestConsent.expiresAt < new Date()) {
    return false;
  }

  // Check if consent is accepted
  if (!latestConsent.newValue) return false;

  // Check version if required
  if (requiredVersion && latestConsent.version !== requiredVersion) {
    return false;
  }

  return true;
};

export const ConsentLog = mongoose.model<IConsentLog>(
  "ConsentLog",
  ConsentLogSchema
);
