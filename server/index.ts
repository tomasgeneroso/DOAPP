import express, { Express } from "express";
import { createServer } from "http";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import session from "express-session";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "./config/env.js";
import connectDB from "./config/database.js";
import { errorHandler } from "./middleware/errorHandler.js";
import passport from "./config/passport.js";
import SocketService from "./services/socket.js";
import {
  sanitizeMongoInput,
  xssProtection,
  preventDirectoryTraversal,
  securityHeaders,
  apiLimiter,
} from "./middleware/security.js";

// Rutas
import authRoutes from "./routes/auth.js";
import jobsRoutes from "./routes/jobs.js";
import contractsRoutes from "./routes/contracts.js";

// Admin routes
import adminUsersRoutes from "./routes/admin/users.js";
import adminContractsRoutes from "./routes/admin/contracts.js";
import adminTicketsRoutes from "./routes/admin/tickets.js";
import adminAnalyticsRoutes from "./routes/admin/analytics.js";
import adminTwoFactorRoutes from "./routes/admin/twoFactor.js";

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

// ESM __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Inicializar Express
const app: Express = express();

// Conectar a MongoDB
connectDB();

// Middleware de seguridad
app.use(helmet({
  contentSecurityPolicy: false, // Desactivar para desarrollo
  crossOriginEmbedderPolicy: false,
}));

// CORS - Permitir múltiples orígenes en producción
const allowedOrigins = config.isProduction
  ? [config.clientUrl, process.env.RAILWAY_PUBLIC_DOMAIN].filter(Boolean)
  : [config.clientUrl, "http://localhost:5173", "http://localhost:5000"];

app.use(
  cors({
    origin: (origin, callback) => {
      // Permitir requests sin origin (como mobile apps o curl)
      if (!origin) return callback(null, true);

      if (allowedOrigins.some(allowed => origin.startsWith(allowed.replace(/\/$/, '')))) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  })
);

// Body parser
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Cookie parser
app.use(cookieParser());

// Security middleware
app.use(securityHeaders);
app.use(sanitizeMongoInput);
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

// Servir archivos subidos
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// API Routes
app.use("/api/auth", authRoutes);
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

// Admin Routes
app.use("/api/admin/users", adminUsersRoutes);
app.use("/api/admin/contracts", adminContractsRoutes);
app.use("/api/admin/tickets", adminTicketsRoutes);
app.use("/api/admin/analytics", adminAnalyticsRoutes);
app.use("/api/admin/2fa", adminTwoFactorRoutes);

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

// Servir el SPA en producción (debe ir después de todas las rutas de API)
if (config.isProduction) {
  const spaPath = path.join(__dirname, "../spa");
  app.use(express.static(spaPath));

  // Todas las demás rutas redirigen al index.html (SPA routing)
  app.get("*", (req, res) => {
    res.sendFile(path.join(spaPath, "index.html"));
  });
}

// Error handler (debe ser el último middleware)
app.use(errorHandler);

// Puerto
const PORT = config.port;

// Crear servidor HTTP
const httpServer = createServer(app);

// Inicializar Socket.io
const socketService = new SocketService(httpServer);
console.log("🔌 Socket.io initialized");

// Export socket service for use in other modules
export { socketService };

// Initialize escrow automation
import escrowAutomation from "./services/escrowAutomation.js";
escrowAutomation.initialize();

// Iniciar servidor
httpServer.listen(PORT, () => {
  console.log(`\n🚀 Servidor corriendo en modo ${config.nodeEnv}`);
  console.log(`📍 URL: http://localhost:${PORT}`);
  console.log(`📡 API: http://localhost:${PORT}/api`);
  console.log(`💬 WebSocket: ws://localhost:${PORT}`);
  console.log(`📄 Legal: http://localhost:${PORT}/legal\n`);
});

export default app;
