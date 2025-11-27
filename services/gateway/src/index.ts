import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { optionalAuth, requireAuth, requireAdmin } from './middleware/auth.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import {
  authProxy,
  jobsProxy,
  paymentsProxy,
  chatProxy,
  notificationsProxy,
  adminProxy,
} from './proxy.js';

const app = express();

// ===========================================
// MIDDLEWARE
// ===========================================

// Security
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

// CORS
app.use(cors({
  origin: config.clientUrl,
  credentials: true,
}));

// Compression
app.use(compression());

// Request ID for tracing
app.use(requestIdMiddleware);

// Logging
if (!config.isProduction) {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Cookie parser
app.use(cookieParser());

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  message: {
    success: false,
    message: 'Demasiadas solicitudes, intenta de nuevo más tarde',
  },
});
app.use('/api', limiter);

// Parse JSON for non-proxied routes
app.use(express.json({ limit: '10mb' }));

// ===========================================
// HEALTH CHECK
// ===========================================

app.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'gateway',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Service health check
app.get('/api/health', async (req, res) => {
  const services = config.services;
  const checks: Record<string, string> = {};

  for (const [name, url] of Object.entries(services)) {
    try {
      const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(5000) });
      checks[name] = response.ok ? 'healthy' : 'unhealthy';
    } catch (error) {
      checks[name] = 'unavailable';
    }
  }

  const allHealthy = Object.values(checks).every(s => s === 'healthy');

  res.status(allHealthy ? 200 : 503).json({
    success: allHealthy,
    gateway: 'healthy',
    services: checks,
    timestamp: new Date().toISOString(),
  });
});

// ===========================================
// ROUTE PROXYING
// ===========================================

// Optional auth middleware - attaches user if token valid
app.use(optionalAuth);

// Auth Service Routes (public)
app.use('/api/auth', authProxy);
app.use('/api/users', authProxy);

// Jobs Service Routes
app.use('/api/jobs', jobsProxy);
app.use('/api/proposals', jobsProxy);
app.use('/api/portfolio', jobsProxy);
app.use('/api/reviews', jobsProxy);
app.use('/api/search', jobsProxy);
app.use('/api/matching', jobsProxy);

// Payments Service Routes
app.use('/api/contracts', paymentsProxy);
app.use('/api/payments', paymentsProxy);
app.use('/api/balance', paymentsProxy);
app.use('/api/membership', paymentsProxy);
app.use('/api/referrals', paymentsProxy);
app.use('/api/webhooks', paymentsProxy);

// Chat Service Routes
app.use('/api/chat', chatProxy);

// Notifications Service Routes
app.use('/api/notifications', notificationsProxy);

// Admin Service Routes (requires admin role)
app.use('/api/admin', requireAuth, requireAdmin, adminProxy);
app.use('/api/analytics', requireAuth, requireAdmin, adminProxy);

// ===========================================
// ERROR HANDLING
// ===========================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Ruta no encontrada',
    path: req.originalUrl,
  });
});

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(`[Gateway] Error: ${err.message}`);

  res.status(500).json({
    success: false,
    message: config.isProduction ? 'Error interno del servidor' : err.message,
  });
});

// ===========================================
// START SERVER
// ===========================================

app.listen(config.port, () => {
  console.log(`
╔═══════════════════════════════════════════════════════╗
║              DOAPP API GATEWAY                        ║
╠═══════════════════════════════════════════════════════╣
║  Port: ${config.port}                                         ║
║  Environment: ${config.nodeEnv.padEnd(39)}║
╠═══════════════════════════════════════════════════════╣
║  Services:                                            ║
║    Auth:          ${config.services.auth.padEnd(35)}║
║    Jobs:          ${config.services.jobs.padEnd(35)}║
║    Payments:      ${config.services.payments.padEnd(35)}║
║    Chat:          ${config.services.chat.padEnd(35)}║
║    Notifications: ${config.services.notifications.padEnd(35)}║
║    Admin:         ${config.services.admin.padEnd(35)}║
╚═══════════════════════════════════════════════════════╝
  `);
});

export default app;
