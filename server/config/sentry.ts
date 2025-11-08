import { Express } from 'express';

/**
 * Sentry Configuration - DISABLED
 *
 * Este archivo mantiene la API de Sentry pero todas las funciones
 * son no-ops (no hacen nada). Usamos sistema de analytics custom.
 *
 * Si en el futuro quieres habilitar Sentry:
 * 1. npm install @sentry/node @sentry/profiling-node
 * 2. Descomentar imports y código
 * 3. Configurar SENTRY_DSN en .env
 */

/**
 * Initialize Sentry monitoring
 * DESHABILITADO - No se usa Sentry en este proyecto
 */
export function initSentry(app: Express): void {
  // Sentry deshabilitado - solo usar analytics custom
  console.log('ℹ️  Sentry monitoring disabled. Using custom analytics only.');
}

/**
 * Sentry error handler middleware (should be added after routes)
 * DESHABILITADO
 */
export function sentryErrorHandler() {
  // No-op middleware - Sentry deshabilitado
  return (req: any, res: any, next: any) => next();
}

/**
 * Capture custom exception with context
 * DESHABILITADO - Solo log a consola
 */
export function captureException(error: Error, context?: Record<string, any>): void {
  console.error('Error captured:', error.message, context || '');
  // No envía a Sentry
}

/**
 * Add breadcrumb for debugging
 * DESHABILITADO - No hace nada
 */
export function addBreadcrumb(
  message: string,
  category: string,
  level: 'debug' | 'info' | 'warning' | 'error' = 'info',
  data?: Record<string, any>
): void {
  // No-op - Sentry deshabilitado
}

/**
 * Set user context for error tracking
 * DESHABILITADO
 */
export function setUser(userId: string, email?: string, username?: string): void {
  // No-op - Sentry deshabilitado
}

/**
 * Clear user context
 * DESHABILITADO
 */
export function clearUser(): void {
  // No-op - Sentry deshabilitado
}

/**
 * Start a transaction for performance monitoring
 * DESHABILITADO
 */
export function startTransaction(name: string, op: string): any {
  // No-op - Sentry deshabilitado
  return {
    finish: () => {},
    setStatus: () => {},
    setData: () => {},
  };
}

/**
 * Capture message with severity
 * DESHABILITADO
 */
export function captureMessage(
  message: string,
  level: 'debug' | 'info' | 'warning' | 'error' = 'info'
): void {
  // No-op - Sentry deshabilitado
}

/**
 * Export vacío para mantener compatibilidad
 */
export default {
  captureException,
  captureMessage,
  setUser,
  clearUser,
};
