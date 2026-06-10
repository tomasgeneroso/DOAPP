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

  // Server URL (para logs y callbacks)
  serverUrl: process.env.SERVER_URL || (process.env.NODE_ENV === "production" ? "https://doapparg.site" : "http://localhost:5000"),

  // OAuth - Google (use TEST credentials in development)
  googleClientId: process.env.NODE_ENV === "development"
    ? (process.env.GOOGLE_CLOUD_AUTH_ID_TEST || process.env.GOOGLE_CLOUD_AUTH_ID || "")
    : (process.env.GOOGLE_CLOUD_AUTH_ID || ""),
  googleClientSecret: process.env.NODE_ENV === "development"
    ? (process.env.GOOGLE_CLOUD_AUTH_PASS_TEST || process.env.GOOGLE_CLOUD_AUTH_PASS || "")
    : (process.env.GOOGLE_CLOUD_AUTH_PASS || ""),

  // OAuth - Facebook
  facebookAppId: process.env.FACEBOOK_APP_ID || "",
  facebookAppSecret: process.env.FACEBOOK_APP_SECRET || "",

  // OAuth - Twitter/X
  twitterClientId: process.env.TWITTER_CLIENT_ID || "",
  twitterClientSecret: process.env.TWITTER_CLIENT_SECRET || "",

  // Payment providers toggle (Argentina MVP: MercadoPago + AstroPay; PayPal disabled)
  paypalEnabled: process.env.PAYPAL_ENABLED === "true", // disabled by default
  astropayEnabled: process.env.ASTROPAY_ENABLED !== "false", // enabled by default for AR
  astropayMode: process.env.ASTROPAY_MODE || "sandbox",
  astropayApiKey: process.env.ASTROPAY_API_KEY || "",
  astropaySecretKey: process.env.ASTROPAY_SECRET_KEY || "",
  astropayBaseUrl:
    process.env.ASTROPAY_MODE === "production"
      ? (process.env.ASTROPAY_BASE_URL || "https://api.astropay.com")
      : (process.env.ASTROPAY_SANDBOX_BASE_URL || "https://sandbox.astropay.com"),
  astropayPlatformFeePercentage: parseFloat(process.env.ASTROPAY_PLATFORM_FEE_PERCENTAGE || "0"),

  // PayPal - Usa credenciales de sandbox en desarrollo, producción en producción
  paypalMode: process.env.PAYPAL_MODE || "sandbox",
  paypalClientId: process.env.PAYPAL_MODE === "sandbox"
    ? (process.env.PAYPAL_SANDBOX_CLIENT_ID || process.env.PAYPAL_CLIENT_ID || "")
    : (process.env.PAYPAL_CLIENT_ID || ""),
  paypalClientSecret: process.env.PAYPAL_MODE === "sandbox"
    ? (process.env.PAYPAL_SANDBOX_SECRET || process.env.PAYPAL_CLIENT_SECRET || "")
    : (process.env.PAYPAL_CLIENT_SECRET || ""),
  paypalPlatformFeePercentage: parseFloat(process.env.PAYPAL_PLATFORM_FEE_PERCENTAGE || "5"),

  // PayPal Sandbox Accounts
  sandboxBusinessAccount: process.env.SANDBOX_BUSINESS_ACCOUNT || "",
  sandboxPersonalAccount: process.env.SANDBOX_PERSONAL_ACCOUNT || "",

  // Firebase (for push notifications)
  firebaseServiceAccountKey: process.env.FIREBASE_SERVICE_ACCOUNT_KEY || "",

  // Email (SendGrid/Mailgun)
  emailProvider: process.env.EMAIL_PROVIDER || "sendgrid", // 'sendgrid' or 'mailgun'
  sendgridApiKey: process.env.SENDGRID_API_KEY || "",
  sendgridFromEmail: process.env.SENDGRID_FROM_EMAIL || "noreply@doapp.com",
  mailgunApiKey: process.env.MAILGUN_API_KEY || "",
  mailgunDomain: process.env.MAILGUN_DOMAIN || "",
  mailgunFromEmail: process.env.MAILGUN_FROM_EMAIL || "noreply@doapp.com",

  // Analytics
  googleAnalyticsId: process.env.GOOGLE_ANALYTICS_ID || "",

  // PostgreSQL Database
  dbHost: process.env.DB_HOST || "localhost",
  dbPort: parseInt(process.env.DB_PORT || "5432"),
  dbName: process.env.DB_NAME || "doapp",
  dbUser: process.env.DB_USER || "postgres",
  dbPassword: process.env.DB_PASSWORD || "",

  // Validaciones
  isProduction: process.env.NODE_ENV === "production",
  isDevelopment: process.env.NODE_ENV === "development",
};

// Validar variables críticas
console.log("🔍 Environment check:");
console.log("NODE_ENV:", config.nodeEnv);
console.log("JWT_SECRET exists:", !!config.jwtSecret && config.jwtSecret !== "tu-secreto-super-seguro-cambialo");

if (!config.jwtSecret || config.jwtSecret === "tu-secreto-super-seguro-cambialo") {
  if (config.isProduction) {
    // P0 security: never boot production with the public default secret —
    // anyone could forge valid JWTs. Abort instead of warning.
    console.error("❌ FATAL: JWT_SECRET no está configurado en producción. Abortando.");
    process.exit(1);
  }
  console.warn("⚠️  ADVERTENCIA: Usando JWT_SECRET por defecto. Cámbialo en producción.");
}
