import express, { Express } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "./config/env.js";
import connectDB from "./config/database.js";
import { errorHandler } from "./middleware/errorHandler.js";

// Rutas
import authRoutes from "./routes/auth.js";
import jobsRoutes from "./routes/jobs.js";
import contractsRoutes from "./routes/contracts.js";

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

// CORS
app.use(
  cors({
    origin: config.clientUrl,
    credentials: true,
  })
);

// Body parser
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Cookie parser
app.use(cookieParser());

// Servir archivos estáticos (documentos legales)
app.use("/legal", express.static(path.join(__dirname, "../public/legal")));

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/jobs", jobsRoutes);
app.use("/api/contracts", contractsRoutes);

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

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`\n🚀 Servidor corriendo en modo ${config.nodeEnv}`);
  console.log(`📍 URL: http://localhost:${PORT}`);
  console.log(`📡 API: http://localhost:${PORT}/api`);
  console.log(`📄 Legal: http://localhost:${PORT}/legal\n`);
});

export default app;
