import sgMail from "@sendgrid/mail";
import formData from "form-data";
import Mailgun from "mailgun.js";
import nodemailer from "nodemailer";
import { config } from "../config/env";
import { User } from "../models/sql/User.model.js";

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
}

interface TemplateEmailOptions {
  to: string;
  subject: string;
  templateName: string;
  templateData: Record<string, any>;
}

class EmailService {
  private sendgridInitialized = false;
  private mailgunInitialized = false;
  private smtpInitialized = false;
  private mailgunClient: any = null;
  private smtpTransporter: any = null;

  constructor() {
    this.initialize();
  }

  private initialize() {
    const provider = config.emailProvider;

    if (provider === "sendgrid") {
      this.initializeSendGrid();
    } else if (provider === "mailgun") {
      this.initializeMailgun();
    } else if (provider === "smtp") {
      this.initializeSMTP();
    } else {
      console.warn("⚠️  No email provider configured. Email notifications will be disabled.");
    }
  }

  private initializeSendGrid() {
    try {
      if (config.sendgridApiKey) {
        sgMail.setApiKey(config.sendgridApiKey);
        this.sendgridInitialized = true;
        console.log("✅ SendGrid initialized");
      } else {
        console.warn("⚠️  SendGrid API key not configured.");
      }
    } catch (error) {
      console.error("❌ Failed to initialize SendGrid:", error);
    }
  }

  private initializeMailgun() {
    try {
      if (config.mailgunApiKey && config.mailgunDomain) {
        const mailgun = new Mailgun(formData);
        this.mailgunClient = mailgun.client({
          username: "api",
          key: config.mailgunApiKey,
        });
        this.mailgunInitialized = true;
        console.log("✅ Mailgun initialized");
      } else {
        console.warn("⚠️  Mailgun API key or domain not configured.");
      }
    } catch (error) {
      console.error("❌ Failed to initialize Mailgun:", error);
    }
  }

