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

  // ─────────────────────────────────────────────────────────────────────────
  // SHARED TEMPLATE
  // ─────────────────────────────────────────────────────────────────────────

  private tpl(opts: {
    title: string;
    body: string;
    eyebrow?: string;
    cta?: { label: string; url: string };
    accent?: 'sky' | 'green' | 'amber' | 'red' | 'orange';
    amount?: string;
    amountLabel?: string;
  }): string {
    const palette = {
      sky:    { btn: 'linear-gradient(135deg,#0284c7 0%,#2563eb 100%)', pill: '#dbeafe', pillText: '#1d4ed8', amount: '#0ea5e9' },
      green:  { btn: 'linear-gradient(135deg,#16a34a 0%,#15803d 100%)', pill: '#dcfce7', pillText: '#15803d', amount: '#22c55e' },
      amber:  { btn: 'linear-gradient(135deg,#d97706 0%,#b45309 100%)', pill: '#fef3c7', pillText: '#b45309', amount: '#f59e0b' },
      red:    { btn: 'linear-gradient(135deg,#dc2626 0%,#b91c1c 100%)', pill: '#fee2e2', pillText: '#b91c1c', amount: '#ef4444' },
      orange: { btn: 'linear-gradient(135deg,#ea580c 0%,#c2410c 100%)', pill: '#ffedd5', pillText: '#c2410c', amount: '#f97316' },
    };
    const p = palette[opts.accent || 'sky'];
    const year = new Date().getFullYear();
    const base = config.clientUrl || 'https://doapparg.site';

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${opts.title}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f1f5f9;">
    <tr><td style="padding:32px 16px;">
      <table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 32px rgba(0,0,0,0.10);" cellspacing="0" cellpadding="0" border="0">

        <!-- HEADER -->
        <tr><td style="background:linear-gradient(135deg,#0c1a2e 0%,#070d1a 100%);padding:26px 40px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0">
            <tr>
              <td style="vertical-align:middle;">
                <span style="display:inline-block;background:#38bdf8;color:#0c1a2e;font-size:19px;font-weight:900;padding:5px 11px;border-radius:8px;letter-spacing:-0.5px;line-height:1.2;">DO</span>
              </td>
              <td style="vertical-align:middle;padding-left:7px;">
                <span style="color:#ffffff;font-size:19px;font-weight:900;letter-spacing:-0.5px;line-height:1.2;">APP</span>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- GRADIENT BAR -->
        <tr><td style="background:linear-gradient(90deg,#38bdf8 0%,#0ea5e9 50%,#2563eb 100%);height:3px;padding:0;font-size:1px;line-height:1px;">&#8203;</td></tr>

        <!-- EYEBROW + TITLE -->
        <tr><td style="padding:36px 40px 12px;text-align:center;">
          ${opts.eyebrow ? `<div style="margin-bottom:14px;"><span style="display:inline-block;background:${p.pill};color:${p.pillText};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:4px 14px;border-radius:999px;">${opts.eyebrow}</span></div>` : ''}
          <h1 style="margin:0;font-size:28px;font-weight:800;color:#0f172a;line-height:1.25;letter-spacing:-0.5px;">${opts.title}</h1>
        </td></tr>

        <!-- BODY -->
        <tr><td style="padding:8px 40px 32px;">
          <div style="font-size:15.5px;line-height:1.75;color:#334155;">
            ${opts.body}
          </div>

          ${opts.amount ? `
          <div style="text-align:center;margin:28px 0;">
            <p style="margin:0 0 4px;font-size:11.5px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.07em;font-weight:700;">${opts.amountLabel || 'Monto'}</p>
            <p style="margin:0;font-size:40px;font-weight:800;color:${p.amount};letter-spacing:-1.5px;">${opts.amount}</p>
          </div>` : ''}

          ${opts.cta ? `
          <div style="text-align:center;margin:32px 0 10px;">
            <a href="${opts.cta.url}" style="display:inline-block;padding:14px 40px;background:${p.btn};color:#ffffff;text-decoration:none;font-weight:700;font-size:15.5px;border-radius:10px;letter-spacing:0.02em;">${opts.cta.label}</a>
          </div>
          <div style="text-align:center;margin-bottom:8px;">
            <p style="margin:0;font-size:12px;color:#94a3b8;">O copiá este enlace:<br><a href="${opts.cta.url}" style="color:#0ea5e9;word-break:break-all;font-size:11px;">${opts.cta.url}</a></p>
          </div>` : ''}
        </td></tr>

        <!-- FOOTER -->
        <tr><td style="background:#0f172a;padding:28px 40px;text-align:center;border-radius:0 0 16px 16px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin-bottom:16px;">
            <tr>
              <td style="text-align:center;">
                <a href="https://apps.apple.com" style="display:inline-block;margin:0 4px;padding:7px 14px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);border-radius:7px;color:#94a3b8;text-decoration:none;font-size:11.5px;font-weight:600;">&#xf8ff; App Store</a>
                <a href="https://play.google.com" style="display:inline-block;margin:0 4px;padding:7px 14px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);border-radius:7px;color:#94a3b8;text-decoration:none;font-size:11.5px;font-weight:600;">&#9654; Google Play</a>
              </td>
            </tr>
          </table>
          <p style="margin:0 0 10px;">
            <a href="${base}/help" style="color:#64748b;font-size:12px;text-decoration:none;margin:0 8px;">Centro de ayuda</a>
            <span style="color:#334155;">&nbsp;·&nbsp;</span>
            <a href="${base}/legal/privacidad" style="color:#64748b;font-size:12px;text-decoration:none;margin:0 8px;">Privacidad</a>
          </p>
          <p style="margin:0 0 4px;font-size:11px;color:#475569;">© ${year} DOAPP · La plataforma de trabajos argentina</p>
          <p style="margin:0;font-size:11px;color:#334155;">Correo automático — por favor no respondás.</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
  }

  /** Callout box: info | warning | success | danger */
  private callout(type: 'info' | 'warning' | 'success' | 'danger', title: string, content: string): string {
    const s = {
      info:    { bg: '#f0f9ff', border: '#bae6fd', icon: 'ℹ️', titleColor: '#0c4a6e', textColor: '#0c4a6e' },
      warning: { bg: '#fffbeb', border: '#fde68a', icon: '⚠️', titleColor: '#78350f', textColor: '#78350f' },
      success: { bg: '#f0fdf4', border: '#bbf7d0', icon: '✅', titleColor: '#14532d', textColor: '#14532d' },
      danger:  { bg: '#fef2f2', border: '#fecaca', icon: '🚨', titleColor: '#7f1d1d', textColor: '#7f1d1d' },
    }[type];
    return `<table role="presentation" style="width:100%;background:${s.bg};border:1px solid ${s.border};border-radius:10px;margin:20px 0;" cellspacing="0" cellpadding="0" border="0">
      <tr>
        <td style="padding:14px 12px 14px 16px;vertical-align:top;width:28px;font-size:18px;">${s.icon}</td>
        <td style="padding:14px 16px 14px 4px;">
          ${title ? `<p style="margin:0 0 3px;font-size:13.5px;font-weight:700;color:${s.titleColor};">${title}</p>` : ''}
          <div style="font-size:13.5px;line-height:1.6;color:${s.textColor};">${content}</div>
        </td>
      </tr>
    </table>`;
  }

  /** Receipt-style detail card */
  private detailCard(rows: Array<{ label: string; value: string; highlight?: boolean }>): string {
    const rowsHtml = rows.map((r, i) => `
      <tr>
        <td style="padding:11px 0;${i < rows.length - 1 ? 'border-bottom:1px solid #e2e8f0;' : ''}font-size:13.5px;color:#64748b;font-weight:500;">${r.label}</td>
        <td style="padding:11px 0;${i < rows.length - 1 ? 'border-bottom:1px solid #e2e8f0;' : ''}font-size:13.5px;color:${r.highlight ? '#0284c7' : '#0f172a'};font-weight:${r.highlight ? '700' : '600'};text-align:right;">${r.value}</td>
      </tr>`).join('');
    return `<table role="presentation" style="width:100%;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;margin:20px 0;" cellspacing="0" cellpadding="0" border="0">
      <tr><td style="padding:4px 20px;">
        <table role="presentation" style="width:100%;border-collapse:collapse;" cellspacing="0" cellpadding="0" border="0">${rowsHtml}</table>
      </td></tr>
    </table>`;
  }



  // ─────────────────────────────────────────────────────────────────────────
  // TEMPLATES
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Send welcome email
   */
  async sendWelcomeEmail(userId: string, userName: string): Promise<void> {
    const html = this.tpl({
      eyebrow: 'Bienvenida',
      title: `¡Hola, ${userName}!`,
      body: `
        <p>Hola <strong>${userName}</strong>,</p>
        <p>¡Gracias por unirte a DOAPP! Somos la plataforma argentina donde podés encontrar trabajadores de confianza o publicar tu primer trabajo.</p>
        ${this.callout('info', 'Primeros pasos', `
          <ul style="margin:6px 0 0;padding-left:18px;">
            <li>Completá tu perfil para destacar</li>
            <li>Explorá los trabajos disponibles</li>
            <li>Publicá tu primer trabajo o postulate a uno</li>
          </ul>
        `)}
        <p>Si tenés alguna pregunta, nuestro equipo está disponible en el <a href="${config.clientUrl}/help" style="color:#0ea5e9;">Centro de Ayuda</a>.</p>
      `,
      cta: { label: '🚀 Ir a DOAPP', url: `${config.clientUrl}/` },
    });
    await this.sendToUser(userId, '¡Bienvenido a DOAPP!', html);
  }

  /** Admin verified the user's identity (DNI). */
  async sendAccountVerifiedEmail(email: string, userName: string): Promise<boolean> {
    const html = this.tpl({
      eyebrow: 'Verificación',
      accent: 'green',
      title: '¡Tu identidad fue verificada!',
      body: `
        <p>Hola <strong>${userName}</strong>,</p>
        <p>Nuestro equipo verificó tu documento de identidad. Tu cuenta ahora muestra la <strong>insignia de verificación</strong> y podés operar con total normalidad en DOAPP.</p>
        ${this.callout('success', 'Listo', 'Ya podés publicar trabajos, postularte y recibir pagos con tu identidad verificada.')}
      `,
      cta: { label: 'Ir a mi perfil', url: `${config.clientUrl}/profile` },
    });
    return await this.sendEmail({ to: email, subject: 'Tu identidad fue verificada · DOAPP', html });
  }

  /** Admin banned/suspended the account. */
  async sendAccountBannedEmail(email: string, userName: string, reason: string, expiresAt?: Date | null): Promise<boolean> {
    const html = this.tpl({
      eyebrow: 'Cuenta suspendida',
      accent: 'red',
      title: 'Tu cuenta fue suspendida',
      body: `
        <p>Hola <strong>${userName}</strong>,</p>
        <p>Tu cuenta en DOAPP fue suspendida y por el momento no vas a poder acceder a la plataforma.</p>
        ${this.callout('warning', 'Motivo', reason || 'No especificado')}
        ${expiresAt ? `<p>La suspensión vence el <strong>${new Date(expiresAt).toLocaleDateString('es-AR')}</strong>.</p>` : ''}
        <p>Si creés que se trata de un error o querés apelar esta decisión, escribí a nuestro equipo de soporte respondiendo este email o desde el Centro de Ayuda.</p>
      `,
      cta: { label: 'Contactar a soporte', url: `${config.clientUrl}/help` },
    });
    return await this.sendEmail({ to: email, subject: 'Tu cuenta fue suspendida · DOAPP', html });
  }

  /** Admin permanently deleted the account. */
  async sendAccountDeletedEmail(email: string, userName: string, reason?: string): Promise<boolean> {
    const html = this.tpl({
      eyebrow: 'Cuenta eliminada',
      accent: 'red',
      title: 'Tu cuenta fue eliminada',
      body: `
        <p>Hola <strong>${userName}</strong>,</p>
        <p>Tu cuenta en DOAPP fue eliminada permanentemente por incumplimientos de nuestros términos y condiciones.</p>
        ${reason ? this.callout('warning', 'Motivo', reason) : ''}
        <p>Si creés que se trata de un error, podés escribir a nuestro equipo de soporte para revisar el caso.</p>
      `,
      cta: { label: 'Contactar a soporte', url: `${config.clientUrl}/help` },
    });
    return await this.sendEmail({ to: email, subject: 'Tu cuenta fue eliminada · DOAPP', html });
  }

  /**
   * Send email verification.
   * verificationUrl: the full URL including the token query param.
   */
  async sendVerificationEmail(
    email: string,
    userName: string,
    verificationUrl: string   // full URL, e.g. /verify-email?token=xxx
  ): Promise<boolean> {
    const html = this.tpl({
      eyebrow: 'Verificación',
      title: 'Verificá tu email',
      body: `
        <p>Hola <strong>${userName}</strong>,</p>
        <p>Gracias por registrarte en DOAPP. Para activar tu cuenta hacé clic en el botón de abajo.</p>
        ${this.callout('warning', 'Importante', 'Este enlace <strong>expira en 24 horas</strong>. Si no creaste esta cuenta podés ignorar este email.')}
      `,
      cta: { label: '✅ Verificar mi email', url: verificationUrl },
    });
    return await this.sendEmail({ to: email, subject: 'Verificá tu email · DOAPP', html });
  }

  async sendPasswordResetEmail(email: string, userName: string, resetToken: string): Promise<boolean> {
    const url = `${config.clientUrl}/reset-password?token=${resetToken}`;
    const html = this.tpl({
      eyebrow: 'Seguridad',
      accent: 'red',
      title: 'Restablecer contraseña',
      body: `
        <p>Hola <strong>${userName}</strong>,</p>
        <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta en DOAPP.</p>
        ${this.callout('warning', 'Importante', 'Este enlace <strong>expira en 24 horas</strong>. Si no solicitaste el cambio, ignorá este email — tu contraseña no se modificará.')}
      `,
      cta: { label: '🔐 Restablecer mi contraseña', url },
    });
    return await this.sendEmail({ to: email, subject: 'Restablecer contraseña · DOAPP', html });
  }

  async sendPasswordChangedEmail(email: string, userName: string): Promise<boolean> {
    const html = this.tpl({
      eyebrow: 'Seguridad',
      accent: 'green',
      title: 'Contraseña actualizada',
      body: `
        <p>Hola <strong>${userName}</strong>,</p>
        <p>Tu contraseña de DOAPP fue actualizada correctamente.</p>
        ${this.callout('danger', '¿No fuiste vos?', 'Contactá con soporte inmediatamente. Todas tus sesiones activas fueron cerradas.')}
      `,
      cta: { label: 'Contactar soporte', url: `${config.clientUrl}/help` },
    });
    return await this.sendEmail({ to: email, subject: 'Contraseña actualizada · DOAPP', html });
  }

  async sendNewMessageNotification(userId: string, senderName: string, messagePreview: string, conversationId: string): Promise<void> {
    const user = await User.findByPk(userId);
    if (!user?.notificationPreferences?.newMessage) return;
    const html = this.tpl({
      eyebrow: 'Mensaje',
      title: `Nuevo mensaje de ${senderName}`,
      body: `
        <p>Hola <strong>${user.name}</strong>,</p>
        <p><strong>${senderName}</strong> te envió un mensaje:</p>
        ${this.callout('info', '', `<em>"${messagePreview}"</em>`)}
      `,
      cta: { label: '💬 Ver conversación', url: `${config.clientUrl}/chat/${conversationId}` },
    });
    await this.sendToUser(userId, `Nuevo mensaje de ${senderName}`, html);
  }

  async sendJobUpdateNotification(userId: string, jobTitle: string, updateType: string, jobId: string): Promise<void> {
    const user = await User.findByPk(userId);
    if (!user?.notificationPreferences?.jobUpdate) return;
    const html = this.tpl({
      eyebrow: 'Publicación',
      title: 'Actualización de publicación',
      body: `
        <p>Hola <strong>${user.name}</strong>,</p>
        <p>${updateType}</p>
        ${this.callout('info', '', `<strong>Publicación:</strong> ${jobTitle}`)}
      `,
      cta: { label: 'Ver publicación', url: `${config.clientUrl}/jobs/${jobId}` },
    });
    await this.sendToUser(userId, `Actualización: ${jobTitle}`, html);
  }

  async sendContractUpdateNotification(userId: string, contractTitle: string, updateType: string, contractId: string): Promise<void> {
    const user = await User.findByPk(userId);
    if (!user?.notificationPreferences?.contractUpdate) return;
    const html = this.tpl({
      eyebrow: 'Contrato',
      title: 'Actualización de contrato',
      body: `
        <p>Hola <strong>${user.name}</strong>,</p>
        <p>${updateType}</p>
        ${this.callout('info', '', `<strong>Contrato:</strong> ${contractTitle}`)}
      `,
      cta: { label: 'Ver contrato', url: `${config.clientUrl}/contracts/${contractId}` },
    });
    await this.sendToUser(userId, `Contrato actualizado: ${contractTitle}`, html);
  }

  async sendPaymentNotification(userId: string, amount: number, updateType: string, _paymentId: string): Promise<void> {
    const user = await User.findByPk(userId);
    if (!user?.notificationPreferences?.paymentUpdate) return;
    const numericAmount = typeof amount === 'number' ? amount : parseFloat(String(amount)) || 0;
    const html = this.tpl({
      eyebrow: 'Pago',
      accent: 'green',
      title: 'Actualización de pago',
      body: `<p>Hola <strong>${user.name}</strong>,</p><p>${updateType}</p>`,
      amount: `$${numericAmount.toLocaleString('es-AR')} ARS`,
      cta: { label: 'Ver balance', url: `${config.clientUrl}/balance` },
    });
    await this.sendToUser(userId, `Pago: $${numericAmount.toFixed(2)}`, html);
  }

  async sendContractCreatedEmail(clientId: string, doerId: string, contractId: string, jobTitle: string, price: number, currency = 'ARS'): Promise<void> {
    const url = `${config.clientUrl}/contracts/${contractId}`;
    const makeHtml = (name: string, role: 'client' | 'doer') => this.tpl({
      eyebrow: 'Contrato',
      accent: 'green',
      title: role === 'client' ? 'Contrato creado' : '¡Te seleccionaron!',
      body: `
        <p>Hola <strong>${name}</strong>,</p>
        <p>${role === 'client' ? 'Creaste un nuevo contrato para la siguiente publicación.' : 'Fuiste seleccionado para trabajar en este contrato.'}</p>
        ${this.detailCard([
          { label: 'Publicación', value: jobTitle },
          { label: 'Monto', value: `${currency} $${price.toLocaleString('es-AR')}`, highlight: true },
        ])}
        ${role === 'client'
          ? this.callout('info', 'Próximos pasos', '<ul style="margin:4px 0 0;padding-left:18px;"><li>El trabajador debe aceptar el contrato</li><li>Realizá el pago (escrow)</li><li>Al finalizar, ambas partes confirman</li></ul>')
          : '<p>Revisá los detalles y aceptá el contrato para comenzar.</p>'}
      `,
      cta: { label: 'Ver contrato', url },
    });

    const client = await User.findByPk(clientId);
    const doer = await User.findByPk(doerId);
    if (client?.email) await this.sendEmail({ to: client.email, subject: `Contrato creado: ${jobTitle}`, html: makeHtml(client.name, 'client') });
    if (doer?.email) await this.sendEmail({ to: doer.email, subject: `Te seleccionaron: ${jobTitle}`, html: makeHtml(doer.name, 'doer') });
  }

  async sendContractAcceptedEmail(clientId: string, doerId: string, contractId: string, jobTitle: string): Promise<void> {
    const url = `${config.clientUrl}/contracts/${contractId}`;
    const makeHtml = (name: string) => this.tpl({
      eyebrow: 'Contrato',
      accent: 'green',
      title: 'Contrato aceptado',
      body: `
        <p>Hola <strong>${name}</strong>,</p>
        <p>Ambas partes aceptaron el contrato para <strong>${jobTitle}</strong>. ¡El trabajo puede comenzar!</p>
        ${this.callout('success', '¡Listo para comenzar!', 'El contrato está activo. Coordiná con la otra parte para arrancar.')}
      `,
      cta: { label: 'Ver contrato', url },
    });
    const client = await User.findByPk(clientId);
    const doer = await User.findByPk(doerId);
    if (client?.email) await this.sendEmail({ to: client.email, subject: `Contrato aceptado: ${jobTitle}`, html: makeHtml(client.name) });
    if (doer?.email) await this.sendEmail({ to: doer.email, subject: `Contrato aceptado: ${jobTitle}`, html: makeHtml(doer.name) });
  }

  async sendPaymentEscrowEmail(userId: string, jobTitle: string, amount: number, currency: string, contractId: string): Promise<void> {
    const user = await User.findByPk(userId);
    if (!user?.email) return;
    const html = this.tpl({
      eyebrow: 'Pago',
      accent: 'green',
      title: 'Pago en escrow',
      body: `
        <p>Hola <strong>${user.name}</strong>,</p>
        <p>El pago por <strong>${jobTitle}</strong> está retenido en escrow de forma segura.</p>
        ${this.callout('info', '¿Qué es el escrow?', 'El dinero se libera automáticamente al trabajador cuando ambas partes confirmen la finalización del trabajo.')}
      `,
      amount: `${currency} $${Number(amount).toLocaleString('es-AR')}`,
      cta: { label: 'Ver contrato', url: `${config.clientUrl}/contracts/${contractId}` },
    });
    await this.sendEmail({ to: user.email, subject: `Pago en escrow: ${jobTitle}`, html });
  }

  async sendContractAwaitingConfirmationEmail(to: string, userName: string, jobTitle: string, contractId: string, isClient: boolean): Promise<void> {
    const html = this.tpl({
      eyebrow: 'Contrato',
      accent: 'amber',
      title: 'Confirmación pendiente',
      body: `
        <p>Hola <strong>${userName}</strong>,</p>
        <p>El trabajo <strong>${jobTitle}</strong> está pendiente de confirmación.</p>
        ${isClient
          ? this.callout('warning', 'Tu acción es requerida', 'El trabajador marcó el trabajo como completado. Revisá el trabajo y confirmá si estás conforme.')
          : this.callout('info', 'En espera', 'Marcaste el trabajo como completado. Esperá que el cliente confirme.')}
        <p style="font-size:13px;color:#94a3b8;text-align:center;margin-top:16px;">Si no se confirma en 2 horas, se liberará automáticamente.</p>
      `,
      cta: { label: 'Confirmar trabajo', url: `${config.clientUrl}/contracts/${contractId}` },
    });
    await this.sendEmail({ to, subject: `Confirmación pendiente: ${jobTitle}`, html });
  }

  async sendContractCompletedEmail(clientId: string, doerId: string, contractId: string, jobTitle: string, workerAmount: number, currency = 'ARS'): Promise<void> {
    const url = `${config.clientUrl}/contracts/${contractId}`;
    const doer = await User.findByPk(doerId);
    const client = await User.findByPk(clientId);

    if (doer?.email) {
      const html = this.tpl({
        eyebrow: 'Contrato',
        accent: 'green',
        title: '¡Trabajo completado!',
        body: `
          <p>Hola <strong>${doer.name}</strong>,</p>
          <p>El trabajo <strong>${jobTitle}</strong> fue confirmado. Tu pago fue acreditado a tu balance.</p>
          ${this.callout('success', '¡Excelente trabajo!', 'El dinero ya está disponible en tu balance para retirarlo cuando quieras.')}
        `,
        amount: `${currency} $${workerAmount.toLocaleString('es-AR')}`,
        amountLabel: 'Monto acreditado',
        cta: { label: 'Ver balance', url: `${config.clientUrl}/balance` },
      });
      await this.sendEmail({ to: doer.email, subject: `Trabajo completado: ${jobTitle}`, html });
    }
    if (client?.email) {
      const html = this.tpl({
        eyebrow: 'Contrato',
        accent: 'green',
        title: 'Trabajo completado',
        body: `
          <p>Hola <strong>${client.name}</strong>,</p>
          <p>El trabajo <strong>${jobTitle}</strong> fue completado exitosamente.</p>
          ${this.callout('info', 'Dejá una reseña', 'Tu opinión ayuda a la comunidad. Calificá al trabajador desde el contrato.')}
        `,
        cta: { label: 'Ver contrato y dejar reseña', url },
      });
      await this.sendEmail({ to: client.email, subject: `Trabajo completado: ${jobTitle}`, html });
    }
  }

  async sendDisputeCreatedEmail(clientId: string, doerId: string, disputeId: string, contractTitle: string, reason: string): Promise<void> {
    const url = `${config.clientUrl}/disputes/${disputeId}`;
    const makeHtml = (name: string) => this.tpl({
      eyebrow: 'Disputa',
      accent: 'orange',
      title: 'Disputa abierta',
      body: `
        <p>Hola <strong>${name}</strong>,</p>
        <p>Se abrió una disputa en el contrato <strong>${contractTitle}</strong>.</p>
        ${this.detailCard([{ label: 'Motivo', value: reason }])}
        ${this.callout('warning', 'Próximos pasos', 'Nuestro equipo revisará el caso. Podés agregar evidencia y mensajes en el panel de disputa.')}
      `,
      cta: { label: 'Ver disputa', url },
    });
    const client = await User.findByPk(clientId);
    const doer = await User.findByPk(doerId);
    if (client?.email) await this.sendEmail({ to: client.email, subject: `Disputa abierta: ${contractTitle}`, html: makeHtml(client.name) });
    if (doer?.email) await this.sendEmail({ to: doer.email, subject: `Disputa abierta: ${contractTitle}`, html: makeHtml(doer.name) });
  }

  async sendDisputeResolvedEmail(userId: string, disputeId: string, resolution: string, amount: number, currency = 'ARS'): Promise<void> {
    const user = await User.findByPk(userId);
    if (!user?.email) return;
    const html = this.tpl({
      eyebrow: 'Disputa',
      accent: 'green',
      title: 'Disputa resuelta',
      body: `
        <p>Hola <strong>${user.name}</strong>,</p>
        <p>La disputa fue resuelta por nuestro equipo de moderación.</p>
        ${this.callout('success', 'Resolución', resolution)}
      `,
      amount: amount > 0 ? `${currency} $${amount.toLocaleString('es-AR')}` : undefined,
      cta: { label: 'Ver disputa', url: `${config.clientUrl}/disputes/${disputeId}` },
    });
    await this.sendEmail({ to: user.email, subject: 'Disputa resuelta · DOAPP', html });
  }

  async sendWithdrawalRequested(to: string, userName: string, amount: number): Promise<void> {
    const html = this.tpl({
      eyebrow: 'Retiro',
      title: 'Retiro solicitado',
      body: `
        <p>Hola <strong>${userName}</strong>,</p>
        <p>Recibimos tu solicitud de retiro. La procesaremos en los próximos días hábiles.</p>
        ${this.callout('info', '', 'Recibirás un email de confirmación cuando la transferencia sea procesada.')}
      `,
      amount: `$${amount.toLocaleString('es-AR')} ARS`,
      amountLabel: 'Monto solicitado',
      cta: { label: 'Ver balance', url: `${config.clientUrl}/balance` },
    });
    await this.sendEmail({ to, subject: 'Solicitud de retiro · DOAPP', html });
  }

  async sendWithdrawalApproved(to: string, userName: string, amount: number): Promise<void> {
    const html = this.tpl({
      eyebrow: 'Retiro',
      accent: 'green',
      title: 'Retiro aprobado',
      body: `
        <p>Hola <strong>${userName}</strong>,</p>
        <p>Tu solicitud de retiro fue aprobada. Procederemos a transferirte el dinero a tu CBU en breve.</p>
      `,
      amount: `$${amount.toLocaleString('es-AR')} ARS`,
      amountLabel: 'Monto aprobado',
    });
    await this.sendEmail({ to, subject: 'Retiro aprobado · DOAPP', html });
  }

  async sendWithdrawalCompleted(to: string, userName: string, amount: number, newBalance: number): Promise<void> {
    const html = this.tpl({
      eyebrow: 'Retiro',
      accent: 'green',
      title: '¡Retiro completado!',
      body: `
        <p>Hola <strong>${userName}</strong>,</p>
        <p>Tu retiro fue procesado exitosamente. El dinero ya está en camino a tu CBU.</p>
        ${this.callout('success', 'Balance actualizado', `Tu nuevo balance disponible es <strong>$${newBalance.toLocaleString('es-AR')} ARS</strong>`)}
      `,
      amount: `$${amount.toLocaleString('es-AR')} ARS`,
      amountLabel: 'Transferido',
    });
    await this.sendEmail({ to, subject: 'Retiro completado · DOAPP', html });
  }

  async sendWithdrawalRejected(to: string, userName: string, amount: number, reason: string): Promise<void> {
    const html = this.tpl({
      eyebrow: 'Retiro',
      accent: 'red',
      title: 'Retiro rechazado',
      body: `
        <p>Hola <strong>${userName}</strong>,</p>
        <p>Tu solicitud de retiro no pudo ser procesada.</p>
        ${this.callout('danger', 'Motivo del rechazo', reason)}
        <p>El monto de <strong>$${amount.toLocaleString('es-AR')} ARS</strong> fue devuelto a tu balance disponible.</p>
      `,
      cta: { label: 'Ver balance', url: `${config.clientUrl}/balance` },
    });
    await this.sendEmail({ to, subject: 'Retiro rechazado · DOAPP', html });
  }

  async sendPriceModificationEmail(to: string, userName: string, contractId: string, previousPrice: number, newPrice: number, isIncrease: boolean, balanceChange: number): Promise<void> {
    const html = this.tpl({
      eyebrow: 'Contrato',
      accent: isIncrease ? 'amber' : 'sky',
      title: isIncrease ? 'Precio aumentado' : 'Precio reducido',
      body: `
        <p>Hola <strong>${userName}</strong>,</p>
        <p>El precio del contrato fue modificado.</p>
        ${this.detailCard([
          { label: 'Precio anterior', value: `$${previousPrice.toLocaleString('es-AR')} ARS` },
          { label: 'Precio nuevo', value: `$${newPrice.toLocaleString('es-AR')} ARS`, highlight: true },
          { label: isIncrease ? 'Cargo adicional' : 'Reembolso', value: `$${Math.abs(balanceChange).toLocaleString('es-AR')} ARS` },
        ])}
      `,
      cta: { label: 'Ver contrato', url: `${config.clientUrl}/contracts/${contractId}` },
    });
    await this.sendEmail({ to, subject: `Precio modificado · DOAPP`, html });
  }

  async sendBalanceRefundEmail(to: string, userName: string, amount: number, reason: string, newBalance: number): Promise<void> {
    const html = this.tpl({
      eyebrow: 'Pago',
      accent: 'green',
      title: 'Reembolso acreditado',
      body: `
        <p>Hola <strong>${userName}</strong>,</p>
        <p>Se acreditó un reembolso a tu balance.</p>
        ${this.detailCard([
          { label: 'Motivo', value: reason },
          { label: 'Nuevo balance', value: `$${newBalance.toLocaleString('es-AR')} ARS`, highlight: true },
        ])}
      `,
      amount: `$${amount.toLocaleString('es-AR')} ARS`,
      amountLabel: 'Reembolso',
      cta: { label: 'Ver balance', url: `${config.clientUrl}/balance` },
    });
    await this.sendEmail({ to, subject: 'Reembolso acreditado · DOAPP', html });
  }

  async sendConfirmationReminder(to: string, userName: string, jobTitle: string, contractId: string, isClient: boolean): Promise<void> {
    const html = this.tpl({
      eyebrow: 'Recordatorio',
      accent: 'amber',
      title: 'Confirmación pendiente',
      body: `
        <p>Hola <strong>${userName}</strong>,</p>
        <p>El trabajo <strong>${jobTitle}</strong> está esperando tu confirmación.</p>
        ${isClient
          ? this.callout('warning', 'Tu acción es requerida', 'Revisá el trabajo realizado y confirmá si estás conforme. Si no confirmás en las próximas horas, el sistema lo confirmará automáticamente.')
          : this.callout('info', 'En espera del cliente', 'Confirmá las horas trabajadas para que el cliente pueda aprobar el pago.')
        }
      `,
      cta: { label: 'Confirmar ahora', url: `${config.clientUrl}/contracts/${contractId}` },
    });
    await this.sendEmail({ to, subject: `Confirmación pendiente: ${jobTitle}`, html });
  }

  async sendBankingInfoRequiredEmail(userId: string, _contractId: string, amount: number): Promise<void> {
    try {
      const user = await User.findByPk(userId);
      if (!user?.email) return;
      const html = this.tpl({
        eyebrow: 'Cuenta',
        accent: 'amber',
        title: 'Datos bancarios requeridos',
        body: `
          <p>Hola <strong>${user.name}</strong>,</p>
          <p>¡Tu trabajo fue completado y tenés un pago pendiente! Pero necesitamos tus datos bancarios para transferirte el dinero.</p>
          ${this.callout('warning', 'Acción requerida', 'Agregá tu CBU o CVU (22 dígitos) en la configuración de tu perfil para recibir el pago.')}
        `,
        amount: `$${amount.toLocaleString('es-AR')} ARS`,
        amountLabel: 'Monto pendiente',
        cta: { label: 'Completar datos bancarios', url: `${config.clientUrl}/settings?tab=banking` },
      });
      await this.sendEmail({ to: user.email, subject: 'Datos bancarios requeridos · DOAPP', html });
    } catch (error) {
      console.error('Error sending banking info required email:', error);
    }
  }

  async sendTicketCreatedEmail(ticketId: string, ticketNumber: string, subject: string, userEmail: string, userName: string): Promise<void> {
    try {
      const html = this.tpl({
        eyebrow: 'Soporte',
        title: `Ticket #${ticketNumber} creado`,
        body: `
          <p>Hola <strong>${userName}</strong>,</p>
          <p>Tu ticket de soporte fue creado correctamente.</p>
          ${this.detailCard([
            { label: 'Número', value: `#${ticketNumber}` },
            { label: 'Asunto', value: subject },
          ])}
          <p>Nuestro equipo responderá lo antes posible. Podés agregar más información desde el panel.</p>
        `,
        cta: { label: 'Ver ticket', url: `${config.clientUrl}/tickets/${ticketId}` },
      });
      await this.sendEmail({ to: userEmail, subject: `Ticket #${ticketNumber} creado · DOAPP`, html });
    } catch (error) {
      console.error('Error sending ticket created email:', error);
    }
  }

  async sendTicketMessageEmail(ticketId: string, ticketNumber: string, subject: string, recipientEmail: string, recipientName: string, senderName: string, message: string, isAdminReply: boolean): Promise<void> {
    try {
      const preview = message.length > 200 ? message.substring(0, 200) + '…' : message;
      const html = this.tpl({
        eyebrow: 'Soporte',
        title: `Respuesta en ticket #${ticketNumber}`,
        body: `
          <p>Hola <strong>${recipientName}</strong>,</p>
          <p>${isAdminReply ? '<strong>Soporte DOAPP</strong>' : `<strong>${senderName}</strong>`} respondió en tu ticket <strong>${subject}</strong>:</p>
          ${this.callout('info', '', `<em>"${preview}"</em>`)}
        `,
        cta: { label: 'Ver ticket completo', url: `${config.clientUrl}/tickets/${ticketId}` },
      });
      await this.sendEmail({ to: recipientEmail, subject: `Respuesta en ticket #${ticketNumber} · DOAPP`, html });
    } catch (error) {
      console.error('Error sending ticket message email:', error);
    }
  }

  async sendDisputeMessageEmail(disputeId: string, recipientEmail: string, recipientName: string, senderName: string, message: string, isAdminMessage: boolean): Promise<void> {
    try {
      const preview = message.length > 200 ? message.substring(0, 200) + '…' : message;
      const html = this.tpl({
        eyebrow: 'Disputa',
        accent: 'orange',
        title: 'Nuevo mensaje en disputa',
        body: `
          <p>Hola <strong>${recipientName}</strong>,</p>
          <p>${isAdminMessage ? '<strong>Moderador DOAPP</strong>' : `<strong>${senderName}</strong>`} envió un mensaje en la disputa:</p>
          ${this.callout('warning', '', `<em>"${preview}"</em>`)}
          <p>Es importante que respondas para ayudar a resolver la situación.</p>
        `,
        cta: { label: 'Ver disputa', url: `${config.clientUrl}/disputes/${disputeId}` },
      });
      await this.sendEmail({ to: recipientEmail, subject: 'Nuevo mensaje en disputa · DOAPP', html });
    } catch (error) {
      console.error('Error sending dispute message email:', error);
    }
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }
}

export default new EmailService();
