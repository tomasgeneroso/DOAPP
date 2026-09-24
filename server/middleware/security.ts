import rateLimit from "express-rate-limit";
import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

/**
 * Rate limiter for authentication endpoints
 * Very permissive to allow multiple login attempts
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 30, // 30 intentos por IP cada 15 minutos
  message: {
    success: false,
    message: "Demasiados intentos. Intenta nuevamente en 15 minutos.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

/**
 * Rate limiter for general API endpoints
 * Increased limits for SPA apps that make many requests
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Aumentado de 100 a 500 para SPAs
  message: {
    success: false,
    message: "Demasiadas solicitudes. Intenta nuevamente más tarde.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Strict rate limiter for sensitive operations
 */
export const strictLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Aumentado de 3 a 10
  message: {
    success: false,
    message: "Límite de intentos excedido. Intenta nuevamente en 1 hora.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Input sanitization middleware
 * Prevents SQL and NoSQL injection attacks by sanitizing user input
 * Removes potentially dangerous characters from request data
 * Custom implementation compatible with Express 5
 */
export const sanitizeInput = (req: Request, res: Response, next: NextFunction) => {
  const sanitize = (obj: any): any => {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === "string") {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(sanitize);
    }

    if (typeof obj === "object") {
      const sanitized: any = {};
      for (const key in obj) {
        // Remove keys that start with $ or contain .
        if (key.startsWith("$") || key.includes(".")) {
          console.warn(`[Security] Removed potentially dangerous key: ${key}`);
          continue;
        }
        sanitized[key] = sanitize(obj[key]);
      }
      return sanitized;
    }

    return obj;
  };

  // Sanitize body (mutable)
  if (req.body && typeof req.body === "object") {
    req.body = sanitize(req.body);
  }

  // For query and params in Express 5, we need to sanitize in place
  if (req.query && typeof req.query === "object") {
    const sanitized = sanitize(req.query);
    // Clear existing keys and copy sanitized ones
    const keys = Object.keys(req.query);
    keys.forEach(key => delete (req.query as any)[key]);
    Object.assign(req.query, sanitized);
  }

  if (req.params && typeof req.params === "object") {
    const sanitized = sanitize(req.params);
    const keys = Object.keys(req.params);
    keys.forEach(key => delete (req.params as any)[key]);
    Object.assign(req.params, sanitized);
  }

  next();
};

/**
 * XSS Protection middleware
 * Sanitizes user input to prevent XSS attacks
 */
export const xssProtection = (req: Request, res: Response, next: NextFunction) => {
  // Basic XSS sanitization for common patterns
  const sanitize = (obj: any): any => {
    if (typeof obj === "string") {
      return obj
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
        .replace(/javascript:/gi, "")
        .replace(/on\w+\s*=\s*["'][^"']*["']/gi, "")
        .replace(/on\w+\s*=\s*[^\s>]*/gi, "");
    }
    if (Array.isArray(obj)) {
      return obj.map(sanitize);
    }
    if (obj && typeof obj === "object") {
      const sanitized: any = {};
      for (const key in obj) {
        sanitized[key] = sanitize(obj[key]);
      }
      return sanitized;
    }
    return obj;
  };

  // Sanitize body (mutable)
  if (req.body && typeof req.body === "object") {
    req.body = sanitize(req.body);
  }

  // For query and params in Express 5, modify in place
  if (req.query && typeof req.query === "object") {
    const sanitized = sanitize(req.query);
    const keys = Object.keys(req.query);
    keys.forEach(key => delete (req.query as any)[key]);
    Object.assign(req.query, sanitized);
  }

  if (req.params && typeof req.params === "object") {
    const sanitized = sanitize(req.params);
    const keys = Object.keys(req.params);
    keys.forEach(key => delete (req.params as any)[key]);
    Object.assign(req.params, sanitized);
  }

  next();
};

/**
 * CSRF token validation middleware
 * Validates CSRF tokens for state-changing operations
 */
export const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
  // Skip CSRF for GET, HEAD, OPTIONS
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }

  const token = req.headers["x-csrf-token"] || req.body?.csrfToken;
  const sessionToken = (req.session as any)?.csrfToken;

  if (!token || !sessionToken || token !== sessionToken) {
    res.status(403).json({
      success: false,
      message: "Token CSRF inválido o faltante",
    });
    return;
  }

  next();
};

/**
 * Generate CSRF token for session
 */
export const generateCsrfToken = (req: Request, res: Response, next: NextFunction) => {
  const session = req.session as any;
  if (!session?.csrfToken) {
    session.csrfToken = crypto.randomBytes(32).toString("hex");
  }
  next();
};

/**
 * Prevent directory traversal attacks
 */
