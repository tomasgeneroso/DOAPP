import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE_PATH = path.join(__dirname, '../../.role-passwords.json');

interface RolePasswords {
  ownerPasswordHash?: string;
  adminPasswordHash?: string;
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
