import crypto from 'crypto';

// Configuración de encriptación
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 64;

/**
 * Obtiene la clave de encriptación desde las variables de entorno
 * Si no existe, genera una clave segura (solo para desarrollo)
 */
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;

  if (!key) {
    console.warn('⚠️  ENCRYPTION_KEY not found in environment variables. Using fallback key (NOT SECURE FOR PRODUCTION)');
    // En producción, esto debería lanzar un error
    return crypto.scryptSync('DOAPP_FALLBACK_KEY_CHANGE_IN_PRODUCTION', 'salt', 32);
  }

  // Deriva una clave de 32 bytes desde la clave de entorno
  return crypto.scryptSync(key, 'doapp-salt', 32);
}

/**
 * Encripta un string usando AES-256-GCM
 * @param text - El texto a encriptar (ej: CBU bancario)
 * @returns El texto encriptado en formato: iv:authTag:encryptedData (en hex)
 */
export function encrypt(text: string): string {
  if (!text) {
    throw new Error('Cannot encrypt empty text');
  }

  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Formato: iv:authTag:encryptedData (todo en hex)
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Desencripta un string encriptado con AES-256-GCM
 * @param encryptedText - El texto encriptado en formato: iv:authTag:encryptedData
 * @returns El texto desencriptado original
 */
export function decrypt(encryptedText: string): string {
  if (!encryptedText) {
    throw new Error('Cannot decrypt empty text');
  }

  try {
    const key = getEncryptionKey();
    const parts = encryptedText.split(':');

    if (parts.length !== 3) {
      throw new Error('Invalid encrypted text format');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt data');
  }
}

/**
 * Hashea un string usando SHA-256 (para comparaciones sin revelar el original)
 * Útil para verificar CBU sin necesidad de desencriptar
 * @param text - El texto a hashear
 * @returns El hash en formato hexadecimal
 */
export function hash(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

/**
 * Encripta CBU bancario específicamente
 * Valida el formato antes de encriptar
 * @param cbu - El CBU a encriptar (22 dígitos)
 * @returns El CBU encriptado
 */
export function encryptCBU(cbu: string): string {
  // Validar formato de CBU (22 dígitos)
  const cbuRegex = /^\d{22}$/;

  if (!cbuRegex.test(cbu)) {
    throw new Error('Invalid CBU format. Must be 22 digits.');
  }

  return encrypt(cbu);
}

/**
 * Desencripta CBU bancario y valida el formato
 * @param encryptedCBU - El CBU encriptado
 * @returns El CBU desencriptado (22 dígitos)
 */
export function decryptCBU(encryptedCBU: string): string {
  const cbu = decrypt(encryptedCBU);

  // Validar que el resultado sea un CBU válido
  const cbuRegex = /^\d{22}$/;

  if (!cbuRegex.test(cbu)) {
    throw new Error('Decrypted CBU is not in valid format');
  }

  return cbu;
}

/**
 * Máscara para mostrar CBU de forma segura (muestra solo los últimos 4 dígitos)
 * @param cbu - El CBU a enmascarar
 * @returns CBU enmascarado (ej: ******************1234)
 */
export function maskCBU(cbu: string): string {
  if (cbu.length !== 22) {
    return '**********************';
  }

  return '*'.repeat(18) + cbu.slice(-4);
}
