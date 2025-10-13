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

  // Email (Hostinger SMTP via nodemailer)
  smtpHost: process.env.SMTP_HOST || "smtp.hostinger.com",
  smtpPort: parseInt(process.env.SMTP_PORT || "465"),
  smtpSecure: process.env.SMTP_SECURE === "true" || true, // true for 465, false for 587
  smtpUser: process.env.SMTP_USER || "",
  smtpPass: process.env.SMTP_PASS || "",
  smtpFromEmail: process.env.SMTP_FROM_EMAIL || "noreply@doapparg.site",

  // Twilio (SMS verification only)
  // En desarrollo usa test credentials, en producción usa las reales
  twilioAccountSid: process.env.NODE_ENV === "production"
    ? process.env.TWILIO_ACCOUNT_SID || ""
    : process.env.TWILIO_TEST_ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID || "",
  twilioAuthToken: process.env.NODE_ENV === "production"
    ? process.env.TWILIO_AUTH_TOKEN || ""
    : process.env.TWILIO_TEST_AUTH_TOKEN || process.env.TWILIO_AUTH_TOKEN || "",
  twilioPhoneNumber: process.env.NODE_ENV === "production"
    ? process.env.TWILIO_PHONE_NUMBER || ""
    : process.env.TWILIO_TEST_PHONE_NUMBER || process.env.TWILIO_PHONE_NUMBER || "",

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
