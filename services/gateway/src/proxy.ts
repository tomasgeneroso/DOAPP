import { createProxyMiddleware, Options } from 'http-proxy-middleware';
import { Request, Response, NextFunction } from 'express';
import { config } from './config.js';

/**
 * Create proxy options for a service
 */
function createProxyOptions(target: string, pathRewrite?: Record<string, string>): Options {
  return {
    target,
    changeOrigin: true,
    pathRewrite,
    timeout: 30000,
    proxyTimeout: 30000,
    onProxyReq: (proxyReq, req: Request) => {
      // Forward request ID for distributed tracing
      if (req.requestId) {
        proxyReq.setHeader('X-Request-ID', req.requestId);
      }

      // Forward user info if authenticated
      if ((req as any).user) {
        proxyReq.setHeader('X-User-ID', (req as any).user.id);
        proxyReq.setHeader('X-User-Email', (req as any).user.email);
        if ((req as any).user.adminRole) {
          proxyReq.setHeader('X-Admin-Role', (req as any).user.adminRole);
        }
      }

      // Log proxy request in development
      if (!config.isProduction) {
        console.log(`[Gateway] ${req.method} ${req.originalUrl} -> ${target}${req.url}`);
      }
    },
    onProxyRes: (proxyRes, req, res) => {
      // Add gateway header
      proxyRes.headers['X-Gateway'] = 'doapp-gateway';
    },
    onError: (err, req, res) => {
      console.error(`[Gateway] Proxy error: ${err.message}`);
      (res as Response).status(503).json({
        success: false,
        message: 'Servicio temporalmente no disponible',
        service: target,
      });
    },
  };
}

// Auth Service Proxy
export const authProxy = createProxyMiddleware(
  createProxyOptions(config.services.auth, {
    '^/api/auth': '/api/auth',
    '^/api/users': '/api/users',
  })
);

// Jobs Service Proxy
export const jobsProxy = createProxyMiddleware(
  createProxyOptions(config.services.jobs, {
    '^/api/jobs': '/api/jobs',
    '^/api/proposals': '/api/proposals',
    '^/api/portfolio': '/api/portfolio',
    '^/api/reviews': '/api/reviews',
    '^/api/search': '/api/search',
    '^/api/matching': '/api/matching',
  })
);

// Payments Service Proxy
export const paymentsProxy = createProxyMiddleware(
  createProxyOptions(config.services.payments, {
    '^/api/contracts': '/api/contracts',
    '^/api/payments': '/api/payments',
    '^/api/balance': '/api/balance',
    '^/api/membership': '/api/membership',
    '^/api/referrals': '/api/referrals',
    '^/api/webhooks': '/api/webhooks',
  })
);

// Chat Service Proxy
export const chatProxy = createProxyMiddleware(
  createProxyOptions(config.services.chat, {
    '^/api/chat': '/api/chat',
  })
);

// Notifications Service Proxy
export const notificationsProxy = createProxyMiddleware(
  createProxyOptions(config.services.notifications, {
    '^/api/notifications': '/api/notifications',
  })
);

// Admin Service Proxy
export const adminProxy = createProxyMiddleware(
  createProxyOptions(config.services.admin, {
    '^/api/admin': '/api/admin',
    '^/api/analytics': '/api/analytics',
  })
);
