import express, { Express } from "express";
import { createServer } from "http";
import { createServer as createHttpsServer } from "https";
import fs from "fs";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import session from "express-session";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "./config/env.js";
import { initDatabase } from "./config/database.js";
import { errorHandler } from "./middleware/errorHandler.js";
import passport from "./config/passport.js";
import SocketService, { setSocketServiceInstance } from "./services/socket.js";
import {
  xssProtection,
  preventDirectoryTraversal,
  securityHeaders,
  apiLimiter,
} from "./middleware/security.js";
// TEMPORARILY DISABLED - DEBUGGING
// import { startEscalateExpiredChangeRequestsJob } from "./jobs/escalateExpiredChangeRequests.js";
import { startResetProMembershipCountersJob } from "./jobs/resetProMembershipCounters.js";
import { startAutoSelectWorkerJob } from "./jobs/autoSelectWorker.js";
import { startAutoCancelExpiredJobsJob } from "./jobs/autoCancelExpiredJobs.js";
import { startJobReminderJob } from "./jobs/jobReminders.js";
import { startSuspendFlexibleEndDateJob } from "./jobs/suspendFlexibleEndDateJobs.js";
import { startResetReferralDiscountsJob } from "./jobs/resetReferralDiscounts.js";
import { startAutoConfirmContractsJob } from "./jobs/autoConfirmContracts.js";
import { startConfirmationReminderJob } from "./jobs/sendConfirmationReminders.js";

// Rutas
import authRoutes from "./routes/auth.js";
import jobsRoutes from "./routes/jobs.js";
import contractsRoutes from "./routes/contracts.js";
import usersRoutes from "./routes/users.js";

// Admin routes
import adminUsersRoutes from "./routes/admin/users.js";
import adminContractsRoutes from "./routes/admin/contracts.js";
import adminTicketsRoutes from "./routes/admin/tickets.js";
import adminAnalyticsRoutes from "./routes/admin/analytics.js";
import adminTwoFactorRoutes from "./routes/admin/twoFactor.js";
import adminDisputesRoutes from "./routes/admin/disputes.js";
import adminRolesRoutes from "./routes/admin/roles.js";
import adminJobsRoutes from "./routes/admin/jobs.js";

// Payment routes
import paymentsRoutes from "./routes/payments.js";

// Matching routes
import matchingRoutes from "./routes/matching.js";

// Negotiation routes
import negotiationRoutes from "./routes/negotiation.js";

// Review routes
import reviewsRoutes from "./routes/reviews.js";

// Ticket routes
import ticketsRoutes from "./routes/tickets.js";

// Chat routes
import chatRoutes from "./routes/chat.js";

// Notification routes
import notificationsRoutes from "./routes/notifications.js";

// Search routes
import searchRoutes from "./routes/search.js";

// Portfolio routes
import portfolioRoutes from "./routes/portfolio.js";

// Dispute routes
import disputesRoutes from "./routes/disputes.js";

// Proposal routes
import proposalsRoutes from "./routes/proposals.js";

// Referral routes
import referralsRoutes from "./routes/referrals.js";

// Membership routes
import membershipRoutes from "./routes/membership.js";

// Contract Change Request routes
import contractChangeRequestsRoutes from "./routes/contractChangeRequests.js";

// Webhook routes
import webhooksRoutes from "./routes/webhooks.js";

// Advertisement routes
import advertisementsRoutes from "./routes/advertisements.js";
import adminAdvertisementsRoutes from "./routes/admin/advertisements.js";

// Contact routes
import contactRoutes from "./routes/contact.js";
import adminContactRoutes from "./routes/admin/contact.js";

// Blog routes
import blogsRoutes from "./routes/blogs.js";
import adminBlogsRoutes from "./routes/admin/blogs.js";

// Analytics routes
import analyticsDisputesRoutes from "./routes/analytics/disputes.js";

// Balance routes
import balanceRoutes from "./routes/balance.js";

// Post routes
import postsRoutes from "./routes/posts.js";


// Company Balance routes (owner only)
import companyBalanceRoutes from "./routes/admin/companyBalance.js";

// Marketing routes (owner, super_admin, admin)
import marketingRoutes from "./routes/admin/marketing.js";

// Family Codes routes (owner only)
import familyCodesRoutes from "./routes/admin/familyCodes.js";

// Promoter routes
import promoterRoutes from "./routes/promoter.js";

// User Analytics routes (Super PRO)
import userAnalyticsRoutes from "./routes/userAnalytics.js";

// Performance monitoring
import adminPerformanceRoutes from "./routes/admin/performance.js";
import { performanceMiddleware } from "./services/performanceMonitor.js";

