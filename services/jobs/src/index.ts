import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config.js';
import { initializeDatabase } from './database.js';
import { redis } from './redis.js';
import jobsRoutes from './routes/jobs.routes.js';
import proposalsRoutes from './routes/proposals.routes.js';
import portfolioRoutes from './routes/portfolio.routes.js';

const app = express();

// ===========================================
// MIDDLEWARE
// ===========================================

app.use(helmet());

app.use(cors({
  origin: config.clientUrl,
  credentials: true,
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

if (!config.isProduction) {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Serve static uploads
app.use('/uploads', express.static('uploads'));

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

// Jobs routes
app.use('/jobs', jobsRoutes);

// Proposals routes
app.use('/proposals', proposalsRoutes);

// Portfolio routes
app.use('/portfolio', portfolioRoutes);

// Search endpoint (redirect to jobs)
app.use('/search', jobsRoutes);

// Reviews endpoint (TODO: implement)
app.get('/reviews/user/:userId', async (req, res) => {
  const { Review } = await import('./models/Review.model.js');
  const reviews = await Review.findAll({
    where: { revieweeId: req.params.userId },
    order: [['createdAt', 'DESC']],
  });
  res.json({ success: true, reviews });
});

// ===========================================
// ERROR HANDLING
// ===========================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Ruta no encontrada',
    path: req.originalUrl,
  });
});

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
    await initializeDatabase();

    app.listen(config.port, () => {
      console.log(`
╔═══════════════════════════════════════════════════════╗
║              DOAPP JOBS SERVICE                       ║
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
