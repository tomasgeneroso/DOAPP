import sgMail from "@sendgrid/mail";
import formData from "form-data";
import Mailgun from "mailgun.js";
import nodemailer from "nodemailer";
import { config } from "../config/env";
import User from "../models/User";

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
        });
        this.smtpInitialized = true;
        console.log("✅ SMTP initialized with host:", smtpHost);
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
   * Send email via SMTP
   */
  private async sendViaSMTP(options: EmailOptions): Promise<boolean> {
    try {
      const smtpFrom = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;

      const mailOptions = {
        from: options.from || smtpFrom,
        to: options.to,
        subject: options.subject,
        text: options.text || this.stripHtml(options.html),
        html: options.html,
        replyTo: options.replyTo,
      };

      await this.smtpTransporter.sendMail(mailOptions);
      console.log(`✅ Email sent via SMTP to ${options.to}`);
      return true;
    } catch (error) {
      console.error("SMTP error:", error);
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
      const user = await User.findById(userId);

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
    const user = await User.findById(userId);
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
    const user = await User.findById(userId);
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
    const user = await User.findById(userId);
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
    const user = await User.findById(userId);
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
              <div class="amount">$${amount.toFixed(2)}</div>
              <a href="${paymentUrl}" class="button">Ver detalles del pago</a>
            </div>
          </div>
        </body>
      </html>
    `;

    await this.sendToUser(userId, `Pago de $${amount.toFixed(2)}`, html);
  }

  /**
   * Strip HTML tags from text
   */
  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, "");
  }
}

// Export singleton instance
export default new EmailService();
