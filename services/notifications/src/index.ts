import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config.js';
import { initializeDatabase } from './database.js';
import { redis, pubsub, subscriber } from './redis.js';
import { Notification } from './models/Notification.model.js';
import { Op } from 'sequelize';

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
// HELPER FUNCTIONS
// ===========================================

const getUserId = (req: express.Request): string | null => {
  return req.headers['x-user-id'] as string || null;
};

// Send push notification (simplified - in production use Firebase Admin)
async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> {
  console.log(`[Notifications] Push to ${userId}: ${title}`);
  // In production:
  // - Get user's FCM tokens from database
  // - Use firebase-admin to send notification
}

// Send email notification (simplified)
async function sendEmailNotification(
  email: string,
  subject: string,
  body: string
): Promise<void> {
  console.log(`[Notifications] Email to ${email}: ${subject}`);
  // In production:
  // - Use nodemailer with SMTP config
}

// ===========================================
// EVENT SUBSCRIBERS
// ===========================================

async function setupEventSubscribers() {
  // Subscribe to chat messages
  pubsub.subscribe('chat:message', async (data: any) => {
    try {
      const notification = await Notification.createNotification(
        data.receiverId,
        'message',
        'Nuevo mensaje',
        data.content,
        {
          link: `/chat/${data.conversationId}`,
          referenceId: data.conversationId,
          referenceType: 'conversation',
          senderId: data.senderId,
        }
      );

      // Send push notification
      await sendPushNotification(
        data.receiverId,
        'Nuevo mensaje',
        data.content,
        { conversationId: data.conversationId }
      );

      await notification.markPushSent();
    } catch (error) {
      console.error('[Notifications] Chat message handler error:', error);
    }
  });

  // Subscribe to proposal events
  pubsub.subscribe('proposal:created', async (data: any) => {
    try {
      await Notification.createNotification(
        data.clientId,
        'proposal',
        'Nueva propuesta',
        'Has recibido una nueva propuesta para tu trabajo',
        {
          link: `/jobs/${data.jobId}/proposals`,
          referenceId: data.proposalId,
          referenceType: 'proposal',
          senderId: data.doerId,
        }
      );
    } catch (error) {
      console.error('[Notifications] Proposal handler error:', error);
    }
  });

  // Subscribe to contract events
  pubsub.subscribe('contract:created', async (data: any) => {
    try {
      await Notification.createNotification(
        data.doerId,
        'contract',
        'Nuevo contrato',
        'Has sido seleccionado para un trabajo',
        {
          link: `/contracts/${data.contractId}`,
          referenceId: data.contractId,
          referenceType: 'contract',
          senderId: data.clientId,
        }
      );
    } catch (error) {
      console.error('[Notifications] Contract handler error:', error);
    }
  });

  pubsub.subscribe('contract:completed', async (data: any) => {
    try {
      // Notify both parties
      await Notification.createNotification(
        data.clientId,
        'contract',
        'Contrato completado',
        'El contrato ha sido completado exitosamente',
        {
          link: `/contracts/${data.contractId}`,
          referenceId: data.contractId,
          referenceType: 'contract',
        }
      );

      await Notification.createNotification(
        data.doerId,
        'payment',
        'Pago liberado',
        `Se ha liberado el pago de $${data.amount}`,
        {
          link: `/balance`,
          referenceId: data.contractId,
          referenceType: 'contract',
        }
      );
    } catch (error) {
      console.error('[Notifications] Contract completed handler error:', error);
    }
  });

  // Subscribe to payment events
  pubsub.subscribe('payment:approved', async (data: any) => {
    try {
      await Notification.createNotification(
        data.userId,
        'payment',
        'Pago aprobado',
        `Tu pago de $${data.amount} ha sido procesado`,
        {
          link: `/payments/${data.paymentId}`,
          referenceId: data.paymentId,
          referenceType: 'payment',
        }
      );
    } catch (error) {
      console.error('[Notifications] Payment handler error:', error);
    }
  });

  console.log(`✅ [${config.serviceName}] Event subscribers initialized`);
}

// ===========================================
// HTTP ROUTES
// ===========================================

// Health check
app.get('/health', (req, res) => {
  res.json({
    success: true,
    service: config.serviceName,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Get notifications
app.get('/', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ success: false, message: 'No autorizado' });
      return;
    }

    const { page = 1, limit = 20, unreadOnly } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const where: any = { userId };
    if (unreadOnly === 'true') {
      where.isRead = false;
    }

    const { count, rows: notifications } = await Notification.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: Number(limit),
      offset,
    });

    const unreadCount = await Notification.getUnreadCount(userId);

    res.json({
      success: true,
      notifications,
      unreadCount,
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

// Get unread count
app.get('/unread-count', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ success: false, message: 'No autorizado' });
      return;
    }

    const count = await Notification.getUnreadCount(userId);
    res.json({ success: true, count });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Mark notification as read
app.post('/:id/read', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ success: false, message: 'No autorizado' });
      return;
    }

    const notification = await Notification.findByPk(req.params.id);

    if (!notification || notification.userId !== userId) {
      res.status(404).json({ success: false, message: 'Notificación no encontrada' });
      return;
    }

    await notification.markAsRead();
    res.json({ success: true, notification });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Mark all as read
app.post('/read-all', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ success: false, message: 'No autorizado' });
      return;
    }

    const count = await Notification.markAllAsRead(userId);
    res.json({ success: true, markedCount: count });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Subscribe FCM token
app.post('/subscribe', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ success: false, message: 'No autorizado' });
      return;
    }

    const { token } = req.body;
    if (!token) {
      res.status(400).json({ success: false, message: 'Token requerido' });
      return;
    }

    // In production: Store token in user's FCM tokens array via Auth Service
    console.log(`[Notifications] FCM token registered for user ${userId}`);

    res.json({ success: true, message: 'Token registrado' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Send notification (internal use / admin)
app.post('/send', async (req, res) => {
  try {
    const { userId, type, title, message, link, metadata } = req.body;

    if (!userId || !type || !title || !message) {
      res.status(400).json({ success: false, message: 'Campos requeridos: userId, type, title, message' });
      return;
    }

    const notification = await Notification.createNotification(
      userId,
      type,
      title,
      message,
      { link, metadata }
    );

    // Send push notification
    await sendPushNotification(userId, title, message);
    await notification.markPushSent();

    res.json({ success: true, notification });
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
    await setupEventSubscribers();

    app.listen(config.port, () => {
      console.log(`
╔═══════════════════════════════════════════════════════╗
║              DOAPP NOTIFICATIONS SERVICE              ║
╠═══════════════════════════════════════════════════════╣
║  Port: ${config.port}                                         ║
║  Environment: ${config.nodeEnv.padEnd(39)}║
║  FCM: ${config.fcm.projectId ? 'Configured' : 'Not configured'}                                  ║
║  SMTP: ${config.smtp.host ? 'Configured' : 'Not configured'}                                 ║
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
  subscriber.disconnect();
  process.exit(0);
});

startServer();

export default app;