export const preventDirectoryTraversal = (req: Request, res: Response, next: NextFunction) => {
  const suspiciousPatterns = ["../", "..\\", "%2e%2e", "%252e%252e"];

  const checkValue = (value: string): boolean => {
    return suspiciousPatterns.some((pattern) => value.toLowerCase().includes(pattern));
  };

  /**
   * Revisar SOLO donde una ruta puede terminar siendo un path.
   *
   * Antes se revisaba `req.body` entero y a cualquier profundidad. Eso hacía
   * dos cosas malas: llenaba el log de errores con escaneos automáticos a
   * rutas que ni existen (`/api/templates/preview`), y, peor, rechazaba con
   * "Solicitud inválida" a un usuario que escribiera `../` dentro de la
   * descripción de un trabajo o de un mensaje de chat. Un texto libre no es
   * un path y nunca se usa como tal.
   *
   * Los params y la query sí se revisan enteros: de ahí salen los `:id` y los
   * nombres de archivo que el código usa para construir rutas.
   */
  const checkObject = (obj: any, profundidad = 0): boolean => {
    if (typeof obj === "string") return checkValue(obj);
    if (profundidad > 4) return false;
    if (Array.isArray(obj)) return obj.some((v) => checkObject(v, profundidad + 1));
    if (obj && typeof obj === "object") {
      return Object.values(obj).some((v) => checkObject(v, profundidad + 1));
    }
    return false;
  };

  /** Campos de un body que el servidor puede llegar a tratar como archivo o ruta. */
  const CAMPOS_DE_ARCHIVO = [
    'filename', 'fileName', 'file', 'path', 'filepath', 'filePath',
    'template', 'templateName', 'ruta', 'archivo', 'nombreArchivo',
    'avatar', 'coverImage', 'image', 'imagen', 'url', 'src', 'key',
  ];

  const bodySospechoso = (() => {
    const body = req.body;
    if (!body || typeof body !== 'object') return typeof body === 'string' ? checkValue(body) : false;
    return CAMPOS_DE_ARCHIVO.some((campo) => {
      const v = (body as any)[campo];
      return typeof v === 'string' ? checkValue(v) : checkObject(v);
    });
  })();

  if (checkObject(req.params) || checkObject(req.query) || bodySospechoso) {
    /**
     * Nivel `warn`, no `error`, y con la IP.
     *
     * Cualquier servidor con IP pública recibe escaneos automáticos todo el
     * día. Anotarlos como errores hace que el log de errores —el que se mira
     * cuando algo se rompe— sea noventa por ciento ruido, y ahí es donde se
     * pierden los incidentes de verdad. La IP es lo único accionable: permite
     * ver si es uno insistiendo (y bloquearlo en Cloudflare) o mil distintos.
     */
    console.warn(
      `[Security] Intento de path traversal: ${req.method} ${req.path} desde ${req.ip || 'ip desconocida'}`,
    );
    res.status(400).json({
      success: false,
      message: "Solicitud inválida",
    });
    return;
  }

  next();
};

/**
 * Security headers middleware
 * Sets various security headers
 */
export const securityHeaders = (req: Request, res: Response, next: NextFunction) => {
  // Prevent clickjacking
  res.setHeader("X-Frame-Options", "DENY");

  // Prevent MIME type sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");

  // Enable XSS filter
  res.setHeader("X-XSS-Protection", "1; mode=block");

  // Referrer policy
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // Permissions policy
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");

  next();
};

/**
 * IP whitelist middleware (optional for admin routes)
 */
export const ipWhitelist = (allowedIPs: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const clientIP =
      req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() ||
      req.socket.remoteAddress ||
      "";

    if (!allowedIPs.includes(clientIP) && !allowedIPs.includes("*")) {
      console.warn(`[Security] Blocked request from IP: ${clientIP}`);
      res.status(403).json({
        success: false,
        message: "Acceso denegado",
      });
      return;
    }

    next();
  };
};

/**
 * Log suspicious activity
 */
export const logSuspiciousActivity = async (
  req: Request,
  type: string,
  details: string
) => {
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  const userAgent = req.headers["user-agent"];

  console.warn(`[Security Alert] ${type}`, {
    ip,
    userAgent,
    path: req.path,
    method: req.method,
    details,
    timestamp: new Date().toISOString(),
  });

  // Here you could also save to database or send alerts
};

export default {
  authLimiter,
  apiLimiter,
  strictLimiter,
  sanitizeInput,
  sanitizeMongoInput: sanitizeInput, // Backward compatibility alias
  xssProtection,
  csrfProtection,
  generateCsrfToken,
  preventDirectoryTraversal,
  securityHeaders,
  ipWhitelist,
  logSuspiciousActivity,
};