// Pending payments report
import adminPendingPaymentsRoutes from "./routes/admin/pendingPayments.js";

// ESM __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Inicializar Express
const app: Express = express();

// Conectar a PostgreSQL
await initDatabase();

// Middleware de seguridad
app.use(helmet({
  contentSecurityPolicy: false, // Desactivar para desarrollo
  crossOriginEmbedderPolicy: false,
}));

// CORS
app.use(
  cors({
    origin: config.clientUrl,
    credentials: true,
  })
);

// Performance monitoring middleware (must be early to capture all requests)
app.use(performanceMiddleware());

// Body parser
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Cookie parser
app.use(cookieParser());

// Security middleware
app.use(securityHeaders);
// Note: sanitizeMongoInput removed - not needed for PostgreSQL
app.use(xssProtection);
app.use(preventDirectoryTraversal);

// Express session (requerido para Passport)
app.use(
  session({
    secret: config.jwtSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: config.isProduction,
      maxAge: 24 * 60 * 60 * 1000, // 24 horas
      httpOnly: true,
      sameSite: "strict",
    },
  })
);

// Inicializar Passport
app.use(passport.initialize());
app.use(passport.session());

// Rate limiting for all API routes
app.use("/api", apiLimiter);

// Servir archivos estáticos (documentos legales)
app.use("/legal", express.static(path.join(__dirname, "../public/legal")));

// Servir archivos subidos con CORS headers
app.use("/uploads", (req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", config.clientUrl);
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  next();
}, express.static(path.join(__dirname, "../uploads")));

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/jobs", jobsRoutes);
app.use("/api/contracts", contractsRoutes);
app.use("/api/payments", paymentsRoutes);
app.use("/api/matching", matchingRoutes);
app.use("/api/negotiation", negotiationRoutes);
console.log("📋 Tickets stack:", (ticketsRoutes as any).stack?.length || 0, "routes");
app.use("/api/tickets", ticketsRoutes);
console.log("📋 Tickets route mounted to Express");
app.use("/api/reviews", reviewsRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/portfolio", portfolioRoutes);
app.use("/api/disputes", disputesRoutes);
app.use("/api/proposals", proposalsRoutes);
app.use("/api/referrals", referralsRoutes);
app.use("/api/membership", membershipRoutes);
app.use("/api/contract-change-requests", contractChangeRequestsRoutes);
app.use("/api/webhooks", webhooksRoutes);
app.use("/api/advertisements", advertisementsRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/blogs", blogsRoutes);
app.use("/api/balance", balanceRoutes);
app.use("/api/posts", postsRoutes);
app.use("/api/promoter", promoterRoutes);
app.use("/api/user-analytics", userAnalyticsRoutes);

// MercadoPago OAuth routes - DISABLED (requires marketplace account)
// app.use("/api/mercadopago", (await import('./routes/mercadopagoOAuth.js')).default);

// Admin Routes
app.use("/api/admin/users", adminUsersRoutes);
app.use("/api/admin/contracts", adminContractsRoutes);
app.use("/api/admin/tickets", adminTicketsRoutes);
app.use("/api/admin/analytics", adminAnalyticsRoutes);
app.use("/api/admin/2fa", adminTwoFactorRoutes);
app.use("/api/admin/disputes", adminDisputesRoutes);
app.use("/api/admin/roles", adminRolesRoutes);
app.use("/api/admin/jobs", adminJobsRoutes);
app.use("/api/admin/advertisements", adminAdvertisementsRoutes);
app.use("/api/admin/contact", adminContactRoutes);
app.use("/api/admin/blogs", adminBlogsRoutes);
app.use("/api/admin/withdrawals", (await import('./routes/admin/withdrawals.js')).default);
app.use("/api/admin/payments", (await import('./routes/admin/payments.js')).default);
app.use("/api/admin/company-balance", companyBalanceRoutes);
app.use("/api/admin/marketing", marketingRoutes);
app.use("/api/admin/family-codes", familyCodesRoutes);
app.use("/api/admin/performance", adminPerformanceRoutes);
app.use("/api/admin/pending-payments", adminPendingPaymentsRoutes);

// Analytics Routes
app.use("/api/analytics/disputes", analyticsDisputesRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Servidor funcionando correctamente",
    timestamp: new Date().toISOString(),
  });
});

// Endpoint para obtener términos y condiciones
app.get("/api/legal/terms-app", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/legal/terminos-condiciones-app.txt"));
});

app.get("/api/legal/terms-contract", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/legal/terminos-condiciones-contrato.txt"));
});

// Error handler (debe ser el último middleware)
app.use(errorHandler);

// Puerto
const PORT = config.port;

