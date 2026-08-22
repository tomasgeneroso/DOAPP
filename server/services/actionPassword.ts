import crypto from 'crypto';
import { ActionPassword } from '../models/sql/ActionPassword.model.js';

/**
 * Per-action passwords for owner operations.
 *
 * The flow the owner asked for: set it once from inside the app, it is stored
 * hashed from then on, and it can be recovered by email like any other
 * password. Keyed by action so the next gated feature reuses all of this.
 *
 * Deliberately separate from the login password (middleware/ownerVerification):
 * that one is typed daily and sits in a password manager, so it protects
 * against nothing once a session is open. This one is only ever asked for at
 * the moment of a consequential action.
 */

export const ACTIONS = {
  /** Switching the platform between beta (no commission) and live. */
  PLATFORM_PHASE: 'platform:phase',
} as const;

export type ActionKey = (typeof ACTIONS)[keyof typeof ACTIONS];

const RESET_TTL_MS = 30 * 60 * 1000; // 30 minutes

const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');

/** Whether this action already has a password, i.e. whether to ask or to create. */
export async function isActionPasswordSet(action: ActionKey): Promise<boolean> {
  return !!(await ActionPassword.findByPk(action));
}

/**
 * Create the password for an action. Only works when none exists — changing an
 * existing one goes through the email reset, so knowing the current session is
 * never enough to silently replace it.
 */
export async function createActionPassword(
  action: ActionKey,
  plain: string,
  createdBy?: string,
): Promise<{ ok: boolean; message?: string }> {
  if (plain.length < 8) return { ok: false, message: 'La contrasena debe tener al menos 8 caracteres' };
  if (await isActionPasswordSet(action)) {
    return { ok: false, message: 'Ya existe una contrasena para esta accion. Usa la recuperacion por correo para cambiarla.' };
  }
  await ActionPassword.create({
    action,
    passwordHash: await ActionPassword.hash(plain),
    createdBy,
  } as any);
  return { ok: true };
}

/** Verify and stamp last use. */
export async function verifyActionPassword(action: ActionKey, plain: string): Promise<boolean> {
  const row = await ActionPassword.findByPk(action);
  if (!row || !plain) return false;
  const ok = await row.compare(plain);
  if (ok) await row.update({ lastUsedAt: new Date() });
  return ok;
}

/**
 * Start a reset. Returns the raw token to email; only its hash is stored, so a
 * database read cannot be turned into a password change.
 */
export async function startActionPasswordReset(action: ActionKey): Promise<string | null> {
  const row = await ActionPassword.findByPk(action);
  if (!row) return null;
  const token = crypto.randomBytes(32).toString('hex');
  await row.update({
    resetTokenHash: sha256(token),
    resetTokenExpires: new Date(Date.now() + RESET_TTL_MS),
  });
  return token;
}

/** Finish a reset. The token is single-use and cleared whether or not it fits. */
export async function completeActionPasswordReset(
  action: ActionKey,
  token: string,
  newPlain: string,
): Promise<{ ok: boolean; message?: string }> {
  if (newPlain.length < 8) return { ok: false, message: 'La contrasena debe tener al menos 8 caracteres' };

  const row = await ActionPassword.findByPk(action);
  if (!row || !row.resetTokenHash || !row.resetTokenExpires) {
    return { ok: false, message: 'No hay una recuperacion pendiente' };
  }
  if (row.resetTokenExpires.getTime() < Date.now()) {
    await row.update({ resetTokenHash: null, resetTokenExpires: null });
    return { ok: false, message: 'El enlace vencio. Pedi uno nuevo.' };
  }

  const expected = Buffer.from(row.resetTokenHash, 'utf8');
  const given = Buffer.from(sha256(token), 'utf8');
  const matches = expected.length === given.length && crypto.timingSafeEqual(expected, given);
  if (!matches) return { ok: false, message: 'Enlace invalido' };

  await row.update({
    passwordHash: await ActionPassword.hash(newPlain),
    resetTokenHash: null,
    resetTokenExpires: null,
  });
  return { ok: true };
}
