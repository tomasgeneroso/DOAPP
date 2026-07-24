import 'reflect-metadata';
import {
  Table,
  Column,
  Model,
  DataType,
  Default,
  AllowNull,
  Index,
} from 'sequelize-typescript';

/**
 * Permanent record of the email + DNI of every banned user, kept for the app's
 * history INDEPENDENTLY of the user row (no FK to users, so it survives an
 * account deletion). Used to block re-registration with the same identity — a
 * banned person who wants their account back must contact support.
 */
@Table({
  tableName: 'banned_identities',
  timestamps: true,
  underscored: true,
})
export class BannedIdentity extends Model {
  // Normalized (lowercased/trimmed) email at ban time.
  @AllowNull(false)
  @Index
  @Column(DataType.STRING)
  email!: string;

  // DNI at ban time (may be null if the user never uploaded one).
  @Index
  @Column(DataType.STRING)
  dni?: string;

  // The user id at ban time — kept for traceability, not a FK (user may be deleted).
  @Column(DataType.UUID)
  userId?: string;

  // Display name at ban time, for the admin history view.
  @Column(DataType.STRING)
  name?: string;

  @AllowNull(false)
  @Column(DataType.TEXT)
  reason!: string;

  // Admin who applied the ban.
  @Column(DataType.UUID)
  bannedBy?: string;

  // Active bans block re-registration; set false if support restores the account.
  @Default(true)
  @AllowNull(false)
  @Column(DataType.BOOLEAN)
  isActive!: boolean;

  /**
   * Upsert (by normalized email) a permanent banned-identity record. Best-effort:
   * never throws, so it can't break the ban flow. Call from every ban path.
   */
  static async recordBan(u: {
    id?: string;
    email?: string;
    dni?: string;
    name?: string;
  }, reason: string, bannedBy?: string): Promise<void> {
    try {
      const email = (u.email || '').toLowerCase().trim();
      if (!email) return;
      const existing = await BannedIdentity.findOne({ where: { email } });
      if (existing) {
        await existing.update({
          dni: u.dni || existing.dni,
          userId: u.id || existing.userId,
          name: u.name || existing.name,
          reason,
          bannedBy,
          isActive: true,
        });
      } else {
        await BannedIdentity.create({ email, dni: u.dni, userId: u.id, name: u.name, reason, bannedBy, isActive: true });
      }
    } catch (e: any) {
      console.warn('[BannedIdentity.recordBan] skipped:', e?.message);
    }
  }
}

export default BannedIdentity;