  private initializeSMTP() {
    try {
      const smtpHost = process.env.SMTP_HOST;
      const smtpPort = parseInt(process.env.SMTP_PORT || "465");
      const smtpSecure = process.env.SMTP_SECURE === "true";
      const smtpUser = process.env.SMTP_USER;
      const smtpPass = process.env.SMTP_PASS;

      if (smtpHost && smtpUser && smtpPass) {
        this.smtpTransporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpSecure,
          auth: {
            user: smtpUser,
            pass: smtpPass,
          },
          // Configuración adicional para Hostinger
          tls: {
            rejectUnauthorized: false, // Útil para certificados auto-firmados
          },
          // Timeouts para evitar bloqueos
          connectionTimeout: 10000, // 10 segundos
          greetingTimeout: 10000,
          socketTimeout: 30000,
          // Pool de conexiones
          pool: true,
          maxConnections: 3,
          maxMessages: 100,
        });

        // Verificar conexión (sin bloquear)
        this.smtpTransporter.verify((error: any, success: any) => {
          if (error) {
            // Clasificar el tipo de error
            const errorMessage = error.message || String(error);
            if (errorMessage.includes('EDNS') || errorMessage.includes('queryA') || errorMessage.includes('getaddrinfo')) {
              console.warn("⚠️  SMTP DNS resolution failed. Emails will retry on send.");
              console.warn(`   Host: ${smtpHost} - Check DNS configuration or network connectivity.`);
            } else if (errorMessage.includes('ETIMEDOUT') || errorMessage.includes('ECONNREFUSED')) {
              console.warn("⚠️  SMTP connection timeout/refused. Server may be unreachable.");
            } else {
              console.error("❌ SMTP connection verification failed:", errorMessage);
            }
          } else {
            console.log("✅ SMTP server is ready to send emails");
          }
        });

        this.smtpInitialized = true;
        console.log("✅ SMTP initialized with host:", smtpHost, "port:", smtpPort);
      } else {
        console.warn("⚠️  SMTP configuration incomplete.");
      }
    } catch (error) {
      console.error("❌ Failed to initialize SMTP:", error);
    }
  }

  /**
   * Send email using configured provider
   */
  async sendEmail(options: EmailOptions): Promise<boolean> {
    if (!this.sendgridInitialized && !this.mailgunInitialized && !this.smtpInitialized) {
      console.warn("No email provider initialized. Skipping email.");
      return false;
    }

    try {
      if (config.emailProvider === "sendgrid" && this.sendgridInitialized) {
        return await this.sendViaSendGrid(options);
      } else if (config.emailProvider === "mailgun" && this.mailgunInitialized) {
        return await this.sendViaMailgun(options);
      } else if (config.emailProvider === "smtp" && this.smtpInitialized) {
        return await this.sendViaSMTP(options);
      }
      return false;
    } catch (error) {
      console.error("Error sending email:", error);
      return false;
    }
  }

  /**
   * Send email via SendGrid
   */
  private async sendViaSendGrid(options: EmailOptions): Promise<boolean> {
    try {
      const msg = {
        to: options.to,
        from: options.from || config.sendgridFromEmail,
        replyTo: options.replyTo,
        subject: options.subject,
        text: options.text || this.stripHtml(options.html),
        html: options.html,
      };

      await sgMail.send(msg);
      console.log(`✅ Email sent via SendGrid to ${options.to}`);
      return true;
    } catch (error: any) {
      console.error("SendGrid error:", error.response?.body || error);
      return false;
    }
  }

  /**
   * Send email via Mailgun
   */
  private async sendViaMailgun(options: EmailOptions): Promise<boolean> {
    try {
      const messageData = {
        from: options.from || config.mailgunFromEmail,
        to: options.to,
        subject: options.subject,
        text: options.text || this.stripHtml(options.html),
        html: options.html,
        "h:Reply-To": options.replyTo,
      };

      await this.mailgunClient.messages.create(config.mailgunDomain, messageData);
      console.log(`✅ Email sent via Mailgun to ${options.to}`);
      return true;
    } catch (error) {
      console.error("Mailgun error:", error);
      return false;
    }
  }

  /**
   * Send email via SMTP with retry logic for transient errors
   */
  private async sendViaSMTP(options: EmailOptions, retries = 2): Promise<boolean> {
    try {
      const smtpFromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
      const smtpFromName = process.env.SMTP_FROM_NAME || 'DOAPP';
      const smtpFrom = `"${smtpFromName}" <${smtpFromEmail}>`;

      const mailOptions = {
        from: options.from || smtpFrom,
        to: options.to,
        subject: options.subject,
        text: options.text || this.stripHtml(options.html),
        html: options.html,
        replyTo: options.replyTo,
      };

      const info = await this.smtpTransporter.sendMail(mailOptions);
      console.log(`✅ Email sent via SMTP to ${options.to}`);
      console.log(`📧 Message ID: ${info.messageId}`);
      return true;
    } catch (error: any) {
      const errorMessage = error.message || String(error);

      // Check if it's a transient DNS/network error
      const isTransientError =
        errorMessage.includes('EDNS') ||
        errorMessage.includes('queryA') ||
        errorMessage.includes('getaddrinfo') ||
        errorMessage.includes('ETIMEDOUT') ||
        errorMessage.includes('ECONNRESET') ||
        errorMessage.includes('ENOTFOUND');

      if (isTransientError && retries > 0) {
        console.warn(`⚠️  SMTP transient error, retrying in 2s... (${retries} retries left)`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        return this.sendViaSMTP(options, retries - 1);
      }

      // Log different error types appropriately
      if (isTransientError) {
        console.warn(`⚠️  SMTP DNS/Network error (email not sent to ${options.to}):`, errorMessage);
        console.warn("   This is likely a temporary network issue. Email will be retried on next action.");
      } else {
        console.error("❌ SMTP error:", errorMessage);
      }
      return false;
    }
  }

  /**
   * Send email to user by ID (respects user preferences)
   */
  async sendToUser(
    userId: string,
    subject: string,
    html: string,
    text?: string
  ): Promise<boolean> {
    try {
      const user = await User.findByPk(userId);

      if (!user) {
        console.error(`User ${userId} not found`);
        return false;
      }

      // Check if user has email notifications enabled
      if (!user.notificationPreferences?.email) {
        console.log(`User ${userId} has email notifications disabled`);
        return false;
      }

      return await this.sendEmail({
        to: user.email,
        subject,
        html,
        text,
      });
    } catch (error) {
      console.error("Error sending email to user:", error);
      return false;
    }
  }

  /**
   * Send welcome email
   */
  async sendWelcomeEmail(userId: string, userName: string): Promise<void> {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>¡Bienvenido a DoApp!</h1>
            </div>
            <div class="content">
              <p>Hola ${userName},</p>
              <p>¡Gracias por unirte a DoApp! Estamos emocionados de tenerte en nuestra comunidad.</p>
              <p>DoApp es la plataforma donde puedes encontrar trabajos o contratar profesionales de confianza para tus proyectos.</p>
              <h3>Primeros pasos:</h3>
              <ul>
                <li>Completa tu perfil para destacar</li>
                <li>Explora trabajos disponibles</li>
                <li>Publica tu primer trabajo o postúlate a uno</li>
              </ul>
              <a href="${config.clientUrl}/profile" class="button">Completar mi perfil</a>
              <p>Si tienes alguna pregunta, no dudes en contactarnos.</p>
              <p>¡Bienvenido a bordo!</p>
              <p>El equipo de DoApp</p>
            </div>
            <div class="footer">
              <p>© 2025 DoApp. Todos los derechos reservados.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    await this.sendToUser(userId, "¡Bienvenido a DoApp!", html);
  }

  /**
   * Send email verification
   */
  async sendVerificationEmail(
    email: string,
    userName: string,
    verificationToken: string
  ): Promise<boolean> {
    const verificationUrl = `${config.clientUrl}/verify-email?token=${verificationToken}`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Verifica tu email</h1>
            </div>
            <div class="content">
              <p>Hola ${userName},</p>
              <p>Gracias por registrarte en DoApp. Para completar tu registro, por favor verifica tu dirección de email.</p>
              <a href="${verificationUrl}" class="button">Verificar mi email</a>
              <p>O copia y pega este enlace en tu navegador:</p>
              <p style="word-break: break-all; color: #667eea;">${verificationUrl}</p>
              <p>Este enlace expirará en 24 horas.</p>
              <p>Si no creaste esta cuenta, puedes ignorar este email.</p>
            </div>
            <div class="footer">
              <p>© 2025 DoApp. Todos los derechos reservados.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    return await this.sendEmail({
      to: email,
      subject: "Verifica tu email - DoApp",
      html,
    });
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(
    email: string,
    userName: string,
    resetToken: string
  ): Promise<boolean> {
    const resetUrl = `${config.clientUrl}/reset-password?token=${resetToken}`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              background-color: #f5f5f5;
              margin: 0;
              padding: 0;
            }
            .email-wrapper {
              max-width: 600px;
              margin: 40px auto;
              background-color: white;
              border-radius: 12px;
              overflow: hidden;
              box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }
            .logo-section {
              text-align: center;
              padding: 40px 20px 20px;
              background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);
            }
            .logo {
              font-size: 48px;
              font-weight: bold;
              color: white;
              margin: 0;
              letter-spacing: -1px;
            }
            .subtitle {
              text-align: center;
              font-size: 24px;
              font-weight: 600;
              color: #0ea5e9;
              margin: 30px 0 20px;
              padding: 0 20px;
            }
            .content {
              padding: 30px 40px;
              text-align: center;
            }
            .greeting {
              font-size: 16px;
              color: #475569;
              margin-bottom: 20px;
            }
            .message {
              font-size: 15px;
              color: #64748b;
              margin-bottom: 30px;
              line-height: 1.8;
            }
            .button {
              display: inline-block;
              padding: 14px 40px;
              background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);
              color: white !important;
              text-decoration: none;
              border-radius: 8px;
              margin: 20px 0;
              font-weight: 600;
              font-size: 16px;
              box-shadow: 0 4px 12px rgba(14, 165, 233, 0.3);
              transition: transform 0.2s;
            }
            .button:hover {
              transform: translateY(-2px);
            }
            .link-section {
              margin: 30px 0;
              padding: 20px;
              background: #f8fafc;
              border-radius: 8px;
              border: 1px solid #e2e8f0;
            }
            .link-label {
              font-size: 13px;
              color: #64748b;
              margin-bottom: 10px;
            }
            .reset-link {
              word-break: break-all;
              color: #0ea5e9;
              font-size: 13px;
              text-decoration: none;
            }
            .warning {
              background: #fef3c7;
              border: 1px solid #fbbf24;
              border-left: 4px solid #f59e0b;
              padding: 16px;
              margin: 25px 0;
              border-radius: 8px;
              text-align: left;
            }
            .warning-title {
              font-weight: 600;
              color: #92400e;
              margin-bottom: 5px;
            }
            .warning-text {
              color: #78350f;
              font-size: 14px;
            }
            .security-note {
              font-size: 14px;
              color: #64748b;
              margin-top: 25px;
              padding-top: 20px;
              border-top: 1px solid #e2e8f0;
            }
            .footer {
              text-align: center;
              padding: 30px 20px;
              background: #f8fafc;
              color: #94a3b8;
              font-size: 13px;
              border-top: 1px solid #e2e8f0;
            }
          </style>
        </head>
        <body>
          <div class="email-wrapper">
            <div class="logo-section">
              <h1 class="logo">Doers</h1>
            </div>

            <h2 class="subtitle">Restablecer Contraseña</h2>

            <div class="content">
              <p class="greeting">Hola <strong>${userName}</strong>,</p>

              <p class="message">
                Recibimos una solicitud para restablecer la contraseña de tu cuenta en Doers.
                Si fuiste tú, haz clic en el botón de abajo para crear una nueva contraseña.
              </p>

              <a href="${resetUrl}" class="button">Restablecer mi contraseña</a>

              <div class="link-section">
                <p class="link-label">O copia y pega este enlace en tu navegador:</p>
                <a href="${resetUrl}" class="reset-link">${resetUrl}</a>
              </div>

              <div class="warning">
                <div class="warning-title">⚠️ Importante</div>
                <div class="warning-text">
                  Este enlace expirará en <strong>24 horas</strong> por razones de seguridad.
                </div>
              </div>

              <p class="security-note">
                Si no solicitaste restablecer tu contraseña, puedes ignorar este email de forma segura.
                Tu contraseña permanecerá sin cambios.
              </p>
            </div>

            <div class="footer">
              <p>© 2025 Doers. Todos los derechos reservados.</p>
              <p style="margin-top: 10px;">La plataforma segura para contratar y trabajar</p>
            </div>
          </div>
        </body>
      </html>
    `;

    return await this.sendEmail({
      to: email,
      subject: "Restablecer contraseña - DoApp",
      html,
    });
  }

  /**
   * Send password changed confirmation email
   */
  async sendPasswordChangedEmail(
    email: string,
    userName: string
  ): Promise<boolean> {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
            .warning { background: #fee2e2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✅ Contraseña actualizada</h1>
            </div>
            <div class="content">
              <p>Hola ${userName},</p>
              <p>Tu contraseña de DoApp ha sido actualizada correctamente.</p>
              <div class="warning">
                <strong>⚠️ ¿No fuiste tú?</strong><br>
                Si no realizaste este cambio, por favor contacta con nuestro soporte inmediatamente.
              </div>
              <a href="${config.clientUrl}/support" class="button">Contactar soporte</a>
              <p>Por seguridad, todas tus sesiones activas han sido cerradas. Deberás iniciar sesión nuevamente con tu nueva contraseña.</p>
              <p>Gracias por mantener tu cuenta segura.</p>
              <p>El equipo de DoApp</p>
            </div>
            <div class="footer">
              <p>© 2025 DoApp. Todos los derechos reservados.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    return await this.sendEmail({
      to: email,
      subject: "Tu contraseña ha sido actualizada - DoApp",
      html,
    });
  }

  /**
   * Send new message notification
   */
  async sendNewMessageNotification(
    userId: string,
    senderName: string,
    messagePreview: string,
    conversationId: string
  ): Promise<void> {
    const user = await User.findByPk(userId);
    if (!user?.notificationPreferences?.newMessage) {
      return;
    }

    const conversationUrl = `${config.clientUrl}/chat/${conversationId}`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .message-box { background: white; border-left: 4px solid #667eea; padding: 15px; margin: 20px 0; }
            .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>💬 Nuevo mensaje</h2>
            </div>
            <div class="content">
              <p>Hola,</p>
              <p><strong>${senderName}</strong> te ha enviado un mensaje:</p>
              <div class="message-box">
                <p>${messagePreview}</p>
              </div>
              <a href="${conversationUrl}" class="button">Ver conversación</a>
            </div>
          </div>
        </body>
      </html>
    `;

    await this.sendToUser(userId, `Nuevo mensaje de ${senderName}`, html);
  }

  /**
   * Send job update notification
   */
  async sendJobUpdateNotification(
    userId: string,
    jobTitle: string,
    updateType: string,
    jobId: string
  ): Promise<void> {
    const user = await User.findByPk(userId);
    if (!user?.notificationPreferences?.jobUpdate) {
      return;
    }

    const jobUrl = `${config.clientUrl}/jobs/${jobId}`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>📋 Actualización de trabajo</h2>
            </div>
            <div class="content">
              <p>Hola,</p>
              <p><strong>${updateType}</strong></p>
              <p>Trabajo: ${jobTitle}</p>
              <a href="${jobUrl}" class="button">Ver detalles</a>
            </div>
          </div>
        </body>
      </html>
    `;

    await this.sendToUser(userId, `Actualización: ${jobTitle}`, html);
  }

  /**
   * Send contract update notification
   */
  async sendContractUpdateNotification(
    userId: string,
    contractTitle: string,
    updateType: string,
    contractId: string
  ): Promise<void> {
    const user = await User.findByPk(userId);
    if (!user?.notificationPreferences?.contractUpdate) {
      return;
    }

    const contractUrl = `${config.clientUrl}/contracts/${contractId}`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>📄 Actualización de contrato</h2>
            </div>
            <div class="content">
              <p>Hola,</p>
              <p><strong>${updateType}</strong></p>
              <p>Contrato: ${contractTitle}</p>
              <a href="${contractUrl}" class="button">Ver contrato</a>
            </div>
          </div>
        </body>
      </html>
    `;

    await this.sendToUser(userId, `Contrato actualizado: ${contractTitle}`, html);
  }

  /**
   * Send payment notification
   */
  async sendPaymentNotification(
    userId: string,
    amount: number,
    updateType: string,
    paymentId: string
  ): Promise<void> {
    const user = await User.findByPk(userId);
    if (!user?.notificationPreferences?.paymentUpdate) {
      return;
    }

    const paymentUrl = `${config.clientUrl}/payments/${paymentId}`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .amount { font-size: 36px; color: #10b981; font-weight: bold; text-align: center; margin: 20px 0; }
            .button { display: inline-block; padding: 12px 30px; background: #10b981; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>💰 Actualización de pago</h2>
            </div>
            <div class="content">
              <p>Hola,</p>
              <p><strong>${updateType}</strong></p>
              <div class="amount">$${numericAmount.toFixed(2)}</div>
              <a href="${paymentUrl}" class="button">Ver detalles del pago</a>
            </div>
          </div>
        </body>
      </html>
    `;

    await this.sendToUser(userId, `Pago de $${numericAmount.toFixed(2)}`, html);
  }

  /**
   * Send contract created notification (Argentina)
   */
  async sendContractCreatedEmail(
    clientId: string,
    doerId: string,
    contractId: string,
    jobTitle: string,
    price: number,
    currency: string = "ARS"
  ): Promise<void> {
    const contractUrl = `${config.clientUrl}/contracts/${contractId}`;

    const htmlClient = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; padding: 12px 30px; background: #10b981; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .amount { font-size: 28px; color: #10b981; font-weight: bold; margin: 15px 0; }
            .info-box { background: white; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✅ Contrato Creado</h1>
            </div>
            <div class="content">
              <p>Hola,</p>
              <p>Has creado un nuevo contrato exitosamente.</p>
              <div class="info-box">
                <p><strong>Trabajo:</strong> ${jobTitle}</p>
                <p class="amount">${currency} $${price.toFixed(2)}</p>
              </div>
              <p><strong>Próximos pasos:</strong></p>
              <ul>
                <li>El doer debe aceptar el contrato</li>
                <li>Deberás realizar el pago que se mantendrá en escrow</li>
                <li>Una vez completado el trabajo, ambas partes deberán confirmar</li>
              </ul>
              <a href="${contractUrl}" class="button">Ver Contrato</a>
            </div>
          </div>
        </body>
      </html>
    `;

    const htmlDoer = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .amount { font-size: 28px; color: #667eea; font-weight: bold; margin: 15px 0; }
            .info-box { background: white; border-left: 4px solid #667eea; padding: 15px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎉 Nuevo Contrato</h1>
            </div>
            <div class="content">
              <p>Hola,</p>
              <p>Has recibido un nuevo contrato de trabajo.</p>
              <div class="info-box">
                <p><strong>Trabajo:</strong> ${jobTitle}</p>
                <p class="amount">${currency} $${price.toFixed(2)}</p>
              </div>
              <p><strong>¿Qué sigue?</strong></p>
              <ul>
                <li>Revisa los detalles del contrato</li>
                <li>Acepta el contrato si estás de acuerdo</li>
                <li>El pago se mantendrá en escrow hasta completar el trabajo</li>
              </ul>
              <a href="${contractUrl}" class="button">Revisar y Aceptar</a>
            </div>
          </div>
        </body>
      </html>
    `;

    await Promise.all([
      this.sendToUser(clientId, `Contrato creado: ${jobTitle}`, htmlClient),
      this.sendToUser(doerId, `Nuevo contrato: ${jobTitle}`, htmlDoer),
    ]);
  }

  /**
   * Send contract accepted notification (Argentina)
   */
  async sendContractAcceptedEmail(
    clientId: string,
    doerId: string,
    contractId: string,
    jobTitle: string
  ): Promise<void> {
    const contractUrl = `${config.clientUrl}/contracts/${contractId}`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; padding: 12px 30px; background: #10b981; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .info-box { background: white; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✅ Contrato Aceptado</h1>
            </div>
            <div class="content">
              <p>Hola,</p>
              <p>El contrato ha sido aceptado por el doer.</p>
              <div class="info-box">
                <p><strong>Trabajo:</strong> ${jobTitle}</p>
              </div>
              <p><strong>Próximo paso:</strong></p>
              <p>Realiza el pago para que el doer pueda comenzar a trabajar. El pago se mantendrá en escrow hasta que ambas partes confirmen la finalización del trabajo.</p>
              <a href="${contractUrl}" class="button">Realizar Pago</a>
            </div>
          </div>
        </body>
      </html>
    `;

    await this.sendToUser(clientId, `Contrato aceptado: ${jobTitle}`, html);
  }

  /**
   * Send payment in escrow notification (Argentina)
   */
  async sendPaymentEscrowEmail(
    clientId: string,
    doerId: string,
    contractId: string,
    jobTitle: string,
    amount: number,
    currency: string = "ARS"
  ): Promise<void> {
    const contractUrl = `${config.clientUrl}/contracts/${contractId}`;

    const htmlClient = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .amount { font-size: 32px; color: #10b981; font-weight: bold; text-align: center; margin: 20px 0; }
            .info-box { background: #ecfdf5; border: 1px solid #10b981; padding: 20px; margin: 20px 0; border-radius: 8px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔒 Pago en Escrow</h1>
            </div>
            <div class="content">
              <p>Hola,</p>
              <p>Tu pago ha sido recibido y se encuentra en escrow (custodia segura).</p>
              <div class="amount">${currency} $${numericAmount.toFixed(2)}</div>
              <div class="info-box">
                <p><strong>Trabajo:</strong> ${jobTitle}</p>
                <p><strong>¿Qué es el escrow?</strong></p>
                <p>Tu dinero está protegido y solo se liberará cuando ambas partes (tú y el doer) confirmen que el trabajo fue completado satisfactoriamente.</p>
              </div>
              <p>El doer ya puede comenzar a trabajar. Una vez finalizado, ambos deberán confirmar la entrega del servicio.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const htmlDoer = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .amount { font-size: 32px; color: #667eea; font-weight: bold; text-align: center; margin: 20px 0; }
            .info-box { background: #ede9fe; border: 1px solid #667eea; padding: 20px; margin: 20px 0; border-radius: 8px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🚀 Puedes Comenzar</h1>
            </div>
            <div class="content">
              <p>Hola,</p>
              <p>¡Buenas noticias! El pago está asegurado y ya puedes comenzar a trabajar.</p>
              <div class="amount">${currency} $${numericAmount.toFixed(2)}</div>
              <div class="info-box">
                <p><strong>Trabajo:</strong> ${jobTitle}</p>
                <p><strong>Pago protegido:</strong></p>
                <p>El dinero está en escrow y se te liberará cuando ambas partes confirmen que completaste el trabajo satisfactoriamente.</p>
              </div>
              <a href="${contractUrl}" class="button">Ver Detalles del Contrato</a>
            </div>
          </div>
        </body>
      </html>
    `;

    await Promise.all([
      this.sendToUser(clientId, `Pago en escrow: ${jobTitle}`, htmlClient),
      this.sendToUser(doerId, `Pago asegurado: ${jobTitle}`, htmlDoer),
    ]);
  }

  /**
   * Send contract awaiting confirmation notification (Argentina)
   */
  async sendContractAwaitingConfirmationEmail(
    userId: string,
    otherPartyName: string,
    contractId: string,
    jobTitle: string,
    isClient: boolean
  ): Promise<void> {
    const contractUrl = `${config.clientUrl}/contracts/${contractId}`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; padding: 12px 30px; background: #f59e0b; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .info-box { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>⏳ Confirmación Pendiente</h1>
            </div>
            <div class="content">
              <p>Hola,</p>
              <p><strong>${otherPartyName}</strong> ha confirmado que el trabajo está completo.</p>
              <div class="info-box">
                <p><strong>Trabajo:</strong> ${jobTitle}</p>
                <p>${isClient ? '¿El trabajo fue completado satisfactoriamente?' : '¿Confirmaste que entregaste el trabajo?'}</p>
              </div>
              <p><strong>Acción requerida:</strong></p>
              <p>Por favor, revisa el trabajo y confirma si está completado. Una vez que ambos confirmen, ${isClient ? 'el pago será liberado al doer' : 'recibirás tu pago'}.</p>
              <p>Si hay algún problema, puedes abrir una disputa.</p>
              <a href="${contractUrl}" class="button">Revisar y Confirmar</a>
            </div>
          </div>
        </body>
      </html>
    `;

    await this.sendToUser(userId, `Confirmación requerida: ${jobTitle}`, html);
  }

  /**
   * Send contract completed notification (Argentina)
   */
  async sendContractCompletedEmail(
    clientId: string,
    doerId: string,
    contractId: string,
    jobTitle: string,
    amount: number | string,
    currency: string = "ARS"
  ): Promise<void> {
    // Ensure amount is a number
    const numericAmount = typeof amount === 'string' ? parseFloat(amount) : (amount || 0);
    const contractUrl = `${config.clientUrl}/contracts/${contractId}`;

    const htmlClient = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; padding: 12px 30px; background: #10b981; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .success-box { background: #ecfdf5; border: 1px solid #10b981; padding: 20px; margin: 20px 0; border-radius: 8px; text-align: center; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎉 Contrato Completado</h1>
            </div>
            <div class="content">
              <p>Hola,</p>
              <p>¡Felicidades! El contrato ha sido completado exitosamente.</p>
              <div class="success-box">
                <h3 style="color: #10b981; margin-top: 0;">✅ ${jobTitle}</h3>
                <p>El pago de <strong>${currency} $${numericAmount.toFixed(2)}</strong> ha sido liberado al doer.</p>
              </div>
              <p><strong>¿Qué sigue?</strong></p>
              <p>Deja una reseña para ayudar a otros usuarios a conocer tu experiencia trabajando con este doer.</p>
              <a href="${contractUrl}" class="button">Dejar Reseña</a>
            </div>
          </div>
        </body>
      </html>
    `;

    const htmlDoer = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; padding: 12px 30px; background: #10b981; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .amount { font-size: 36px; color: #10b981; font-weight: bold; text-align: center; margin: 20px 0; }
            .success-box { background: #ecfdf5; border: 1px solid #10b981; padding: 20px; margin: 20px 0; border-radius: 8px; text-align: center; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>💰 Pago Recibido</h1>
            </div>
            <div class="content">
              <p>Hola,</p>
              <p>¡Excelente trabajo! El pago ha sido liberado.</p>
              <div class="success-box">
                <h3 style="color: #10b981; margin-top: 0;">✅ ${jobTitle}</h3>
                <div class="amount">${currency} $${numericAmount.toFixed(2)}</div>
                <p>El dinero ha sido transferido a tu cuenta.</p>
              </div>
              <p>Invita al cliente a dejar una reseña para aumentar tu reputación en la plataforma.</p>
              <a href="${contractUrl}" class="button">Ver Detalles</a>
            </div>
          </div>
        </body>
      </html>
    `;

    await Promise.all([
      this.sendToUser(clientId, `Contrato completado: ${jobTitle}`, htmlClient),
      this.sendToUser(doerId, `Pago recibido: ${jobTitle}`, htmlDoer),
    ]);
  }

  /**
   * Send dispute created notification (Argentina)
   */
  async sendDisputeCreatedEmail(
    disputeId: string,
    initiatorId: string,
    respondentId: string,
    contractId: string,
    jobTitle: string,
    reason: string
  ): Promise<void> {
    const disputeUrl = `${config.clientUrl}/disputes/${disputeId}`;
    const contractUrl = `${config.clientUrl}/contracts/${contractId}`;

    const htmlRespondent = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; padding: 12px 30px; background: #ef4444; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .warning-box { background: #fee2e2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>⚠️ Disputa Abierta</h1>
            </div>
            <div class="content">
              <p>Hola,</p>
              <p>Se ha abierto una disputa sobre un contrato.</p>
              <div class="warning-box">
                <p><strong>Trabajo:</strong> ${jobTitle}</p>
                <p><strong>Motivo:</strong> ${reason}</p>
              </div>
              <p><strong>¿Qué significa esto?</strong></p>
              <ul>
                <li>El pago está pausado en escrow</li>
                <li>Un administrador revisará el caso</li>
                <li>Ambas partes pueden aportar evidencia</li>
              </ul>
              <p><strong>Próximos pasos:</strong></p>
              <p>Revisa los detalles de la disputa y proporciona tu versión de los hechos. Puedes adjuntar fotos, videos o documentos como evidencia.</p>
              <a href="${disputeUrl}" class="button">Ver Disputa</a>
            </div>
          </div>
        </body>
      </html>
    `;

    const htmlInitiator = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; padding: 12px 30px; background: #f59e0b; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .info-box { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>📋 Disputa Registrada</h1>
            </div>
            <div class="content">
              <p>Hola,</p>
              <p>Tu disputa ha sido registrada correctamente.</p>
              <div class="info-box">
                <p><strong>Trabajo:</strong> ${jobTitle}</p>
                <p><strong>Motivo:</strong> ${reason}</p>
              </div>
              <p><strong>¿Qué sigue?</strong></p>
              <ul>
                <li>El pago permanecerá en escrow hasta resolver</li>
                <li>Un administrador revisará el caso</li>
                <li>Ambas partes serán contactadas</li>
                <li>Se resolverá en un plazo de 3-5 días hábiles</li>
              </ul>
              <p>Puedes agregar más evidencia (fotos, videos, documentos) para respaldar tu caso.</p>
              <a href="${disputeUrl}" class="button">Ver Mi Disputa</a>
            </div>
          </div>
        </body>
      </html>
    `;

    await Promise.all([
      this.sendToUser(respondentId, `Disputa abierta: ${jobTitle}`, htmlRespondent),
      this.sendToUser(initiatorId, `Disputa registrada: ${jobTitle}`, htmlInitiator),
    ]);
  }

  /**
   * Send dispute resolved notification (Argentina)
   */
  async sendDisputeResolvedEmail(
    disputeId: string,
    clientId: string,
    doerId: string,
    jobTitle: string,
    resolution: string,
    resolutionType: "full_release" | "full_refund" | "partial_refund" | "no_action"
  ): Promise<void> {
    const disputeUrl = `${config.clientUrl}/disputes/${disputeId}`;

    let outcome = "";
    let headerColor = "#10b981";

    switch (resolutionType) {
      case "full_release":
        outcome = "El pago completo ha sido liberado al doer.";
        break;
      case "full_refund":
        outcome = "El pago completo ha sido reembolsado al cliente.";
        break;
      case "partial_refund":
        outcome = "Se ha realizado un reembolso parcial.";
        headerColor = "#f59e0b";
        break;
      case "no_action":
        outcome = "No se realizarán cambios al pago.";
        headerColor = "#6b7280";
        break;
    }

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, ${headerColor} 0%, ${headerColor}dd 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; padding: 12px 30px; background: ${headerColor}; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .resolution-box { background: white; border-left: 4px solid ${headerColor}; padding: 20px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✅ Disputa Resuelta</h1>
            </div>
            <div class="content">
              <p>Hola,</p>
              <p>La disputa ha sido resuelta por nuestro equipo de administración.</p>
              <div class="resolution-box">
                <p><strong>Trabajo:</strong> ${jobTitle}</p>
                <p><strong>Resolución:</strong></p>
                <p>${resolution}</p>
                <p><strong>Resultado:</strong> ${outcome}</p>
              </div>
              <p>Si tienes preguntas sobre esta resolución, puedes contactar a nuestro equipo de soporte.</p>
              <a href="${disputeUrl}" class="button">Ver Detalles</a>
            </div>
          </div>
        </body>
      </html>
    `;

    await Promise.all([
      this.sendToUser(clientId, `Disputa resuelta: ${jobTitle}`, html),
      this.sendToUser(doerId, `Disputa resuelta: ${jobTitle}`, html),
    ]);
  }

  /**
   * Strip HTML tags from text
   */
  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, "");
  }

  /**
   * Send withdrawal requested notification
   */
  async sendWithdrawalRequested(to: string, userName: string, amount: number): Promise<void> {
    const subject = "Solicitud de Retiro Recibida - Doers";
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #0EA5E9 0%, #0284C7 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; padding: 12px 30px; background: #0EA5E9; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
          .amount { font-size: 32px; font-weight: bold; color: #0EA5E9; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>💰 Solicitud de Retiro Recibida</h1>
          </div>
          <div class="content">
            <p>Hola ${userName},</p>
            <p>Hemos recibido tu solicitud de retiro:</p>
            <div class="amount">$${amount.toLocaleString("es-AR")} ARS</div>
            <p><strong>Estado:</strong> Pendiente de aprobación</p>
            <p><strong>Tiempo estimado:</strong> 24-48 horas hábiles</p>
            <p>Te notificaremos cuando tu retiro sea procesado y transferido a tu cuenta bancaria.</p>
            <a href="${config.clientUrl}/balance" class="button">Ver Mis Retiros</a>
            <p>Si no solicitaste este retiro, contacta a soporte inmediatamente.</p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} Doers. Todos los derechos reservados.</p>
            <p>Este es un correo automático, por favor no respondas.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    await this.sendEmail({ to, subject, html });
  }

  /**
   * Send withdrawal approved notification
   */
  async sendWithdrawalApproved(to: string, userName: string, amount: number): Promise<void> {
    const subject = "Retiro Aprobado - Doers";
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #10B981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; padding: 12px 30px; background: #10B981; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
          .amount { font-size: 32px; font-weight: bold; color: #10B981; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ Retiro Aprobado</h1>
          </div>
          <div class="content">
            <p>Hola ${userName},</p>
            <p>¡Buenas noticias! Tu solicitud de retiro ha sido aprobada:</p>
            <div class="amount">$${amount.toLocaleString("es-AR")} ARS</div>
            <p><strong>Estado:</strong> Aprobado - En proceso de transferencia</p>
            <p>Estamos procesando tu retiro y será transferido a tu cuenta bancaria en las próximas horas.</p>
            <a href="${config.clientUrl}/balance" class="button">Ver Estado</a>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} Doers. Todos los derechos reservados.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    await this.sendEmail({ to, subject, html });
  }

  /**
   * Send withdrawal completed notification
   */
  async sendWithdrawalCompleted(to: string, userName: string, amount: number, newBalance: number): Promise<void> {
    const subject = "Retiro Completado - Doers";
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #10B981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; padding: 12px 30px; background: #10B981; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
          .amount { font-size: 32px; font-weight: bold; color: #10B981; margin: 20px 0; }
          .balance { background: #e0f2fe; padding: 15px; border-radius: 8px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✨ Retiro Completado</h1>
          </div>
          <div class="content">
            <p>Hola ${userName},</p>
            <p>¡Tu retiro ha sido completado exitosamente!</p>
            <div class="amount">$${amount.toLocaleString("es-AR")} ARS</div>
            <p><strong>Estado:</strong> Transferido</p>
            <p>El dinero ha sido transferido a tu cuenta bancaria. Puede tardar de 24 a 72 horas en reflejarse según tu banco.</p>
            <div class="balance">
              <p><strong>Tu nuevo saldo disponible:</strong></p>
              <p style="font-size: 24px; font-weight: bold; color: #0EA5E9;">$${newBalance.toLocaleString("es-AR")} ARS</p>
            </div>
            <a href="${config.clientUrl}/balance" class="button">Ver Historial</a>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} Doers. Todos los derechos reservados.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    await this.sendEmail({ to, subject, html });
  }

  /**
   * Send withdrawal rejected notification
   */
  async sendWithdrawalRejected(to: string, userName: string, amount: number, reason: string): Promise<void> {
    const subject = "Solicitud de Retiro Rechazada - Doers";
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #EF4444 0%, #DC2626 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; padding: 12px 30px; background: #0EA5E9; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
          .reason { background: #fee2e2; padding: 15px; border-left: 4px solid #EF4444; border-radius: 4px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>❌ Solicitud Rechazada</h1>
          </div>
          <div class="content">
            <p>Hola ${userName},</p>
            <p>Lamentamos informarte que tu solicitud de retiro por <strong>$${amount.toLocaleString("es-AR")} ARS</strong> ha sido rechazada.</p>
            <div class="reason">
              <p><strong>Motivo:</strong></p>
              <p>${reason}</p>
            </div>
            <p>Tu saldo no ha sido afectado y permanece disponible en tu cuenta.</p>
            <p>Si tienes preguntas, por favor contacta a nuestro equipo de soporte.</p>
            <a href="${config.clientUrl}/contact?subject=withdrawal" class="button">Contactar Soporte</a>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} Doers. Todos los derechos reservados.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    await this.sendEmail({ to, subject, html });
  }

  /**
   * Send price modification notification
   */
  async sendPriceModificationEmail(to: string, userName: string, contractId: string, previousPrice: number, newPrice: number, isIncrease: boolean, balanceChange: number): Promise<void> {
    const subject = isIncrease ? "Precio de Contrato Aumentado - Doers" : "Precio de Contrato Reducido - Doers";
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #0EA5E9 0%, #0284C7 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; padding: 12px 30px; background: #0EA5E9; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
          .price-change { background: ${isIncrease ? '#fee2e2' : '#d1fae5'}; padding: 20px; border-radius: 8px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>💰 Precio de Contrato Modificado</h1>
          </div>
          <div class="content">
            <p>Hola ${userName},</p>
            <p>El precio de tu contrato ha sido modificado:</p>
            <div class="price-change">
              <p><strong>Precio anterior:</strong> $${previousPrice.toLocaleString("es-AR")} ARS</p>
              <p><strong>Nuevo precio:</strong> $${newPrice.toLocaleString("es-AR")} ARS</p>
              <p><strong>Diferencia:</strong> ${isIncrease ? '+' : '-'}$${Math.abs(balanceChange).toLocaleString("es-AR")} ARS</p>
            </div>
            <p>${isIncrease
              ? `Se ha descontado $${Math.abs(balanceChange).toLocaleString("es-AR")} de tu saldo disponible.`
              : `Se ha acreditado $${Math.abs(balanceChange).toLocaleString("es-AR")} a tu saldo disponible.`
            }</p>
            <a href="${config.clientUrl}/contracts/${contractId}" class="button">Ver Contrato</a>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} Doers. Todos los derechos reservados.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    await this.sendEmail({ to, subject, html });
  }

  /**
   * Send balance refund notification
   */
  async sendBalanceRefundEmail(to: string, userName: string, amount: number, reason: string, newBalance: number): Promise<void> {
    const subject = "Reembolso Acreditado - Doers";
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #10B981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; padding: 12px 30px; background: #10B981; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
          .amount { font-size: 32px; font-weight: bold; color: #10B981; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>💵 Reembolso Acreditado</h1>
          </div>
          <div class="content">
            <p>Hola ${userName},</p>
            <p>Se ha acreditado un reembolso a tu saldo:</p>
            <div class="amount">+$${amount.toLocaleString("es-AR")} ARS</div>
            <p><strong>Motivo:</strong> ${reason}</p>
            <p><strong>Tu nuevo saldo:</strong> $${newBalance.toLocaleString("es-AR")} ARS</p>
            <p>Puedes usar este saldo para futuros contratos en la plataforma.</p>
            <a href="${config.clientUrl}/balance" class="button">Ver Mi Saldo</a>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} Doers. Todos los derechos reservados.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    await this.sendEmail({ to, subject, html });
  }

  /**
   * Send job completion confirmation reminder
   */
  async sendConfirmationReminder(to: string, userName: string, jobTitle: string, contractId: string, isClient: boolean): Promise<void> {
    const subject = "Recordatorio: Confirma que el trabajo fue completado - Doers";
    const contractUrl = `${config.clientUrl}/contracts/${contractId}`;
    const roleText = isClient ? "el trabajador" : "el cliente";
    const actionText = isClient
      ? "Confirma que el trabajo fue realizado correctamente para que el trabajador reciba su pago."
      : "Confirma que entregaste el trabajo correctamente para recibir tu pago.";

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #10B981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; padding: 14px 35px; background: linear-gradient(135deg, #10B981 0%, #059669 100%); color: white; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: bold; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
          .job-box { background: white; border-left: 4px solid #10B981; padding: 20px; margin: 20px 0; border-radius: 8px; }
          .emoji { font-size: 48px; margin-bottom: 10px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="emoji">✅</div>
            <h1>¡El trabajo ha terminado!</h1>
          </div>
          <div class="content">
            <p>Hola ${userName},</p>
            <p>El trabajo ha llegado a su fecha de finalización y necesita tu confirmación.</p>
            <div class="job-box">
              <h3 style="margin-top: 0; color: #059669;">${jobTitle}</h3>
              <p>${actionText}</p>
            </div>
            <p>Una vez que tanto tú como ${roleText} confirmen, el proceso de pago se completará automáticamente.</p>
            <center>
              <a href="${contractUrl}" class="button">Confirmar trabajo</a>
            </center>
            <p style="color: #666; font-size: 14px; margin-top: 20px;">
              Si tienes algún problema con el trabajo realizado, puedes abrir una disputa desde la página del contrato.
            </p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} Doers. Todos los derechos reservados.</p>
            <p>Este es un correo automático, por favor no respondas.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    await this.sendEmail({ to, subject, html });
  }

  /**
   * Send banking info required email when a worker completes a job but has no banking data
   */
  async sendBankingInfoRequiredEmail(userId: string, contractId: string, amount: number): Promise<void> {
    try {
      const user = await User.findByPk(userId);
      if (!user?.email) return;

      const settingsUrl = `${config.clientUrl}/settings?tab=banking`;
      const contractUrl = `${config.clientUrl}/contracts/${contractId}`;

      const subject = "⚠️ Datos bancarios requeridos para recibir tu pago - Doers";
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; padding: 14px 35px; background: linear-gradient(135deg, #0EA5E9 0%, #0284C7 100%); color: white; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: bold; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
            .amount { font-size: 32px; font-weight: bold; color: #10B981; margin: 20px 0; }
            .warning-box { background: #FEF3C7; border-left: 4px solid #F59E0B; padding: 20px; margin: 20px 0; border-radius: 8px; }
            .emoji { font-size: 48px; margin-bottom: 10px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="emoji">💳</div>
              <h1>Datos Bancarios Requeridos</h1>
            </div>
            <div class="content">
              <p>Hola ${user.name},</p>
              <p>¡Felicitaciones! Tu trabajo ha sido completado exitosamente. Tienes un pago pendiente de:</p>
              <div class="amount">$${amount.toLocaleString("es-AR")} ARS</div>
              <div class="warning-box">
                <strong>⚠️ Acción requerida:</strong>
                <p style="margin-bottom: 0;">Para poder transferirte el dinero, necesitamos que completes tus datos bancarios (CBU/CVU) en la configuración de tu perfil.</p>
              </div>
              <p>¿Qué necesitamos?</p>
              <ul>
                <li><strong>CBU o CVU:</strong> 22 dígitos de tu cuenta bancaria o billetera virtual</li>
                <li><strong>Alias (opcional):</strong> Tu alias bancario para verificación</li>
              </ul>
              <center>
                <a href="${settingsUrl}" class="button">Completar Datos Bancarios</a>
              </center>
              <p style="color: #666; font-size: 14px; margin-top: 20px;">
                Una vez que completes tus datos, nuestro equipo procesará tu pago lo antes posible.
              </p>
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} Doers. Todos los derechos reservados.</p>
              <p>Este es un correo automático, por favor no respondas.</p>
            </div>
          </div>
        </body>
        </html>
      `;

      await this.sendEmail({ to: user.email, subject, html });
      console.log(`📧 Banking info required email sent to ${user.email}`);
    } catch (error) {
      console.error('Error sending banking info required email:', error);
    }
  }

  /**
   * Send ticket created notification
   */
  async sendTicketCreatedEmail(
    ticketId: string,
    ticketNumber: string,
    subject: string,
    userEmail: string,
    userName: string
  ): Promise<void> {
    try {
      const ticketUrl = `${config.clientUrl}/tickets/${ticketId}`;

      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
              .button { display: inline-block; padding: 12px 30px; background: #0ea5e9; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
              .info-box { background: #e0f2fe; border-left: 4px solid #0ea5e9; padding: 15px; margin: 20px 0; }
              .ticket-number { font-size: 24px; font-weight: bold; color: #0284c7; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>🎫 Ticket de Soporte Creado</h1>
              </div>
              <div class="content">
                <p>Hola ${userName},</p>
                <p>Tu ticket de soporte ha sido creado exitosamente.</p>
                <div class="info-box">
                  <p><strong>Número de ticket:</strong> <span class="ticket-number">${ticketNumber}</span></p>
                  <p><strong>Asunto:</strong> ${subject}</p>
                </div>
                <p><strong>¿Qué sigue?</strong></p>
                <ul>
                  <li>Nuestro equipo revisará tu consulta</li>
                  <li>Recibirás una respuesta lo antes posible</li>
                  <li>Puedes agregar más información en cualquier momento</li>
                </ul>
                <p>Te notificaremos por email cuando haya actualizaciones en tu ticket.</p>
                <a href="${ticketUrl}" class="button">Ver Ticket</a>
                <p style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 14px;">
                  Este es un correo automático, por favor no respondas. Para agregar información, usa el enlace de arriba.
                </p>
              </div>
            </div>
          </body>
        </html>
      `;

      await this.sendEmail({
        to: userEmail,
        subject: `Ticket ${ticketNumber} creado - ${subject}`,
        html,
      });

      console.log(`📧 Ticket created email sent to ${userEmail}`);
    } catch (error) {
      console.error('Error sending ticket created email:', error);
    }
  }

  /**
   * Send ticket message notification
   */
  async sendTicketMessageEmail(
    ticketId: string,
    ticketNumber: string,
    subject: string,
    recipientEmail: string,
    recipientName: string,
    senderName: string,
    message: string,
    isAdminReply: boolean
  ): Promise<void> {
    try {
      const ticketUrl = `${config.clientUrl}/tickets/${ticketId}`;

      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
              .button { display: inline-block; padding: 12px 30px; background: #0ea5e9; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
              .message-box { background: white; border-left: 4px solid #0ea5e9; padding: 20px; margin: 20px 0; border-radius: 5px; }
              .admin-badge { display: inline-block; background: #10b981; color: white; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: bold; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>💬 Nuevo Mensaje en tu Ticket</h1>
              </div>
              <div class="content">
                <p>Hola ${recipientName},</p>
                <p>${isAdminReply ? '<span class="admin-badge">SOPORTE</span> ' : ''}${senderName} ha respondido en tu ticket <strong>${ticketNumber}</strong>:</p>
                <div class="message-box">
                  <p><strong>${subject}</strong></p>
                  <p style="margin-top: 15px;">${message.substring(0, 300)}${message.length > 300 ? '...' : ''}</p>
                </div>
                <p>Haz clic en el botón para ver el mensaje completo y responder.</p>
                <a href="${ticketUrl}" class="button">Ver Ticket</a>
                <p style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 14px;">
                  Este es un correo automático, por favor no respondas. Para responder, usa el enlace de arriba.
                </p>
              </div>
            </div>
          </body>
        </html>
      `;

      await this.sendEmail({
        to: recipientEmail,
        subject: `Nuevo mensaje en ticket ${ticketNumber}`,
        html,
      });

      console.log(`📧 Ticket message email sent to ${recipientEmail}`);
    } catch (error) {
      console.error('Error sending ticket message email:', error);
    }
  }

  /**
   * Send dispute message notification
   */
  async sendDisputeMessageEmail(
    disputeId: string,
    recipientEmail: string,
    recipientName: string,
    senderName: string,
    message: string,
    isAdminMessage: boolean
  ): Promise<void> {
    try {
      const disputeUrl = `${config.clientUrl}/disputes/${disputeId}`;

      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
              .button { display: inline-block; padding: 12px 30px; background: #f97316; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
              .message-box { background: white; border-left: 4px solid #f97316; padding: 20px; margin: 20px 0; border-radius: 5px; }
              .admin-badge { display: inline-block; background: #10b981; color: white; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: bold; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>⚠️ Nuevo Mensaje en Disputa</h1>
              </div>
              <div class="content">
                <p>Hola ${recipientName},</p>
                <p>${isAdminMessage ? '<span class="admin-badge">ADMINISTRADOR</span> ' : ''}${senderName} ha enviado un mensaje en la disputa:</p>
                <div class="message-box">
                  <p>${message.substring(0, 300)}${message.length > 300 ? '...' : ''}</p>
                </div>
                <p>Es importante que revises este mensaje y respondas si es necesario para ayudar a resolver la disputa.</p>
                <a href="${disputeUrl}" class="button">Ver Disputa</a>
                <p style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 14px;">
                  Este es un correo automático, por favor no respondas. Para responder, usa el enlace de arriba.
                </p>
              </div>
            </div>
          </body>
        </html>
      `;

      await this.sendEmail({
        to: recipientEmail,
        subject: `Nuevo mensaje en disputa - DoApp`,
        html,
      });

      console.log(`📧 Dispute message email sent to ${recipientEmail}`);
    } catch (error) {
      console.error('Error sending dispute message email:', error);
    }
  }
}

export default new EmailService();
