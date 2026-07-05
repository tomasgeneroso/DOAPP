import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE_PATH = path.join(__dirname, '../../.role-passwords.json');

interface RolePasswords {
  ownerPasswordHash?: string;
  adminPasswordHash?: string;
  /** Emergency password: overrides the "old password" requirement when changing
   *  role passwords. Changing IT requires the owner's account password. */
  emergencyPasswordHash?: string;
  /** One-time reset token (hashed) sent to the owner's email so they can change a
   *  role password without knowing the old one. */
  resetTokenHash?: string;
  resetTokenExpiry?: number; // epoch ms
  resetTokenRole?: 'owner' | 'admin';
}

function readStore(): RolePasswords {
  try {
    if (fs.existsSync(STORE_PATH)) {
      return JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8'));
    }
  } catch {}
  return {};
}

function writeStore(data: RolePasswords): void {
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

export async function verifyRolePassword(role: 'owner' | 'admin', password: string): Promise<boolean> {
  const store = readStore();

  if (role === 'owner') {
    const hash = store.ownerPasswordHash || process.env.ROLE_PASSWORD_OWNER;
    if (!hash) return false;
    return bcrypt.compare(password, hash);
  }

  if (role === 'admin') {
    const hash = store.adminPasswordHash || process.env.ROLE_PASSWORD_ADMIN;
    if (!hash) return false;
    return bcrypt.compare(password, hash);
  }

  return false;
}

export async function setRolePassword(role: 'owner' | 'admin', newPassword: string): Promise<void> {
  const hash = await bcrypt.hash(newPassword, 12);
  const store = readStore();

  if (role === 'owner') store.ownerPasswordHash = hash;
  if (role === 'admin') store.adminPasswordHash = hash;

  writeStore(store);
}

export function hasRolePassword(role: 'owner' | 'admin'): boolean {
  const store = readStore();
  if (role === 'owner') return !!(store.ownerPasswordHash || process.env.ROLE_PASSWORD_OWNER);
  if (role === 'admin') return !!(store.adminPasswordHash || process.env.ROLE_PASSWORD_ADMIN);
  return false;
}

/* ------------------------------------------------------------------ *
 * Emergency password
 * ------------------------------------------------------------------ */

export function hasEmergencyPassword(): boolean {
  const store = readStore();
  return !!(store.emergencyPasswordHash || process.env.ROLE_PASSWORD_EMERGENCY);
}

export async function verifyEmergencyPassword(password: string): Promise<boolean> {
  const store = readStore();
  const hash = store.emergencyPasswordHash || process.env.ROLE_PASSWORD_EMERGENCY;
  if (!hash) return false;
  return bcrypt.compare(password, hash);
}

export async function setEmergencyPassword(newPassword: string): Promise<void> {
  const hash = await bcrypt.hash(newPassword, 12);
  const store = readStore();
  store.emergencyPasswordHash = hash;
  writeStore(store);
}

/* ------------------------------------------------------------------ *
 * Email reset token (change a role password without the old one)
 * ------------------------------------------------------------------ */

/** Generates a reset token for `role`, stores its hash + expiry, and returns the
 *  plaintext token to be emailed to the owner. Valid for `ttlMinutes` (default 30). */
export function createResetToken(role: 'owner' | 'admin', ttlMinutes = 30): string {
  const token = crypto.randomBytes(4).toString('hex').toUpperCase(); // 8-char code
  const store = readStore();
  store.resetTokenHash = crypto.createHash('sha256').update(token).digest('hex');
  store.resetTokenExpiry = Date.now() + ttlMinutes * 60 * 1000;
  store.resetTokenRole = role;
  writeStore(store);
  return token;
}

/** Verifies a reset token for `role` (constant-time, single-use check). Does NOT
 *  consume it — call `consumeResetToken()` after a successful password change. */
export function verifyResetToken(role: 'owner' | 'admin', token: string): boolean {
  const store = readStore();
  if (!store.resetTokenHash || !store.resetTokenExpiry || store.resetTokenRole !== role) return false;
  if (Date.now() > store.resetTokenExpiry) return false;
  const provided = crypto.createHash('sha256').update((token || '').trim().toUpperCase()).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(store.resetTokenHash));
  } catch {
    return false;
  }
}

export function consumeResetToken(): void {
  const store = readStore();
  delete store.resetTokenHash;
  delete store.resetTokenExpiry;
  delete store.resetTokenRole;
  writeStore(store);
}
