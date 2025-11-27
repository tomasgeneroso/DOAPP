import 'reflect-metadata';
import {
  Table,
  Column,
  Model,
  DataType,
  BeforeCreate,
  BeforeUpdate,
  Default,
  AllowNull,
  Unique,
  Index,
} from 'sequelize-typescript';
import * as bcrypt from 'bcryptjs';

interface NotificationPreferences {
  email: boolean;
  push: boolean;
  sms: boolean;
  newMessage: boolean;
  jobUpdate: boolean;
  contractUpdate: boolean;
  paymentUpdate: boolean;
  marketing: boolean;
}

interface Address {
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

interface BankingInfo {
  accountHolder?: string;
  bankName?: string;
  accountType?: 'savings' | 'checking';
  accountNumber?: string;
  cbu?: string;
  alias?: string;
}

interface LegalInfo {
  idType?: 'dni' | 'passport' | 'cuit' | 'cuil';
  idNumber?: string;
  taxStatus?: 'freelancer' | 'autonomo' | 'monotributo' | 'responsable_inscripto';
  vatNumber?: string;
}

@Table({
  tableName: 'users',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['email'], unique: true },
    { fields: ['google_id'] },
    { fields: ['facebook_id'] },
    { fields: ['role'] },
    { fields: ['is_verified'] },
    { fields: ['membership_tier'] },
    { fields: ['referral_code'], unique: true },
  ],
})
export class User extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  id!: string;

  // Basic Information
  @AllowNull(false)
  @Column(DataType.STRING)
  name!: string;

  @AllowNull(false)
  @Unique
  @Index
  @Column(DataType.STRING)
  email!: string;

  @Column(DataType.STRING)
  password?: string;

  @Column(DataType.STRING)
  phone?: string;

  @Index
  @Column(DataType.STRING(20))
  dni?: string;

  @Column(DataType.TEXT)
  avatar?: string;

  @Column(DataType.TEXT)
  bio?: string;

  // Ratings
  @Default(0.0)
  @Column(DataType.DECIMAL(3, 2))
  rating!: number;

  @Default(0)
  @Column(DataType.INTEGER)
  reviewsCount!: number;

  @Default(0)
  @Column(DataType.INTEGER)
  completedJobs!: number;

  // Authentication
  @Default(false)
  @Column(DataType.BOOLEAN)
  termsAccepted!: boolean;

  @Column(DataType.DATE)
  termsAcceptedAt?: Date;

  @Default('user')
  @Index
  @Column(DataType.STRING(20))
  role!: 'user' | 'client' | 'doer' | 'both';

  @Column(DataType.STRING(50))
  adminRole?: 'owner' | 'super_admin' | 'admin' | 'support' | 'marketing' | 'dpo';

  @Default([])
  @Column(DataType.ARRAY(DataType.TEXT))
  permissions!: string[];

  @Default(false)
  @Index
  @Column(DataType.BOOLEAN)
  isVerified!: boolean;

  @Index
  @Column(DataType.STRING)
  googleId?: string;

  @Index
  @Column(DataType.STRING)
  facebookId?: string;

  // 2FA
  @Default(false)
  @Column(DataType.BOOLEAN)
  twoFactorEnabled!: boolean;

  @Column(DataType.STRING)
  twoFactorSecret?: string;

  @Default([])
  @Column(DataType.ARRAY(DataType.TEXT))
  twoFactorBackupCodes?: string[];

  // Security
  @Column(DataType.DATE)
  lastLogin?: Date;

  @Column(DataType.STRING(45))
  lastLoginIp?: string;

  @Column(DataType.DATE)
  lastActivity?: Date;

  @Default(false)
  @Column(DataType.BOOLEAN)
  isBanned!: boolean;

  @Column(DataType.TEXT)
  banReason?: string;

  @Column(DataType.DATE)
  bannedAt?: Date;

  @Column(DataType.UUID)
  bannedBy?: string;

  // Notifications
  @Default([])
  @Column(DataType.ARRAY(DataType.TEXT))
  fcmTokens!: string[];

  @Column(DataType.JSONB)
  notificationPreferences?: NotificationPreferences;

  // Profile
  @Default([])
  @Column(DataType.ARRAY(DataType.TEXT))
  interests!: string[];

  @Default(false)
  @Column(DataType.BOOLEAN)
  onboardingCompleted!: boolean;

  @Column(DataType.JSONB)
  address?: Address;

  @Column(DataType.JSONB)
  bankingInfo?: BankingInfo;

  @Column(DataType.JSONB)
  legalInfo?: LegalInfo;

  // Membership
  @Default(false)
  @Column(DataType.BOOLEAN)
  hasMembership!: boolean;

  @Index
  @Column(DataType.STRING(20))
  membershipTier?: 'free' | 'pro' | 'super_pro';

  @Column(DataType.DATE)
  membershipExpiresAt?: Date;

  @Default(false)
  @Column(DataType.BOOLEAN)
  isPremiumVerified!: boolean;

  @Default(8.0)
  @Column(DataType.DECIMAL(5, 2))
  currentCommissionRate!: number;

  @Default(3)
  @Column(DataType.INTEGER)
  freeContractsRemaining!: number;

  @Default(0)
  @Column(DataType.INTEGER)
  proContractsUsedThisMonth!: number;

  // Balance
  @Default(0.0)
  @Column(DataType.DECIMAL(12, 2))
  balanceArs!: number;

  // Referrals
  @Unique
  @Index
  @Column(DataType.STRING(8))
  referralCode?: string;

  @Column(DataType.UUID)
  referredBy?: string;

  @Default(0)
  @Column(DataType.INTEGER)
  totalReferrals!: number;

  @Default(3)
  @Column(DataType.INTEGER)
  invitationCodesRemaining!: number;

  // Methods
  async comparePassword(candidatePassword: string): Promise<boolean> {
    if (!this.password) return false;
    return bcrypt.compare(candidatePassword, this.password);
  }

  isAdmin(): boolean {
    return !!this.adminRole;
  }

  hasPermission(permission: string): boolean {
    return this.permissions.includes(permission) || this.permissions.includes('*');
  }

  // Hooks
  @BeforeCreate
  static async hashPassword(instance: User) {
    if (instance.password) {
      const salt = await bcrypt.genSalt(10);
      instance.password = await bcrypt.hash(instance.password, salt);
    }
  }

  @BeforeCreate
  static normalizeEmail(instance: User) {
    if (instance.email) {
      instance.email = instance.email.toLowerCase().trim();
    }
  }

  @BeforeCreate
  static async generateReferralCode(instance: User) {
    if (!instance.referralCode) {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let code = '';
      for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      instance.referralCode = code;
    }
  }

  @BeforeCreate
  static setDefaultPreferences(instance: User) {
    if (!instance.notificationPreferences) {
      instance.notificationPreferences = {
        email: true,
        push: true,
        sms: false,
        newMessage: true,
        jobUpdate: true,
        contractUpdate: true,
        paymentUpdate: true,
        marketing: false,
      };
    }
  }

  @BeforeUpdate
  static async hashPasswordOnUpdate(instance: User) {
    if (instance.changed('password') && instance.password) {
      const salt = await bcrypt.genSalt(10);
      instance.password = await bcrypt.hash(instance.password, salt);
    }
  }
}

export default User;