// Crear servidor HTTP o HTTPS según configuración
let httpServer;
let isHttps = false;

// En desarrollo, intentar usar HTTPS si existen los certificados SSL
if (config.nodeEnv === 'development') {
  const sslKeyPath = path.join(process.cwd(), 'ssl', 'key.pem');
  const sslCertPath = path.join(process.cwd(), 'ssl', 'cert.pem');

  if (fs.existsSync(sslKeyPath) && fs.existsSync(sslCertPath)) {
    const httpsOptions = {
      key: fs.readFileSync(sslKeyPath),
      cert: fs.readFileSync(sslCertPath),
    };
    httpServer = createHttpsServer(httpsOptions, app);
    isHttps = true;
    console.log('🔒 HTTPS enabled with self-signed certificate');
  } else {
    httpServer = createServer(app);
    isHttps = false;
    console.log('⚠️  Running on HTTP (SSL certificates not found)');
  }
} else {
  // En producción, usar HTTP (el proxy/load balancer manejará HTTPS)
  httpServer = createServer(app);
  isHttps = false;
}

// Inicializar Socket.io
const socketService = new SocketService(httpServer);
setSocketServiceInstance(socketService); // Register for global access via getIO()
console.log("🔌 Socket.io initialized");

// Export socket service for use in other modules
export { socketService };

// Initialize escrow automation
// TEMPORARILY DISABLED - DEBUGGING
// import escrowAutomation from "./services/escrowAutomation.js";
// escrowAutomation.initialize();

// Initialize contract change requests escalation cron job
// TEMPORARILY DISABLED - DEBUGGING
// startEscalateExpiredChangeRequestsJob();

// Initialize PRO membership monthly reset job
startResetProMembershipCountersJob();

// Initialize auto-select worker job (24h before job start)
startAutoSelectWorkerJob();

// Initialize auto-cancel expired jobs job (jobs with past dates)
startAutoCancelExpiredJobsJob();

// Initialize job reminder notifications (12h, 6h, 2h before start)
startJobReminderJob();

// Initialize suspend jobs with flexible end date (24h before start without end date)
startSuspendFlexibleEndDateJob();

// Initialize reset referral discounts (daily at midnight)
startResetReferralDiscountsJob();

// Initialize auto-confirm contracts (every 5 minutes - 2 hours timeout)
startAutoConfirmContractsJob();

// Initialize confirmation reminders (when job ends, remind both parties to confirm)
startConfirmationReminderJob();

// Manejo de errores del servidor
httpServer.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`\n❌ Error: El puerto ${PORT} ya está en uso`);
    console.log('\n💡 Soluciones:');
    console.log('   1. Ejecuta: npm run kill-ports');
    console.log(`   2. O manualmente: netstat -ano | findstr :${PORT}`);
    console.log(`   3. Luego: taskkill //F //PID <PID>\n`);
    process.exit(1);
  } else if (error.code === 'EACCES') {
    console.error(`\n❌ Error: No tienes permisos para usar el puerto ${PORT}`);
    console.log('💡 Intenta usar un puerto diferente (> 1024)\n');
    process.exit(1);
  } else {
    console.error('\n❌ Error al iniciar el servidor:', error);
    process.exit(1);
  }
});

// Iniciar servidor
httpServer.listen(PORT, () => {
  const protocol = isHttps ? 'https' : 'http';
  const wsProtocol = isHttps ? 'wss' : 'ws';
  const serverUrl = `${protocol}://localhost:${PORT}`;

  console.log(`\n🚀 Servidor corriendo en modo ${config.nodeEnv}`);
  console.log(`📍 URL: ${serverUrl}`);
  console.log(`📡 API: ${serverUrl}/api`);
  console.log(`💬 WebSocket: ${wsProtocol}://localhost:${PORT}`);
  console.log(`📄 Legal: ${serverUrl}/legal`);

  // Mostrar credenciales de desarrollo
  if (config.nodeEnv === 'development') {
    console.log('\n📧 Login credentials:');
    console.log('\n👑 Admin:');
    console.log('   Owner: admin@doapp.com / password123');
    console.log('   Super Admin: superadmin@doapp.com / password123');
    console.log('   Moderator: moderator@doapp.com / password123');
    console.log('   Support: support@doapp.com / password123');
    console.log('\n👥 Regular users:');
    console.log('   Client 1: maria@example.com / password123');
    console.log('   Client 2: ana@example.com / password123');
    console.log('   Doer 1: carlos@example.com / password123');
    console.log('   Doer 2: juan@example.com / password123');
    console.log('   Both (Client & Doer): laura@example.com / password123\n');
  }
});

export default app;
