import mongoose, { Schema, Document } from "mongoose";

export interface IDataAccessLog extends Document {
  userId: mongoose.Types.ObjectId;
  accessedBy: mongoose.Types.ObjectId; // Who accessed the data
  accessType:
    | "view"
    | "export"
    | "modify"
    | "delete"
    | "share"
    | "download"
    | "print";
  dataType:
    | "profile"
    | "personal_info"
    | "financial_data"
    | "payment_history"
    | "contract_history"
    | "communication_logs"
    | "location_data"
    | "device_info"
    | "full_account";
  reason: string;
  ipAddress: string;
  userAgent: string;
  requestedFields?: string[]; // Specific fields accessed
  success: boolean;
  errorMessage?: string;
  timestamp: Date;
  metadata?: any; // Additional context
}

const DataAccessLogSchema = new Schema<IDataAccessLog>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  accessedBy: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  accessType: {
    type: String,
    enum: ["view", "export", "modify", "delete", "share", "download", "print"],
    required: true,
  },
  dataType: {
    type: String,
    enum: [
      "profile",
      "personal_info",
      "financial_data",
      "payment_history",
      "contract_history",
      "communication_logs",
      "location_data",
      "device_info",
      "full_account",
    ],
    required: true,
  },
  reason: {
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
  requestedFields: [String],
  success: {
    type: Boolean,
    required: true,
    default: true,
  },
  errorMessage: String,
  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
  },
  metadata: Schema.Types.Mixed,
});

// Compound indexes for efficient querying
DataAccessLogSchema.index({ userId: 1, timestamp: -1 });
DataAccessLogSchema.index({ accessedBy: 1, timestamp: -1 });
DataAccessLogSchema.index({ accessType: 1, dataType: 1, timestamp: -1 });

// TTL index for automatic deletion after 7 years (GDPR compliance)
DataAccessLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 220898880 });

// Static method to log data access
DataAccessLogSchema.statics.logAccess = async function (accessData: {
  userId: mongoose.Types.ObjectId;
  accessedBy: mongoose.Types.ObjectId;
  accessType: string;
  dataType: string;
  reason: string;
  ipAddress: string;
  userAgent: string;
  requestedFields?: string[];
  success?: boolean;
  errorMessage?: string;
  metadata?: any;
}) {
  return await this.create(accessData);
};

// Static method to get access history for a user
DataAccessLogSchema.statics.getUserAccessHistory = async function (
  userId: mongoose.Types.ObjectId,
  options?: {
    limit?: number;
    skip?: number;
    accessType?: string;
    dataType?: string;
    startDate?: Date;
    endDate?: Date;
  }
) {
  const query: any = { userId };

  if (options?.accessType) {
    query.accessType = options.accessType;
  }

  if (options?.dataType) {
    query.dataType = options.dataType;
  }

  if (options?.startDate || options?.endDate) {
    query.timestamp = {};
    if (options.startDate) {
      query.timestamp.$gte = options.startDate;
    }
    if (options.endDate) {
      query.timestamp.$lte = options.endDate;
    }
  }

  return await this.find(query)
    .sort({ timestamp: -1 })
    .limit(options?.limit || 100)
    .skip(options?.skip || 0)
    .populate("accessedBy", "name email adminRole");
};

// Static method to get suspicious access patterns
DataAccessLogSchema.statics.getSuspiciousAccess = async function (
  userId: mongoose.Types.ObjectId
) {
  // Find multiple export/download attempts in short time
  const recentExports = await this.find({
    userId,
    accessType: { $in: ["export", "download"] },
    timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
  }).sort({ timestamp: -1 });

  // Find access from multiple IPs in short time
  const recentAccess = await this.find({
    userId,
    timestamp: { $gte: new Date(Date.now() - 60 * 60 * 1000) },
  });

  const uniqueIPs = new Set(recentAccess.map((log) => log.ipAddress));

  return {
    recentExportsCount: recentExports.length,
    uniqueIPsLastHour: uniqueIPs.size,
    isSuspicious: recentExports.length > 5 || uniqueIPs.size > 3,
  };
};

export const DataAccessLog = mongoose.model<IDataAccessLog>(
  "DataAccessLog",
  DataAccessLogSchema
);
