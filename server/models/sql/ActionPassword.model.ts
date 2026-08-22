import { Table, Column, Model, DataType } from 'sequelize-typescript';
import * as bcrypt from 'bcryptjs';

/**
 * Per-action passwords for owner operations that must not ride on the login
 * session alone.
 *
 * Why not reuse the owner's login password (middleware/ownerVerification.ts):
 * that one is typed constantly and lives in the browser's password manager, so
 * an unattended laptop is enough to flip the platform out of beta. This is a
 * separate secret, set once, asked for only at the moment of the action.
 *
 * Keyed by action so the same mechanism serves the next gated feature without
 * new tables — `platform:phase` is simply the first.
 */
@Table({ tableName: 'action_passwords', timestamps: true, underscored: true })
export class ActionPassword extends Model {
  /** e.g. 'platform:phase'. */
  @Column({ type: DataType.STRING(64), primaryKey: true })
  action!: string;

  @Column({ type: DataType.STRING, allowNull: false })
  passwordHash!: string;

  @Column({ type: DataType.UUID })
  createdBy?: string;

  /** Single-use reset token, hashed. Null when no reset is pending. */
  @Column({ type: DataType.STRING })
  resetTokenHash?: string | null;

  @Column({ type: DataType.DATE })
  resetTokenExpires?: Date | null;

  @Column({ type: DataType.DATE })
  lastUsedAt?: Date;

  declare createdAt: Date;
  declare updatedAt: Date;

  async compare(plain: string): Promise<boolean> {
    return bcrypt.compare(plain, this.passwordHash);
  }

  static async hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, 12);
  }
}

export default ActionPassword;
