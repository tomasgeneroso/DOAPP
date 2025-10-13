import rateLimit from "express-rate-limit";
import { Request, Response, NextFunction } from "express";
import cors from "cors";
import { config } from "../config/env.js";

// Extend express-session types to include csrfToken
declare module "express-session" {
  interface SessionData {
    csrfToken?: string;
  }
}

/**
 * Rate limiter for authentication endpoints.
 * NOTE: Completely disabled as per user request - unlimited login attempts allowed
 */
export const authLimiter = rateLimit({
  windowMs: 1, // 1ms window
  max: 999999, // Unlimited attempts
  message: {
    success: false,
    message: "Demasiados intentos de inicio de sesión. Intenta nuevamente en 15 minutos.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful requests
});

/**
 * Rate limiter for general API endpoints
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
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
  max: 3, // 3 attempts per hour
  message: {
    success: false,
    message: "Límite de intentos excedido. Intenta nuevamente en 1 hora.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * MongoDB sanitization middleware
 * Prevents NoSQL injection attacks by removing $ and . from user input
 * Custom implementation compatible with Express 5
 */
export const sanitizeMongoInput = (req: Request, res: Response, next: NextFunction) => {
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
  const sessionToken = req.session?.csrfToken;

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
  if (!req.session?.csrfToken) {
    req.session.csrfToken = require("crypto").randomBytes(32).toString("hex");
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

  const checkObject = (obj: any): boolean => {
    if (typeof obj === "string") {
      return checkValue(obj);
    }
    if (Array.isArray(obj)) {
      return obj.some(checkObject);
    }
    if (obj && typeof obj === "object") {
      return Object.values(obj).some(checkObject);
    }
    return false;
  };

  if (
    checkObject(req.params) ||
    checkObject(req.query) ||
    checkObject(req.body)
  ) {
    console.error(`[Security] Directory traversal attempt detected: ${req.method} ${req.path}`);
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

/**
 * CORS configuration to allow requests from the client.
 * This should be used in the main server file (e.g., app.ts).
 * Example: app.use(corsMiddleware);
 */
export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Allow requests from the client URL specified in config, and also allow requests with no origin (like Postman)
    if (!origin || origin === config.clientUrl) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true, // Important for cookies, authorization headers with HTTPS
});

export default {
  authLimiter,
  apiLimiter,
  strictLimiter,
  sanitizeMongoInput,
  xssProtection,
  csrfProtection,
  generateCsrfToken,
  preventDirectoryTraversal,
  securityHeaders,
  ipWhitelist,
  logSuspiciousActivity,
  corsMiddleware,
};
