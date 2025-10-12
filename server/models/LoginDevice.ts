import mongoose, { Schema, Document } from "mongoose";

export interface ILoginDevice extends Document {
  userId: mongoose.Types.ObjectId;
  deviceFingerprint: string;
  ipAddress: string;
  userAgent: string;
  deviceType: "desktop" | "mobile" | "tablet" | "unknown";
  browser?: string;
  os?: string;
  country?: string;
  city?: string;
  lastLoginAt: Date;
  loginCount: number;
  isTrusted: boolean;
  createdAt: Date;
}

const LoginDeviceSchema = new Schema<ILoginDevice>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  deviceFingerprint: {
    type: String,
    required: true,
    index: true,
  },
  ipAddress: {
    type: String,
    required: true,
  },
  userAgent: {
    type: String,
    required: true,
  },
  deviceType: {
    type: String,
    enum: ["desktop", "mobile", "tablet", "unknown"],
    default: "unknown",
  },
  browser: String,
  os: String,
  country: String,
  city: String,
  lastLoginAt: {
    type: Date,
    default: Date.now,
  },
  loginCount: {
    type: Number,
    default: 1,
  },
  isTrusted: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Compound index for user + device fingerprint
LoginDeviceSchema.index({ userId: 1, deviceFingerprint: 1 }, { unique: true });

// Method to parse user agent
LoginDeviceSchema.methods.parseUserAgent = function () {
  const ua = this.userAgent.toLowerCase();

  // Detect device type
  if (ua.includes("mobile")) {
    this.deviceType = "mobile";
  } else if (ua.includes("tablet") || ua.includes("ipad")) {
    this.deviceType = "tablet";
  } else {
    this.deviceType = "desktop";
  }

  // Detect browser
  if (ua.includes("firefox")) this.browser = "Firefox";
  else if (ua.includes("chrome")) this.browser = "Chrome";
  else if (ua.includes("safari")) this.browser = "Safari";
  else if (ua.includes("edge")) this.browser = "Edge";
  else if (ua.includes("opera")) this.browser = "Opera";
  else this.browser = "Unknown";

  // Detect OS
  if (ua.includes("windows")) this.os = "Windows";
  else if (ua.includes("mac")) this.os = "macOS";
  else if (ua.includes("linux")) this.os = "Linux";
  else if (ua.includes("android")) this.os = "Android";
  else if (ua.includes("ios") || ua.includes("iphone") || ua.includes("ipad"))
    this.os = "iOS";
  else this.os = "Unknown";
};

// Static method to record login
LoginDeviceSchema.statics.recordLogin = async function (
  userId: mongoose.Types.ObjectId,
  deviceFingerprint: string,
  ipAddress: string,
  userAgent: string
) {
  let device = await this.findOne({ userId, deviceFingerprint });

  if (device) {
    // Update existing device
    device.lastLoginAt = new Date();
    device.loginCount += 1;
    device.ipAddress = ipAddress;
    device.userAgent = userAgent;
    await device.save();
  } else {
    // Create new device
    device = await this.create({
      userId,
      deviceFingerprint,
      ipAddress,
      userAgent,
    });
    device.parseUserAgent();
    await device.save();
  }

  return device;
};

// Static method to get user devices
LoginDeviceSchema.statics.getUserDevices = async function (
  userId: mongoose.Types.ObjectId
) {
  return this.find({ userId }).sort({ lastLoginAt: -1 });
};

// Static method to mark device as trusted
LoginDeviceSchema.statics.trustDevice = async function (
  userId: mongoose.Types.ObjectId,
  deviceFingerprint: string
) {
  return this.updateOne({ userId, deviceFingerprint }, { isTrusted: true });
};

export const LoginDevice = mongoose.model<ILoginDevice>(
  "LoginDevice",
  LoginDeviceSchema
);
