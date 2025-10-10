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

  // OAuth - Google
  googleClientId: process.env.GOOGLE_CLOUD_AUTH_ID || "",
  googleClientSecret: process.env.GOOGLE_CLOUD_AUTH_PASS || "",

  // OAuth - Facebook
  facebookAppId: process.env.FACEBOOK_APP_ID || "",
  facebookAppSecret: process.env.FACEBOOK_APP_SECRET || "",

  // PayPal
  paypalMode: process.env.PAYPAL_MODE || "sandbox",
  paypalClientId: process.env.PAYPAL_CLIENT_ID || "",
  paypalClientSecret: process.env.PAYPAL_CLIENT_SECRET || "",
  paypalPlatformFeePercentage: parseFloat(process.env.PAYPAL_PLATFORM_FEE_PERCENTAGE || "5"),

  // Firebase (for push notifications)
  firebaseServiceAccountKey: process.env.FIREBASE_SERVICE_ACCOUNT_KEY || "",

  // Email (SendGrid/Mailgun)
  emailProvider: process.env.EMAIL_PROVIDER || "sendgrid", // 'sendgrid' or 'mailgun'
  sendgridApiKey: process.env.SENDGRID_API_KEY || "",
  sendgridFromEmail: process.env.SENDGRID_FROM_EMAIL || "noreply@doapp.com",
  mailgunApiKey: process.env.MAILGUN_API_KEY || "",
  mailgunDomain: process.env.MAILGUN_DOMAIN || "",
  mailgunFromEmail: process.env.MAILGUN_FROM_EMAIL || "noreply@doapp.com",

  // Redis (Cache)
  redisUrl: process.env.REDIS_URL || "",

  // Analytics
  googleAnalyticsId: process.env.GOOGLE_ANALYTICS_ID || "",

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
