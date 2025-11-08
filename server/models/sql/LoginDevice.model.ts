import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';
import { User } from './User.model.js';
import { Op } from 'sequelize';

/**
 * LoginDevice Model
 *
 * Tracks login devices for security monitoring and anomaly detection.
 * Supports device fingerprinting and trusted device management.
 */
@Table({
  tableName: 'login_devices',
  timestamps: true,
  indexes: [
    {
      fields: ['userId', 'lastLoginAt'],
      name: 'idx_login_device_user',
    },
    {
      fields: ['deviceFingerprint'],
      name: 'idx_login_device_fingerprint',
    },
    {
      fields: ['userId', 'deviceFingerprint'],
      unique: true,
      name: 'idx_login_device_user_fingerprint',
    },
    {
      fields: ['isTrusted'],
      name: 'idx_login_device_trusted',
    },
  ],
})
export class LoginDevice extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  id!: string;

  @ForeignKey(() => User)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  userId!: string;

  @BelongsTo(() => User)
  user?: User;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  deviceFingerprint!: string;

  @Column({
    type: DataType.STRING(45),
    allowNull: false,
  })
  ipAddress!: string;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
  })
  userAgent!: string;

  @Column({
    type: DataType.ENUM('desktop', 'mobile', 'tablet', 'unknown'),
    allowNull: false,
    defaultValue: 'unknown',
  })
  deviceType!: 'desktop' | 'mobile' | 'tablet' | 'unknown';

  @Column({
    type: DataType.STRING(100),
    allowNull: true,
  })
  browser?: string;

  @Column({
    type: DataType.STRING(100),
    allowNull: true,
  })
  os?: string;

  @Column({
    type: DataType.STRING(100),
    allowNull: true,
  })
  country?: string;

  @Column({
    type: DataType.STRING(100),
    allowNull: true,
  })
  city?: string;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  lastLoginAt!: Date;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 1,
  })
  loginCount!: number;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  isTrusted!: boolean;

  @CreatedAt
  createdAt!: Date;

  @UpdatedAt
  updatedAt!: Date;

  /**
   * Record a new login from this device
   */
  async recordLogin(ipAddress: string): Promise<void> {
    this.ipAddress = ipAddress;
    this.lastLoginAt = new Date();
    this.loginCount += 1;
    await this.save();
  }

  /**
   * Mark device as trusted
   */
  async markAsTrusted(): Promise<void> {
    this.isTrusted = true;
    await this.save();
  }

  /**
   * Revoke trust from device
   */
  async revokeTrust(): Promise<void> {
    this.isTrusted = false;
    await this.save();
  }

  /**
   * Get or create login device
   */
  static async getOrCreate(data: {
    userId: string;
    deviceFingerprint: string;
    ipAddress: string;
    userAgent: string;
    deviceType?: 'desktop' | 'mobile' | 'tablet' | 'unknown';
    browser?: string;
    os?: string;
    country?: string;
    city?: string;
  }): Promise<LoginDevice> {
    const [device, created] = await LoginDevice.findOrCreate({
      where: {
        userId: data.userId,
        deviceFingerprint: data.deviceFingerprint,
      },
      defaults: {
        userId: data.userId,
        deviceFingerprint: data.deviceFingerprint,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        deviceType: data.deviceType || 'unknown',
        browser: data.browser,
        os: data.os,
        country: data.country,
        city: data.city,
        lastLoginAt: new Date(),
        loginCount: 1,
        isTrusted: false,
      },
    });

    if (!created) {
      await device.recordLogin(data.ipAddress);
    }

    return device;
  }

  /**
   * Get all devices for a user
   */
  static async getUserDevices(
    userId: string,
    options?: {
      trustedOnly?: boolean;
      limit?: number;
    }
  ): Promise<LoginDevice[]> {
    const where: any = { userId };

    if (options?.trustedOnly) {
      where.isTrusted = true;
    }

    return await LoginDevice.findAll({
      where,
      order: [['lastLoginAt', 'DESC']],
      limit: options?.limit || 50,
    });
  }

  /**
   * Check if device is trusted
   */
  static async isDeviceTrusted(
    userId: string,
    deviceFingerprint: string
  ): Promise<boolean> {
    const device = await LoginDevice.findOne({
      where: {
        userId,
        deviceFingerprint,
        isTrusted: true,
      },
    });

    return device !== null;
  }

  /**
   * Get devices that haven't been used recently
   */
  static async getInactiveDevices(
    userId: string,
    inactiveDays: number = 90
  ): Promise<LoginDevice[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - inactiveDays);

    return await LoginDevice.findAll({
      where: {
        userId,
        lastLoginAt: {
          [Op.lt]: cutoffDate,
        },
      },
      order: [['lastLoginAt', 'DESC']],
    });
  }

  /**
   * Remove device
   */
  static async removeDevice(
    userId: string,
    deviceFingerprint: string
  ): Promise<boolean> {
    const result = await LoginDevice.destroy({
      where: {
        userId,
        deviceFingerprint,
      },
    });

    return result > 0;
  }

  /**
   * Cleanup old inactive devices
   */
  static async cleanupInactiveDevices(inactiveDays: number = 365): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - inactiveDays);

    const result = await LoginDevice.destroy({
      where: {
        lastLoginAt: {
          [Op.lt]: cutoffDate,
        },
        isTrusted: false,
      },
    });

    return result;
  }
}
