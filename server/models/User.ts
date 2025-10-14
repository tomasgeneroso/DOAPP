import mongoose, { Document, Schema } from "mongoose";
import bcrypt from "bcryptjs";

export interface IUser extends Document {
  name: string;
  email: string;
  password?: string;
  phone?: string;
  avatar?: string;
  bio?: string;
  rating: number;
  reviewsCount: number;
  completedJobs: number;
  termsAccepted: boolean;
  termsAcceptedAt?: Date;
  role: "client" | "doer" | "both";
  adminRole?: "owner" | "super_admin" | "admin" | "support" | "marketing" | "dpo";
  permissions: string[];
  isVerified: boolean;
  googleId?: string;
  facebookId?: string;

  // 2FA fields
  twoFactorEnabled: boolean;
  twoFactorSecret?: string;
  twoFactorBackupCodes?: string[];

  // Security fields
  lastLogin?: Date;
  lastLoginIP?: string;
  lastActivity?: Date;
  activeSessions: Array<{
    token: string;
    ip: string;
    userAgent: string;
    createdAt: Date;
    expiresAt: Date;
  }>;

  // Ban/Suspension fields
  isBanned: boolean;
  banReason?: string;
  bannedAt?: Date;
  bannedBy?: mongoose.Types.ObjectId;
  banExpiresAt?: Date;
  infractions: number;

  // Trust score
  trustScore: number;
  verificationLevel: "none" | "email" | "phone" | "document" | "full";

  // Push notification tokens
  fcmTokens: string[];
  notificationPreferences: {
    email: boolean;
    push: boolean;
    sms: boolean;
    newMessage: boolean;
    jobUpdate: boolean;
    contractUpdate: boolean;
    paymentUpdate: boolean;
    marketing: boolean;
  };

  // User interests/preferences
  interests: string[];
  onboardingCompleted: boolean;

  // Address information
  address?: {
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };

  // Banking information
  bankingInfo?: {
    accountHolder?: string;
    bankName?: string;
    accountType?: "savings" | "checking";
    accountNumber?: string; // Encrypted
    cbu?: string; // Argentina CBU
    alias?: string;
  };

  // Legal/Tax information
  legalInfo?: {
    idType?: "dni" | "passport" | "cuit" | "cuil";
    idNumber?: string;
    taxStatus?: "freelancer" | "autonomo" | "monotributo" | "responsable_inscripto";
    taxId?: string; // CUIT/CUIL
  };

  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: [true, "El nombre es requerido"],
      trim: true,
      maxlength: [50, "El nombre no puede exceder 50 caracteres"],
    },
    email: {
      type: String,
      sparse: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        "Por favor ingresa un email válido",
      ],
    },
    password: {
      type: String,
      minlength: [6, "La contraseña debe tener al menos 6 caracteres"],
      select: false,
    },
    googleId: {
      type: String,
      sparse: true,
      unique: true,
    },
    facebookId: {
      type: String,
      sparse: true,
      unique: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    avatar: {
      type: String,
      default: "",
    },
    bio: {
      type: String,
      maxlength: [500, "La biografía no puede exceder 500 caracteres"],
    },
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    reviewsCount: {
      type: Number,
      default: 0,
    },
    completedJobs: {
      type: Number,
      default: 0,
    },
    termsAccepted: {
      type: Boolean,
      required: [true, "Debes aceptar los términos y condiciones"],
      default: false,
    },
    termsAcceptedAt: {
      type: Date,
    },
    role: {
      type: String,
      enum: ["client", "doer", "both"],
      default: "both",
    },
    adminRole: {
      type: String,
      enum: ["owner", "super_admin", "admin", "support", "marketing", "dpo"],
    },
    permissions: {
      type: [String],
      default: [],
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    // 2FA fields
    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },
    twoFactorSecret: {
      type: String,
      select: false,
    },
    twoFactorBackupCodes: {
      type: [String],
      select: false,
    },
    // Security fields
    lastLogin: {
      type: Date,
    },
    lastLoginIP: {
      type: String,
    },
    lastActivity: {
      type: Date,
    },
    activeSessions: [{
      token: String,
      ip: String,
      userAgent: String,
      createdAt: Date,
      expiresAt: Date,
    }],
    // Ban/Suspension fields
    isBanned: {
      type: Boolean,
      default: false,
    },
    banReason: {
      type: String,
    },
    bannedAt: {
      type: Date,
    },
    bannedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    banExpiresAt: {
      type: Date,
    },
    infractions: {
      type: Number,
      default: 0,
    },
    // Trust score
    trustScore: {
      type: Number,
      default: 100,
      min: 0,
      max: 100,
    },
    verificationLevel: {
      type: String,
      enum: ["none", "email", "phone", "document", "full"],
      default: "none",
    },
    // Push notification tokens
    fcmTokens: {
      type: [String],
      default: [],
    },
    notificationPreferences: {
      type: {
        email: { type: Boolean, default: true },
        push: { type: Boolean, default: true },
        sms: { type: Boolean, default: false },
        newMessage: { type: Boolean, default: true },
        jobUpdate: { type: Boolean, default: true },
        contractUpdate: { type: Boolean, default: true },
        paymentUpdate: { type: Boolean, default: true },
        marketing: { type: Boolean, default: false },
      },
      default: {
        email: true,
        push: true,
        sms: false,
        newMessage: true,
        jobUpdate: true,
        contractUpdate: true,
        paymentUpdate: true,
        marketing: false,
      },
    },
    // User interests/preferences
    interests: {
      type: [String],
      default: [],
      index: true,
    },
    onboardingCompleted: {
      type: Boolean,
      default: false,
    },
    // Address information
    address: {
      type: {
        street: { type: String, trim: true },
        city: { type: String, trim: true },
        state: { type: String, trim: true },
        postalCode: { type: String, trim: true },
        country: { type: String, trim: true, default: "Argentina" },
      },
      default: {},
    },
    // Banking information
    bankingInfo: {
      type: {
        accountHolder: { type: String, trim: true },
        bankName: { type: String, trim: true },
        accountType: { type: String, enum: ["savings", "checking"] },
        accountNumber: { type: String, select: false }, // Encrypted, not returned by default
        cbu: { type: String, trim: true },
        alias: { type: String, trim: true },
      },
      default: {},
      select: false, // Don't return banking info by default
    },
    // Legal/Tax information
    legalInfo: {
      type: {
        idType: { type: String, enum: ["dni", "passport", "cuit", "cuil"] },
        idNumber: { type: String, trim: true },
        taxStatus: {
          type: String,
          enum: ["freelancer", "autonomo", "monotributo", "responsable_inscripto"]
        },
        taxId: { type: String, trim: true }, // CUIT/CUIL
      },
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Hash password antes de guardar
userSchema.pre("save", async function (next) {
  if (!this.isModified("password") || !this.password) {
    return next();
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Método para comparar contraseñas
userSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Índices para búsquedas rápidas
// El índice de email ya se crea automáticamente por unique: true
userSchema.index({ rating: -1 });

export default mongoose.model<IUser>("User", userSchema);
