import 'reflect-metadata';
import {
  Table,
  Column,
  Model,
  DataType,
  HasMany,
  BelongsTo,
  ForeignKey,
  BeforeCreate,
  BeforeUpdate,
  Default,
  AllowNull,
  Unique,
  Index,
} from 'sequelize-typescript';
import * as bcrypt from 'bcryptjs';
import { encryptCBU, decryptCBU, maskCBU } from '../../utils/encryption.js';

/**
 * User Model - PostgreSQL/Sequelize
 *
 * Modelo principal de usuarios con soporte para:
 * - Autenticación (local, Google, Facebook)
 * - Roles y permisos
 * - Sistema de ratings múltiples
 * - 2FA
 * - Membresías PRO
 * - Balance y transacciones
 * - Sistema de referidos
 */

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
  bankType?: 'mercadopago' | 'otro';
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
    { fields: ['username'], unique: true },
    { fields: ['google_id'] },
    { fields: ['facebook_id'] },
    { fields: ['twitter_id'] },
    { fields: ['role'] },
    { fields: ['is_verified'] },
    { fields: ['membership_tier'] },
    { fields: ['referred_by'] },
  ],
})
export class User extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  id!: string;

  // ============================================
  // BASIC INFORMATION
  // ============================================

  @AllowNull(false)
  @Column(DataType.STRING)
  name!: string;

  @AllowNull(false)
  @Unique
  @Index
  @Column(DataType.STRING(30))
  username!: string;

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

  // ============================================
  // RATINGS SYSTEM (Multiple Categories)
  // ============================================

  @Default(0.0)
  @Column(DataType.DECIMAL(3, 2))
  rating!: number;

  @Default(0)
  @Column(DataType.INTEGER)
  reviewsCount!: number;

  @Default(0)
  @Column(DataType.INTEGER)
  completedJobs!: number;

  @Default(0.0)
  @Column(DataType.DECIMAL(3, 2))
  workQualityRating!: number;

  @Default(0.0)
  @Column(DataType.DECIMAL(3, 2))
  workerRating!: number;

  @Default(0.0)
  @Column(DataType.DECIMAL(3, 2))
  contractRating!: number;

  @Default(0)
  @Column(DataType.INTEGER)
  workQualityReviewsCount!: number;

  @Default(0)
  @Column(DataType.INTEGER)
  workerReviewsCount!: number;

  @Default(0)
  @Column(DataType.INTEGER)
  contractReviewsCount!: number;

  // ============================================
  // AUTHENTICATION
  // ============================================

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

  @Index
  @Column(DataType.STRING)
  twitterId?: string;

  // ============================================
  // TWO-FACTOR AUTHENTICATION
  // ============================================

  @Default(false)
  @Column(DataType.BOOLEAN)
  twoFactorEnabled!: boolean;

  @Column(DataType.STRING)
  twoFactorSecret?: string;

  @Default([])
  @Column(DataType.ARRAY(DataType.TEXT))
  twoFactorBackupCodes?: string[];

  // ============================================
  // SECURITY
  // ============================================

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

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  bannedBy?: string;

  @BelongsTo(() => User, 'bannedBy')
  banningAdmin?: User;

  @Column(DataType.DATE)
  banExpiresAt?: Date;

  @Default(0)
  @Column(DataType.INTEGER)
  infractions!: number;

  @Default(100)
  @Column(DataType.INTEGER)
  trustScore!: number;

  @Default('none')
  @Column(DataType.STRING(20))
  verificationLevel!: 'none' | 'email' | 'phone' | 'document' | 'full';

  // ============================================
  // NOTIFICATIONS
  // ============================================

  @Default([])
  @Column(DataType.ARRAY(DataType.TEXT))
  fcmTokens!: string[];

  @Column(DataType.JSONB)
  notificationPreferences?: NotificationPreferences;

  // ============================================
  // PROFILE
  // ============================================

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

  @Default(false)
  @Column(DataType.BOOLEAN)
  dontAskBankingInfo!: boolean;

  @Column(DataType.JSONB)
  legalInfo?: LegalInfo;

  // ============================================
  // MEMBERSHIP
  // ============================================

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

  // ============================================
  // BALANCE
  // ============================================

  @Default(0.0)
  @Column(DataType.DECIMAL(12, 2))
  balanceArs!: number;

  // ============================================
  // REFERRALS
  // ============================================

  @Unique
  @Index
  @Column(DataType.STRING(8))
  referralCode?: string;

  @ForeignKey(() => User)
  @Index
  @Column(DataType.UUID)
  referredBy?: string;

  @BelongsTo(() => User, 'referredBy')
  referrer?: User;

  @Default(false)
  @Column(DataType.BOOLEAN)
  referralBonusAwarded!: boolean;

  @Default(0)
  @Column(DataType.INTEGER)
  referralTier!: number;

  @Default(0)
  @Column(DataType.INTEGER)
  totalReferrals!: number;

  @Default(0)
  @Column(DataType.INTEGER)
  completedReferrals!: number;

  @Default(false)
  @Column(DataType.BOOLEAN)
  isEarlyUser!: boolean;

  @Column(DataType.INTEGER)
  earlyUserNumber?: number;

  @Default(3)
  @Column(DataType.INTEGER)
  invitationCodesRemaining!: number;

  @Default(0)
  @Column(DataType.INTEGER)
  invitationCodesUsed!: number;

  // Fecha en que expira el descuento de comisión por referido (3% por 1 mes)
  // Después de esta fecha, vuelve al 8% si no tiene suscripción PRO/SUPER PRO
  @Column(DataType.DATE)
  referralDiscountExpiresAt?: Date;

  // Indica si el usuario ganó el descuento permanente (3%) por completar 3 referidos
  // NOTA: Este descuento ahora dura solo 1 mes desde que se otorga
  @Default(false)
  @Column(DataType.BOOLEAN)
  hasReferralDiscount!: boolean;

  @Default(0)
  @Column(DataType.INTEGER)
  referralBenefitsUsed!: number;

  // ============================================
  // FAMILY/FRIENDS PLAN
  // ============================================

  @Index
  @Column(DataType.UUID)
  familyCodeId?: string;

  @Default(false)
  @Column(DataType.BOOLEAN)
  hasFamilyPlan!: boolean;

  // ============================================
  // METHODS
  // ============================================

  /**
   * Compare password with hashed password
   */
  async comparePassword(candidatePassword: string): Promise<boolean> {
    if (!this.password) return false;
    try {
      // bcryptjs might export compare differently in ESM
      const compareFunc = bcrypt.compare || (bcrypt as any).default?.compare;
      if (!compareFunc) {
        console.error('bcrypt.compare is undefined:', typeof bcrypt, Object.keys(bcrypt));
        return false;
      }
      return await compareFunc(candidatePassword, this.password);
    } catch (error) {
      console.error('Error in comparePassword:', error);
      return false;
    }
  }

  /**
   * Get full name (alias for name)
   */
  getFullName(): string {
    return this.name;
  }

  /**
   * Check if user is admin
   */
  isAdmin(): boolean {
    return !!this.adminRole;
  }

  /**
   * Check if user has specific permission
   */
  hasPermission(permission: string): boolean {
    return this.permissions.includes(permission);
  }

  /**
   * Get user's membership status
   */
  getMembershipStatus(): 'active' | 'expired' | 'none' {
    if (!this.hasMembership || !this.membershipExpiresAt) return 'none';
    return new Date() < this.membershipExpiresAt ? 'active' : 'expired';
  }

  /**
   * Activate membership
   */
  async activateMembership(tier: 'pro' | 'super_pro', startDate?: Date, endDate?: Date): Promise<void> {
    this.hasMembership = true;
    this.membershipTier = tier;
    this.membershipExpiresAt = endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // Default 30 days
    // Set commission rate based on tier
    this.currentCommissionRate = tier === 'pro' ? 3 : 2; // PRO: 3%, SUPER_PRO: 2%
    await this.save();
  }

  /**
   * Deactivate membership
   */
  async deactivateMembership(): Promise<void> {
    this.hasMembership = false;
    this.membershipTier = undefined;
    this.membershipExpiresAt = undefined;
    this.currentCommissionRate = 8; // Reset to default 8%
    await this.save();
  }

  /**
   * Check if membership is active
   */
  hasMembershipActive(): boolean {
    if (!this.hasMembership || !this.membershipExpiresAt) return false;
    return new Date() < this.membershipExpiresAt;
  }

  /**
   * Increase trust score
   */
  async increaseTrustScore(amount: number): Promise<void> {
    this.trustScore = Math.min(100, this.trustScore + amount);
    await this.save();
  }

  /**
   * Decrease trust score
   */
  async decreaseTrustScore(amount: number): Promise<void> {
    this.trustScore = Math.max(0, this.trustScore - amount);
    await this.save();
  }

  /**
   * Check if user is verified (method version)
   */
  isVerifiedUser(): boolean {
    return this.isVerified;
  }

  /**
   * Update rating for specific category
   */
  async updateRating(newRating: number, category: 'workQuality' | 'worker' | 'contract'): Promise<void> {
    const categoryMap = {
      workQuality: { rating: 'workQualityRating', count: 'workQualityReviewsCount' },
      worker: { rating: 'workerRating', count: 'workerReviewsCount' },
      contract: { rating: 'contractRating', count: 'contractReviewsCount' },
    };

    const { rating: ratingField, count: countField } = categoryMap[category];
    const currentRating = parseFloat(this[ratingField as keyof User] as string) || 0;
    const currentCount = this[countField as keyof User] as number;

    // Calculate new average rating
    const totalRating = currentRating * currentCount + newRating;
    const newCount = currentCount + 1;
    const newAverage = totalRating / newCount;

    (this as any)[ratingField] = newAverage;
    (this as any)[countField] = newCount;

    // Update overall rating
    this.reviewsCount = newCount;

    await this.save();
  }

  /**
   * Calculate overall rating from all categories
   */
  calculateOverallRating(): number {
    const ratings = [
      { rating: parseFloat(this.workQualityRating as any) || 0, count: this.workQualityReviewsCount },
      { rating: parseFloat(this.workerRating as any) || 0, count: this.workerReviewsCount },
      { rating: parseFloat(this.contractRating as any) || 0, count: this.contractReviewsCount },
    ];

    let totalWeightedRating = 0;
    let totalCount = 0;

    ratings.forEach(({ rating, count }) => {
      totalWeightedRating += rating * count;
      totalCount += count;
    });

    return totalCount > 0 ? totalWeightedRating / totalCount : 0;
  }

  /**
   * Ban user
   */
  async ban(adminId: string, reason: string): Promise<void> {
    this.isBanned = true;
    this.bannedBy = adminId;
    this.banReason = reason;
    this.bannedAt = new Date();
    await this.save();
  }

  /**
   * Unban user
   */
  async unban(): Promise<void> {
    this.isBanned = false;
    this.bannedBy = undefined;
    this.banReason = undefined;
    this.bannedAt = undefined;
    this.banExpiresAt = undefined;
    await this.save();
  }

  /**
   * Enable 2FA
   */
  async enable2FA(secret: string, backupCodes: string[]): Promise<void> {
    this.twoFactorEnabled = true;
    this.twoFactorSecret = secret;
    this.twoFactorBackupCodes = backupCodes;
    await this.save();
  }

  /**
   * Disable 2FA
   */
  async disable2FA(): Promise<void> {
    this.twoFactorEnabled = false;
    this.twoFactorSecret = undefined;
    this.twoFactorBackupCodes = [];
    await this.save();
  }

  /**
   * Use a backup code
   */
  async useBackupCode(code: string): Promise<boolean> {
    if (!this.twoFactorBackupCodes) {
      this.twoFactorBackupCodes = [];
    }

    const index = this.twoFactorBackupCodes.indexOf(code);
    if (index === -1) {
      return false;
    }

    this.twoFactorBackupCodes.splice(index, 1);
    await this.save();
    return true;
  }

  /**
   * Add to balance
   */
  async addBalance(amount: number): Promise<void> {
    const currentBalance = parseFloat(this.balanceArs as any) || 0;
    this.balanceArs = (currentBalance + amount) as any;
    await this.save();
  }

  /**
   * Subtract from balance
   */
  async subtractBalance(amount: number): Promise<void> {
    const currentBalance = parseFloat(this.balanceArs as any) || 0;
    if (currentBalance < amount) {
      throw new Error('Insufficient balance');
    }
    this.balanceArs = (currentBalance - amount) as any;
    await this.save();
  }

  /**
   * Check if user has sufficient balance
   */
  hasSufficientBalance(amount: number): boolean {
    const currentBalance = parseFloat(this.balanceArs as any) || 0;
    return currentBalance >= amount;
  }

  /**
   * Get decrypted CBU for payment processing
   * ONLY use this when actually sending money to the user
   */
  getDecryptedCBU(): string | null {
    if (!this.bankingInfo?.cbu) return null;

    try {
      return decryptCBU(this.bankingInfo.cbu);
    } catch (error) {
      console.error('Error decrypting CBU:', error);
      return null;
    }
  }

  /**
   * Get masked CBU for display (shows only last 4 digits)
   */
  getMaskedCBU(): string | null {
    if (!this.bankingInfo?.cbu) return null;

    try {
      const decryptedCBU = decryptCBU(this.bankingInfo.cbu);
      return maskCBU(decryptedCBU);
    } catch (error) {
      console.error('Error processing CBU:', error);
      return null;
    }
  }

  // ============================================
  // HOOKS
  // ============================================

  /**
   * Normalize and validate data before creating user
   */
  @BeforeCreate
  static normalizeAndValidate(instance: User) {
    // Normalize email to lowercase
    if (instance.email) {
      instance.email = instance.email.toLowerCase().trim();
    }

    // Trim name
    if (instance.name) {
      instance.name = instance.name.trim();
    }

    // Normalize and validate username
    if (instance.username) {
      instance.username = instance.username.toLowerCase().trim();

      // Username validation: 3-30 chars, alphanumeric, dots, underscores
      const usernameRegex = /^[a-z0-9._]{3,30}$/;
      if (!usernameRegex.test(instance.username)) {
        throw new Error('El nombre de usuario debe tener entre 3-30 caracteres y solo puede contener letras, números, puntos y guiones bajos');
      }

      // Cannot start or end with dot/underscore
      if (/^[._]|[._]$/.test(instance.username)) {
        throw new Error('El nombre de usuario no puede empezar ni terminar con punto o guión bajo');
      }

      // Cannot have consecutive dots/underscores
      if (/[._]{2,}/.test(instance.username)) {
        throw new Error('El nombre de usuario no puede tener puntos o guiones bajos consecutivos');
      }
    }

    // Validate email format
    if (instance.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(instance.email)) {
        throw new Error('Invalid email format');
      }
    }
  }

  /**
   * Hash password before creating user
   */
  @BeforeCreate
  static async hashPassword(instance: User) {
    if (instance.password) {
      const salt = await bcrypt.genSalt(10);
      instance.password = await bcrypt.hash(instance.password, salt);
    }
  }

  /**
   * Generate unique referral code before creating user
   */
  @BeforeCreate
  static async generateReferralCode(instance: User) {
    if (!instance.referralCode) {
      let code: string;
      let isUnique = false;
      let attempts = 0;
      const maxAttempts = 10;

      while (!isUnique && attempts < maxAttempts) {
        code = User.createReferralCode();
        const existing = await User.findOne({ where: { referralCode: code } });
        if (!existing) {
          instance.referralCode = code;
          isUnique = true;
        }
        attempts++;
      }

      if (!isUnique) {
        throw new Error('Failed to generate unique referral code');
      }
    }
  }

  /**
   * Static helper: Generate random 8-character alphanumeric code
   */
  static createReferralCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  /**
   * Normalize and validate data before updating user
   */
  @BeforeUpdate
  static normalizeAndValidateOnUpdate(instance: User) {
    // Normalize email to lowercase if changed
    if (instance.changed('email') && instance.email) {
      instance.email = instance.email.toLowerCase().trim();

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(instance.email)) {
        throw new Error('Invalid email format');
      }
    }

    // Trim name if changed
    if (instance.changed('name') && instance.name) {
      instance.name = instance.name.trim();
    }
  }

  /**
   * Hash password before updating if password changed
   */
  @BeforeUpdate
  static async hashPasswordOnUpdate(instance: User) {
    if (instance.changed('password') && instance.password) {
      const salt = await bcrypt.genSalt(10);
      instance.password = await bcrypt.hash(instance.password, salt);
    }
  }

  /**
   * Set default notification preferences
   */
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

  /**
   * Encrypt CBU before saving (CREATE)
   */
  @BeforeCreate
  static async encryptBankingInfoOnCreate(instance: User) {
    if (instance.bankingInfo?.cbu) {
      try {
        // Only encrypt if not already encrypted (check format)
        const cbu = instance.bankingInfo.cbu;
        if (/^\d{22}$/.test(cbu)) {
          instance.bankingInfo.cbu = encryptCBU(cbu);
          console.log('✅ CBU encrypted on user creation');
        }
      } catch (error) {
        console.error('❌ Error encrypting CBU on create:', error);
        throw new Error('Failed to encrypt banking information');
      }
    }
  }

  /**
   * Encrypt CBU before updating (UPDATE)
   */
  @BeforeUpdate
  static async encryptBankingInfoOnUpdate(instance: User) {
    if (instance.changed('bankingInfo') && instance.bankingInfo?.cbu) {
      try {
        // Only encrypt if not already encrypted (check format)
        const cbu = instance.bankingInfo.cbu;
        if (/^\d{22}$/.test(cbu)) {
          instance.bankingInfo.cbu = encryptCBU(cbu);
          console.log('✅ CBU encrypted on user update');
        }
      } catch (error) {
        console.error('❌ Error encrypting CBU on update:', error);
        throw new Error('Failed to encrypt banking information');
      }
    }
  }
}

export default User;
