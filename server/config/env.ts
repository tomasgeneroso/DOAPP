import dotenv from "dotenv";

// Cargar variables de entorno
dotenv.config();

export const config = {
  // Puerto del servidor
  port: process.env.PORT || 5000,

  // MongoDB
  mongodbUri: process.env.MONGODB_URI || "",

  // JWT
  jwtSecret: process.env.JWT_SECRET || "tu-secreto-super-seguro-cambialo",
  jwtExpire: process.env.JWT_EXPIRE || "7d",

  // Entorno
  nodeEnv: process.env.NODE_ENV || "development",

  // Frontend URL (para CORS)
  clientUrl: process.env.CLIENT_URL || "http://localhost:5173",

  // Validaciones
  isProduction: process.env.NODE_ENV === "production",
  isDevelopment: process.env.NODE_ENV === "development",
};

// Validar variables críticas
if (!config.mongodbUri && config.isProduction) {
  throw new Error("MONGODB_URI es requerida en producción");
}

if (!config.jwtSecret || config.jwtSecret === "tu-secreto-super-seguro-cambialo") {
  console.warn("⚠️  ADVERTENCIA: Usando JWT_SECRET por defecto. Cámbialo en producción.");
}
