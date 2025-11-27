import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config.js';
import { initializeDatabase, sequelize } from './database.js';
import { redis, cache } from './redis.js';
import { AuditLog } from './models/AuditLog.model.js';
import { Ticket } from './models/Ticket.model.js';
import { Op, QueryTypes } from 'sequelize';

const app = express();

// ===========================================
// MIDDLEWARE
// ===========================================

app.use(helmet());
app.use(cors({
  origin: config.clientUrl,
  credentials: true,
}));
app.use(express.json());

if (!config.isProduction) {
  app.use(morgan('dev'));
}

// ===========================================
// HELPERS
// ===========================================

const getUserId = (req: express.Request): string | null => {
  return req.headers['x-user-id'] as string || null;
};

const getAdminRole = (req: express.Request): string | null => {
  return req.headers['x-admin-role'] as string || null;
};

// Check admin permission
const requireAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const adminRole = getAdminRole(req);
  if (!adminRole) {
    res.status(403).json({ success: false, message: 'Acceso denegado' });
    return;
  }
  next();
};

// ===========================================
// HEALTH CHECK
// ===========================================

app.get('/health', (req, res) => {
  res.json({
    success: true,
    service: config.serviceName,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ===========================================
// ANALYTICS ROUTES
// ===========================================

app.get('/analytics/dashboard', requireAdmin, async (req, res) => {
  try {
    const cacheKey = 'admin:dashboard';
    const cached = await cache.get<any>(cacheKey);
    if (cached) {
      res.json({ success: true, ...cached, cached: true });
      return;
    }

    // Get counts from database
    const [usersCount, jobsCount, contractsCount, ticketsCount] = await Promise.all([
      sequelize.query('SELECT COUNT(*) as count FROM users', { type: QueryTypes.SELECT }),
      sequelize.query('SELECT COUNT(*) as count FROM jobs WHERE status = \'open\'', { type: QueryTypes.SELECT }),
      sequelize.query('SELECT COUNT(*) as count FROM contracts', { type: QueryTypes.SELECT }),
      Ticket.count({ where: { status: { [Op.ne]: 'closed' } } }),
    ]);

    // Get recent stats
    const [
      newUsersToday,
      newJobsToday,
      completedContractsToday,
    ] = await Promise.all([
      sequelize.query(
        'SELECT COUNT(*) as count FROM users WHERE created_at >= CURRENT_DATE',
        { type: QueryTypes.SELECT }
      ),
      sequelize.query(
        'SELECT COUNT(*) as count FROM jobs WHERE created_at >= CURRENT_DATE',
        { type: QueryTypes.SELECT }
      ),
      sequelize.query(
        'SELECT COUNT(*) as count FROM contracts WHERE status = \'completed\' AND completed_at >= CURRENT_DATE',
        { type: QueryTypes.SELECT }
      ),
    ]);

    const data = {
      totalUsers: (usersCount[0] as any)?.count || 0,
      activeJobs: (jobsCount[0] as any)?.count || 0,
      totalContracts: (contractsCount[0] as any)?.count || 0,
      openTickets: ticketsCount,
      newUsersToday: (newUsersToday[0] as any)?.count || 0,
      newJobsToday: (newJobsToday[0] as any)?.count || 0,
      completedContractsToday: (completedContractsToday[0] as any)?.count || 0,
    };

    await cache.set(cacheKey, data, 300); // Cache 5 minutes

    res.json({ success: true, ...data });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/analytics/users', requireAdmin, async (req, res) => {
  try {
    const { days = 30 } = req.query;

    const stats = await sequelize.query(
      `SELECT
        DATE(created_at) as date,
        COUNT(*) as count
       FROM users
       WHERE created_at >= CURRENT_DATE - INTERVAL '${days} days'
       GROUP BY DATE(created_at)
       ORDER BY date`,
      { type: QueryTypes.SELECT }
    );

    res.json({ success: true, stats });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/analytics/revenue', requireAdmin, async (req, res) => {
  try {
    const { days = 30 } = req.query;

    const stats = await sequelize.query(
      `SELECT
        DATE(created_at) as date,
        SUM(commission_amount) as commission,
        SUM(amount) as total
       FROM contracts
       WHERE status = 'completed'
         AND completed_at >= CURRENT_DATE - INTERVAL '${days} days'
       GROUP BY DATE(created_at)
       ORDER BY date`,
      { type: QueryTypes.SELECT }
    );

    res.json({ success: true, stats });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ===========================================
// USERS MANAGEMENT
// ===========================================

app.get('/users', requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, search, role, status } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let whereClause = '';
    const params: any[] = [];

    if (search) {
      whereClause += ' AND (name ILIKE $1 OR email ILIKE $1)';
      params.push(`%${search}%`);
    }
    if (role) {
      whereClause += ` AND role = $${params.length + 1}`;
      params.push(role);
    }
    if (status === 'banned') {
      whereClause += ' AND is_banned = true';
    }

    const [users, countResult] = await Promise.all([
      sequelize.query(
        `SELECT id, name, email, avatar, role, admin_role, is_verified, is_banned,
                rating, reviews_count, membership_tier, created_at, last_login
         FROM users WHERE 1=1 ${whereClause}
         ORDER BY created_at DESC
         LIMIT ${limit} OFFSET ${offset}`,
        { type: QueryTypes.SELECT, bind: params }
      ),
      sequelize.query(
        `SELECT COUNT(*) as count FROM users WHERE 1=1 ${whereClause}`,
        { type: QueryTypes.SELECT, bind: params }
      ),
    ]);

    res.json({
      success: true,
      users,
      pagination: {
        total: (countResult[0] as any)?.count || 0,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(((countResult[0] as any)?.count || 0) / Number(limit)),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/users/:id/ban', requireAdmin, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { reason } = req.body;

    await sequelize.query(
      `UPDATE users SET is_banned = true, ban_reason = $1, banned_at = NOW(), banned_by = $2 WHERE id = $3`,
      { type: QueryTypes.UPDATE, bind: [reason, userId, req.params.id] }
    );

    await AuditLog.log('user.banned', {
      userId,
      entity: 'user',
      entityId: req.params.id,
      description: `User banned: ${reason}`,
      severity: 'high',
    });

    res.json({ success: true, message: 'Usuario baneado' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/users/:id/unban', requireAdmin, async (req, res) => {
  try {
    const userId = getUserId(req);

    await sequelize.query(
      `UPDATE users SET is_banned = false, ban_reason = NULL, banned_at = NULL, banned_by = NULL WHERE id = $1`,
      { type: QueryTypes.UPDATE, bind: [req.params.id] }
    );

    await AuditLog.log('user.unbanned', {
      userId,
      entity: 'user',
      entityId: req.params.id,
      severity: 'medium',
    });

    res.json({ success: true, message: 'Usuario desbaneado' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ===========================================
// TICKETS
// ===========================================

app.get('/tickets', requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, priority, category } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const where: any = {};
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (category) where.category = category;

    const { count, rows: tickets } = await Ticket.findAndCountAll({
      where,
      order: [
        ['priority', 'DESC'],
        ['createdAt', 'ASC'],
      ],
      limit: Number(limit),
      offset,
    });

    res.json({
      success: true,
      tickets,
      pagination: {
        total: count,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(count / Number(limit)),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/tickets/:id', requireAdmin, async (req, res) => {
  try {
    const ticket = await Ticket.findByPk(req.params.id);
    if (!ticket) {
      res.status(404).json({ success: false, message: 'Ticket no encontrado' });
      return;
    }
    res.json({ success: true, ticket });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/tickets/:id/assign', requireAdmin, async (req, res) => {
  try {
    const userId = getUserId(req);
    const ticket = await Ticket.findByPk(req.params.id);

    if (!ticket) {
      res.status(404).json({ success: false, message: 'Ticket no encontrado' });
      return;
    }

    await ticket.assign(userId!);

    await AuditLog.log('ticket.assigned', {
      userId,
      entity: 'ticket',
      entityId: ticket.id,
      severity: 'low',
    });

    res.json({ success: true, ticket });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/tickets/:id/respond', requireAdmin, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { content } = req.body;

    const ticket = await Ticket.findByPk(req.params.id);
    if (!ticket) {
      res.status(404).json({ success: false, message: 'Ticket no encontrado' });
      return;
    }

    await ticket.addResponse(userId!, content, true);
    res.json({ success: true, ticket });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/tickets/:id/resolve', requireAdmin, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { resolution } = req.body;

    const ticket = await Ticket.findByPk(req.params.id);
    if (!ticket) {
      res.status(404).json({ success: false, message: 'Ticket no encontrado' });
      return;
    }

    await ticket.resolve(resolution);

    await AuditLog.log('ticket.resolved', {
      userId,
      entity: 'ticket',
      entityId: ticket.id,
      description: resolution,
      severity: 'low',
    });

    res.json({ success: true, ticket });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ===========================================
// AUDIT LOGS
// ===========================================

app.get('/audit-logs', requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 50, action, entity, severity, userId } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const where: any = {};
    if (action) where.action = action;
    if (entity) where.entity = entity;
    if (severity) where.severity = severity;
    if (userId) where.userId = userId;

    const { count, rows: logs } = await AuditLog.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: Number(limit),
      offset,
    });

    res.json({
      success: true,
      logs,
      pagination: {
        total: count,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(count / Number(limit)),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ===========================================
// JOBS MANAGEMENT
// ===========================================

app.get('/jobs', requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let whereClause = '';
    if (status) {
      whereClause = `WHERE status = '${status}'`;
    }

    const [jobs, countResult] = await Promise.all([
      sequelize.query(
        `SELECT j.*, u.name as client_name, u.email as client_email
         FROM jobs j
         LEFT JOIN users u ON j.client_id = u.id
         ${whereClause}
         ORDER BY j.created_at DESC
         LIMIT ${limit} OFFSET ${offset}`,
        { type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT COUNT(*) as count FROM jobs ${whereClause}`,
        { type: QueryTypes.SELECT }
      ),
    ]);

    res.json({
      success: true,
      jobs,
      pagination: {
        total: (countResult[0] as any)?.count || 0,
        page: Number(page),
        limit: Number(limit),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/jobs/:id/approve', requireAdmin, async (req, res) => {
  try {
    const userId = getUserId(req);

    await sequelize.query(
      `UPDATE jobs SET status = 'open', reviewed_by = $1, reviewed_at = NOW() WHERE id = $2`,
      { type: QueryTypes.UPDATE, bind: [userId, req.params.id] }
    );

    await AuditLog.log('job.approved', {
      userId,
      entity: 'job',
      entityId: req.params.id,
      severity: 'low',
    });

    res.json({ success: true, message: 'Trabajo aprobado' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/jobs/:id/reject', requireAdmin, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { reason } = req.body;

    await sequelize.query(
      `UPDATE jobs SET status = 'cancelled', rejected_reason = $1, reviewed_by = $2, reviewed_at = NOW() WHERE id = $3`,
      { type: QueryTypes.UPDATE, bind: [reason, userId, req.params.id] }
    );

    await AuditLog.log('job.rejected', {
      userId,
      entity: 'job',
      entityId: req.params.id,
      description: reason,
      severity: 'medium',
    });

    res.json({ success: true, message: 'Trabajo rechazado' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ===========================================
// ERROR HANDLING
// ===========================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Ruta no encontrada',
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
║              DOAPP ADMIN SERVICE                      ║
╠═══════════════════════════════════════════════════════╣
║  Port: ${config.port}                                         ║
║  Environment: ${config.nodeEnv.padEnd(39)}║
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
  console.log(`[${config.serviceName}] SIGTERM received...`);
  redis.disconnect();
  process.exit(0);
});

startServer();

export default app;
