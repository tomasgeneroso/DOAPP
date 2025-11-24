import crypto from 'crypto';

// Configuración de encriptación
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 64;

// Prefijo para identificar datos encriptados
const ENCRYPTED_PREFIX = 'ENC:';

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
 * Verifica si un string ya está encriptado
 * @param text - El texto a verificar
 * @returns true si ya está encriptado
 */
export function isEncrypted(text: string): boolean {
  if (!text) return false;

  // Verificar si tiene el prefijo de encriptación
  if (text.startsWith(ENCRYPTED_PREFIX)) return true;

  // También verificar el formato antiguo (iv:authTag:data)
  const parts = text.split(':');
  if (parts.length === 3) {
    const [iv, authTag, data] = parts;
    // Verificar que iv y authTag tengan la longitud correcta en hex
    if (iv.length === IV_LENGTH * 2 && authTag.length === AUTH_TAG_LENGTH * 2) {
      return true;
    }
  }

  return false;
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

/**
 * Encripta un número de teléfono
 * @param phone - El teléfono a encriptar
 * @returns El teléfono encriptado
 */
export function encryptPhone(phone: string): string {
  if (!phone) return phone;

  // Si ya está encriptado, no volver a encriptar
  if (isEncrypted(phone)) {
    return phone;
  }

  // Limpiar el teléfono (solo números y +)
  const cleanPhone = phone.replace(/[^0-9+]/g, '');

  if (!cleanPhone) {
    throw new Error('Invalid phone number');
  }

  return encrypt(cleanPhone);
}

/**
 * Desencripta un número de teléfono
 * @param encryptedPhone - El teléfono encriptado
 * @returns El teléfono desencriptado
 */
export function decryptPhone(encryptedPhone: string): string {
  if (!encryptedPhone) return encryptedPhone;

  // Si no está encriptado, devolver tal cual
  if (!isEncrypted(encryptedPhone)) {
    return encryptedPhone;
  }

  return decrypt(encryptedPhone);
}

/**
 * Máscara para mostrar teléfono de forma segura
 * @param phone - El teléfono a enmascarar
 * @returns Teléfono enmascarado (ej: ******1234)
 */
export function maskPhone(phone: string): string {
  if (!phone || phone.length < 4) {
    return '**********';
  }

  return '*'.repeat(Math.max(phone.length - 4, 0)) + phone.slice(-4);
}

/**
 * Encripta un ID de Binance
 * @param binanceId - El Binance ID a encriptar
 * @returns El Binance ID encriptado
 */
export function encryptBinanceId(binanceId: string): string {
  if (!binanceId) return binanceId;

  // Si ya está encriptado, no volver a encriptar
  if (isEncrypted(binanceId)) {
    return binanceId;
  }

  return encrypt(binanceId);
}

/**
 * Desencripta un ID de Binance
 * @param encryptedBinanceId - El Binance ID encriptado
 * @returns El Binance ID desencriptado
 */
export function decryptBinanceId(encryptedBinanceId: string): string {
  if (!encryptedBinanceId) return encryptedBinanceId;

  // Si no está encriptado, devolver tal cual
  if (!isEncrypted(encryptedBinanceId)) {
    return encryptedBinanceId;
  }

  return decrypt(encryptedBinanceId);
}

/**
 * Máscara para mostrar Binance ID de forma segura
 * @param binanceId - El Binance ID a enmascarar
 * @returns Binance ID enmascarado (ej: ****1234)
 */
export function maskBinanceId(binanceId: string): string {
  if (!binanceId || binanceId.length < 4) {
    return '********';
  }

  return '*'.repeat(Math.max(binanceId.length - 4, 0)) + binanceId.slice(-4);
}

/**
 * Encripta datos sensibles genéricos
 * @param data - El dato a encriptar
 * @returns El dato encriptado
 */
export function encryptSensitive(data: string): string {
  if (!data) return data;

  // Si ya está encriptado, no volver a encriptar
  if (isEncrypted(data)) {
    return data;
  }

  return encrypt(data);
}

/**
 * Desencripta datos sensibles genéricos
 * @param encryptedData - El dato encriptado
 * @returns El dato desencriptado
 */
export function decryptSensitive(encryptedData: string): string {
  if (!encryptedData) return encryptedData;

  // Si no está encriptado, devolver tal cual
  if (!isEncrypted(encryptedData)) {
    return encryptedData;
  }

  return decrypt(encryptedData);
}

/**
 * Encripta campos sensibles de un objeto
 * @param obj - El objeto con datos
 * @param fields - Los campos a encriptar
 * @returns El objeto con campos encriptados
 */
export function encryptFields<T extends Record<string, any>>(obj: T, fields: string[]): T {
  const result = { ...obj };

  for (const field of fields) {
    if (result[field] && typeof result[field] === 'string' && !isEncrypted(result[field])) {
      (result as any)[field] = encrypt(result[field]);
    }
  }

  return result;
}

/**
 * Desencripta campos sensibles de un objeto
 * @param obj - El objeto con datos encriptados
 * @param fields - Los campos a desencriptar
 * @returns El objeto con campos desencriptados
 */
export function decryptFields<T extends Record<string, any>>(obj: T, fields: string[]): T {
  const result = { ...obj };

  for (const field of fields) {
    if (result[field] && typeof result[field] === 'string' && isEncrypted(result[field])) {
      try {
        (result as any)[field] = decrypt(result[field]);
      } catch (error) {
        console.error(`Error decrypting field ${field}:`, error);
      }
    }
  }

  return result;
}

/**
 * Campos sensibles por modelo
 */
export const SENSITIVE_FIELDS = {
  User: ['phone', 'dni'],
  PaymentProof: ['binanceTransactionId', 'binanceNickname'],
  WithdrawalRequest: ['cbu', 'bankAlias'],
  BankingInfo: ['cbu', 'accountNumber'],
};
