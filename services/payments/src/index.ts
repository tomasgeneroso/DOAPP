import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config.js';
import { initializeDatabase } from './database.js';
import { redis } from './redis.js';
import contractsRoutes from './routes/contracts.routes.js';
import paymentsRoutes from './routes/payments.routes.js';
import membershipRoutes from './routes/membership.routes.js';

const app = express();

// ===========================================
// MIDDLEWARE
// ===========================================

app.use(helmet());

app.use(cors({
  origin: config.clientUrl,
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

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

// Contracts routes
app.use('/contracts', contractsRoutes);

// Payments routes
app.use('/payments', paymentsRoutes);

// Membership routes
app.use('/membership', membershipRoutes);

// Balance routes (simplified)
app.get('/balance', async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  if (!userId) {
    res.status(401).json({ success: false, message: 'No autorizado' });
    return;
  }

  const { BalanceTransaction } = await import('./models/BalanceTransaction.model.js');

  // Calculate balance from transactions
  const transactions = await BalanceTransaction.findAll({
    where: { userId, status: 'completed' },
  });

  const balance = transactions.reduce((sum, tx) => {
    const amount = Number(tx.amount);
    return tx.isCredit() ? sum + amount : sum - amount;
  }, 0);

  res.json({
    success: true,
    balance,
    currency: 'ARS',
  });
});

app.get('/balance/transactions', async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  if (!userId) {
    res.status(401).json({ success: false, message: 'No autorizado' });
    return;
  }

  const { BalanceTransaction } = await import('./models/BalanceTransaction.model.js');

  const { page = 1, limit = 10 } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  const { count, rows: transactions } = await BalanceTransaction.findAndCountAll({
    where: { userId },
    order: [['createdAt', 'DESC']],
    limit: Number(limit),
    offset,
  });

  res.json({
    success: true,
    transactions,
    pagination: {
      total: count,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(count / Number(limit)),
    },
  });
});

// Webhooks
app.use('/webhooks', paymentsRoutes);

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
║              DOAPP PAYMENTS SERVICE                   ║
╠═══════════════════════════════════════════════════════╣
║  Port: ${config.port}                                         ║
║  Environment: ${config.nodeEnv.padEnd(39)}║
║  Database: ${config.database.host}:${config.database.port}                    ║
║  Redis: ${config.redis.url.padEnd(45)}║
║  MercadoPago: ${config.mercadopago.accessToken ? 'Configured' : 'Not configured'}                      ║
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
