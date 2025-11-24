import fs from 'fs';
import path from 'path';

/**
 * Sistema de Logging Centralizado
 * Guarda logs en archivos .log organizados por tipo y fecha
 */

const LOG_DIR = path.join(process.cwd(), 'logs');

// Crear directorio de logs si no existe
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG' | 'PAYMENT' | 'SECURITY' | 'WEBHOOK';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: string;
  message: string;
  data?: any;
  userId?: string;
  ip?: string;
  userAgent?: string;
}

class Logger {
  private getLogFilePath(category: string): string {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    return path.join(LOG_DIR, `${category}_${date}.log`);
  }

  private formatLogEntry(entry: LogEntry): string {
    const { timestamp, level, category, message, data, userId, ip, userAgent } = entry;
    let logLine = `[${timestamp}] [${level}] [${category}]`;

    if (userId) logLine += ` [User: ${userId}]`;
    if (ip) logLine += ` [IP: ${ip}]`;

    logLine += ` ${message}`;

    if (data) {
      // Sanitizar datos sensibles antes de loguear
      const sanitizedData = this.sanitizeForLog(data);
      logLine += ` | Data: ${JSON.stringify(sanitizedData)}`;
    }

    return logLine;
  }

  private sanitizeForLog(data: any): any {
    if (!data || typeof data !== 'object') return data;

    const sensitiveFields = [
      'password', 'token', 'accessToken', 'refreshToken', 'secret',
      'cbu', 'bankAccount', 'creditCard', 'cvv', 'pin',
      'binanceTransactionId', 'binanceNickname'
    ];

    const sanitized = { ...data };

    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '***REDACTED***';
      }
    }

    return sanitized;
  }

  private writeToFile(category: string, entry: LogEntry): void {
    const filePath = this.getLogFilePath(category);
    const logLine = this.formatLogEntry(entry) + '\n';

    fs.appendFileSync(filePath, logLine, 'utf8');
  }

  private log(level: LogLevel, category: string, message: string, options?: {
    data?: any;
    userId?: string;
    ip?: string;
    userAgent?: string;
  }): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      ...options
    };

    // Escribir a archivo
    this.writeToFile(category.toLowerCase(), entry);

    // También escribir a un log general
    this.writeToFile('all', entry);

    // Consola solo en desarrollo
    if (process.env.NODE_ENV === 'development') {
      const consoleMethod = level === 'ERROR' ? console.error :
                           level === 'WARN' ? console.warn : console.log;
      consoleMethod(`[${level}] ${message}`);
    }
  }

  // Métodos públicos por categoría

  info(category: string, message: string, options?: any): void {
    this.log('INFO', category, message, options);
  }

  warn(category: string, message: string, options?: any): void {
    this.log('WARN', category, message, options);
  }

  error(category: string, message: string, options?: any): void {
    this.log('ERROR', category, message, options);
  }

  debug(category: string, message: string, options?: any): void {
    if (process.env.NODE_ENV === 'development') {
      this.log('DEBUG', category, message, options);
    }
  }

  // Logs específicos de pagos
  payment(action: string, message: string, options?: {
    paymentId?: string;
    amount?: number;
    currency?: string;
    userId?: string;
    status?: string;
    provider?: string;
    data?: any;
  }): void {
    this.log('PAYMENT', 'payments', `[${action}] ${message}`, {
      data: options
    });
  }

  // Logs de webhooks
  webhook(provider: string, event: string, message: string, options?: any): void {
    this.log('WEBHOOK', 'webhooks', `[${provider}] [${event}] ${message}`, options);
  }

  // Logs de seguridad
  security(action: string, message: string, options?: {
    userId?: string;
    ip?: string;
    userAgent?: string;
    data?: any;
  }): void {
    this.log('SECURITY', 'security', `[${action}] ${message}`, options);
  }

  // Logs de autenticación
  auth(action: string, message: string, options?: {
    userId?: string;
    email?: string;
    ip?: string;
    success?: boolean;
  }): void {
    this.log('INFO', 'auth', `[${action}] ${message}`, { data: options });
  }

  // Logs de contratos
  contract(action: string, message: string, options?: {
    contractId?: string;
    clientId?: string;
    doerId?: string;
    amount?: number;
    data?: any;
  }): void {
    this.log('INFO', 'contracts', `[${action}] ${message}`, { data: options });
  }

  // Logs de disputas
  dispute(action: string, message: string, options?: {
    disputeId?: string;
    contractId?: string;
    initiatorId?: string;
    data?: any;
  }): void {
    this.log('INFO', 'disputes', `[${action}] ${message}`, { data: options });
  }

  // Logs de membresías
  membership(action: string, message: string, options?: {
    userId?: string;
    tier?: string;
    data?: any;
  }): void {
    this.log('INFO', 'memberships', `[${action}] ${message}`, { data: options });
  }

  // Logs de administración
  admin(action: string, message: string, options?: {
    adminId?: string;
    targetId?: string;
    targetType?: string;
    data?: any;
  }): void {
    this.log('INFO', 'admin', `[${action}] ${message}`, { data: options });
  }

  // Obtener logs recientes (para panel admin)
  async getRecentLogs(category: string, limit: number = 100): Promise<string[]> {
    const filePath = this.getLogFilePath(category);

    if (!fs.existsSync(filePath)) {
      return [];
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter(line => line.trim());

    return lines.slice(-limit);
  }

  // Limpiar logs antiguos (ejecutar con cron)
  cleanOldLogs(daysToKeep: number = 30): void {
    const files = fs.readdirSync(LOG_DIR);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    for (const file of files) {
      const filePath = path.join(LOG_DIR, file);
      const stats = fs.statSync(filePath);

      if (stats.mtime < cutoffDate) {
        fs.unlinkSync(filePath);
        console.log(`Deleted old log file: ${file}`);
      }
    }
  }
}

export const logger = new Logger();
export default logger;
