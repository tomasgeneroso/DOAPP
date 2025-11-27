import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { config } from './config.js';
import { initializeDatabase } from './database.js';
import { redis } from './redis.js';
import authRoutes from './routes/auth.routes.js';
import usersRoutes from './routes/users.routes.js';

const app = express();

// ===========================================
// MIDDLEWARE
// ===========================================

// Security
app.use(helmet());

// CORS
app.use(cors({
  origin: config.clientUrl,
  credentials: true,
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Cookie parsing
app.use(cookieParser());

// Logging
if (!config.isProduction) {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// ===========================================
// HEALTH CHECK
// ===========================================

app.get('/health', async (req, res) => {
  const dbStatus = await checkDatabaseConnection();
  const redisStatus = redis.status === 'ready';

  const isHealthy = dbStatus && redisStatus;

  res.status(isHealthy ? 200 : 503).json({
    success: isHealthy,
    service: config.serviceName,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {
      database: dbStatus ? 'healthy' : 'unhealthy',
      redis: redisStatus ? 'healthy' : 'unhealthy',
    },
  });
});

async function checkDatabaseConnection(): Promise<boolean> {
  try {
    const { sequelize } = await import('./database.js');
    await sequelize.authenticate();
    return true;
  } catch {
    return false;
  }
}

// ===========================================
// ROUTES
// ===========================================

// Auth routes: /auth/login, /auth/register, etc.
app.use('/auth', authRoutes);

// User routes: /users/update, /users/settings, etc.
app.use('/users', usersRoutes);

// Legacy routes for gateway compatibility
app.use('/', authRoutes);

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
  console.error(`[${config.serviceName}] Error:`, err);

  res.status(500).json({
    success: false,
    message: config.isProduction ? 'Error interno del servidor' : err.message,
  });
});

// ===========================================
// START SERVER
// ===========================================

async function startServer() {
  try {
    // Initialize database
    await initializeDatabase();

    // Start server
    app.listen(config.port, () => {
      console.log(`
╔═══════════════════════════════════════════════════════╗
║              DOAPP AUTH SERVICE                       ║
╠═══════════════════════════════════════════════════════╣
║  Port: ${config.port}                                         ║
║  Environment: ${config.nodeEnv.padEnd(39)}║
║  Database: ${config.database.host}:${config.database.port}                    ║
║  Redis: ${config.redis.url.padEnd(45)}║
╚═══════════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error(`[${config.serviceName}] Failed to start:`, error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log(`[${config.serviceName}] SIGTERM received, shutting down gracefully...`);
  redis.disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log(`[${config.serviceName}] SIGINT received, shutting down gracefully...`);
  redis.disconnect();
  process.exit(0);
});

startServer();

export default app;
