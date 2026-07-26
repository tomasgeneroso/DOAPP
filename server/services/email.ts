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
    preheader?: string;
    footerNote?: string;
  }): string {
    const ACCENTS = {
      sky:    { eyebrowBg: '#e0f2fe', eyebrowBorder: '#bae6fd', eyebrowColor: '#0284c7', c1: '#0284c7', c2: '#2563eb', barGrad: 'linear-gradient(90deg,#38bdf8,#0ea5e9,#2563eb)' },
      green:  { eyebrowBg: '#d1fae5', eyebrowBorder: '#a7f3d0', eyebrowColor: '#047857', c1: '#059669', c2: '#047857', barGrad: 'linear-gradient(90deg,#34d399,#10b981,#047857)' },
      amber:  { eyebrowBg: '#fef3c7', eyebrowBorder: '#fde68a', eyebrowColor: '#92400e', c1: '#d97706', c2: '#b45309', barGrad: 'linear-gradient(90deg,#fbbf24,#f59e0b,#b45309)' },
      red:    { eyebrowBg: '#fee2e2', eyebrowBorder: '#fecaca', eyebrowColor: '#b91c1c', c1: '#dc2626', c2: '#b91c1c', barGrad: 'linear-gradient(90deg,#f87171,#ef4444,#b91c1c)' },
      orange: { eyebrowBg: '#ffedd5', eyebrowBorder: '#fed7aa', eyebrowColor: '#c2410c', c1: '#ea580c', c2: '#c2410c', barGrad: 'linear-gradient(90deg,#fb923c,#f97316,#c2410c)' },
    };
    const a = ACCENTS[opts.accent || 'sky'];
    const year = new Date().getFullYear();
    const base = config.clientUrl || 'https://doapparg.site';
    const logo = `${base}/doapp-logo-email.png`;
    const preheader = opts.preheader || String(opts.title).replace(/<[^>]+>/g, '').trim();
    const footerNote = opts.footerNote || '¿No reconocés este email? Podés ignorarlo, no haremos nada con tu cuenta.';
    const preheaderPad = ' ‌'.repeat(40);

    const amountBlock = opts.amount ? `
      <tr><td class="pad" style="padding:24px 40px 0;text-align:center;">
        <p style="margin:0 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:11.5px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.07em;font-weight:700;">${opts.amountLabel || 'Monto'}</p>
        <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:40px;font-weight:800;color:${a.c1};letter-spacing:-1.5px;">${opts.amount}</p>
      </td></tr>` : '';

    const ctaBlock = opts.cta ? `
      <tr><td align="center" class="pad" style="padding:28px 40px 8px;">
        <!--[if mso]>
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${opts.cta.url}" style="height:52px;v-text-anchor:middle;width:300px;" arcsize="27%" strokecolor="${a.c1}" fillcolor="${a.c1}">
        <w:anchorlock/><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">${opts.cta.label}</center>
        </v:roundrect>
        <![endif]-->
        <!--[if !mso]><!-->
        <a href="${opts.cta.url}" style="background-color:${a.c1};background-image:linear-gradient(135deg,${a.c1} 0%,${a.c2} 100%);color:#ffffff;display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;line-height:22px;padding:16px 32px;border-radius:14px;text-decoration:none;">${opts.cta.label}</a>
        <!--<![endif]-->
        <p style="margin:14px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#94a3b8;">¿No funciona el botón? Copiá y pegá este link:<br><a href="${opts.cta.url}" style="color:${a.c1};text-decoration:none;word-break:break-all;">${opts.cta.url}</a></p>
      </td></tr>` : `<tr><td style="height:8px;line-height:8px;font-size:0;">&nbsp;</td></tr>`;

    return `<!DOCTYPE html>
<html lang="es" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${preheader}</title>
<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<style>table,td,th{border-collapse:collapse;}</style>
<![endif]-->
<style>
  body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
  table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;}
  img{-ms-interpolation-mode:bicubic;border:0;outline:none;text-decoration:none;}
  body{margin:0;padding:0;width:100% !important;height:100% !important;}
  a[x-apple-data-detectors]{color:inherit !important;text-decoration:none !important;}
  @media screen and (max-width:600px){.wrap{width:100% !important;}.pad{padding-left:24px !important;padding-right:24px !important;}.h1{font-size:23px !important;line-height:1.3 !important;}}
  @media (prefers-color-scheme: dark){
    .bg-body{background:#070d1a !important;}
    .card{background:#0f1624 !important;}
    .fg1{color:#f1f5f9 !important;}
    .fg2{color:#94a3b8 !important;}
    .body-text{color:#cbd5e1 !important;}
    .footer-border{border-color:#1e2d42 !important;}
  }
</style>
</head>
<body class="bg-body" style="margin:0;padding:0;background:#eef2f7;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#eef2f7;">${preheader}${preheaderPad}</div>
<center>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg-body" style="background:#eef2f7;">
<tr><td align="center" style="padding:32px 12px;">
<table role="presentation" class="wrap card" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;">
<tr><td style="background-color:#0c1a2e;background-image:linear-gradient(135deg,#0c1a2e 0%,#070d1a 100%);padding:26px 40px 22px;" class="pad">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="middle"><img src="${logo}" width="34" height="34" alt="DoApp" style="display:block;border:0;"></td>
<td valign="middle" style="padding-left:10px;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:800;letter-spacing:-0.5px;color:#ffffff;">D<span style="color:#38bdf8;">o</span>App</td>
</tr></table>
</td></tr>
<tr><td style="line-height:0;font-size:0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="3" bgcolor="${a.c1}" style="background:${a.barGrad};background-color:${a.c1};font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>
<tr><td class="pad fg1" style="padding:32px 40px 0;">
${opts.eyebrow ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${a.eyebrowBg}" style="background:${a.eyebrowBg};border:1px solid ${a.eyebrowBorder};border-radius:9999px;padding:5px 12px;"><span style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:${a.eyebrowColor};">${opts.eyebrow}</span></td></tr></table>` : ''}
<h1 class="h1 fg1" style="margin:14px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:28px;line-height:1.25;font-weight:800;letter-spacing:-0.5px;color:#0f172a;">${opts.title}</h1>
</td></tr>
<tr><td class="pad body-text" style="padding:8px 40px 0;font-family:Arial,Helvetica,sans-serif;font-size:15.5px;line-height:1.6;color:#334155;">${opts.body}</td></tr>
${amountBlock}
${ctaBlock}
<tr><td style="height:12px;line-height:12px;font-size:0;">&nbsp;</td></tr>
<tr><td class="pad footer-border" style="padding:28px 40px 32px;border-top:1px solid #e2e8f0;text-align:center;">
<p class="fg2" style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#94a3b8;">${footerNote}</p>
<p class="fg2" style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#94a3b8;"><a href="${base}" style="color:${a.c1};text-decoration:none;">doapparg.site</a><span style="color:#cbd5e1;">&nbsp;·&nbsp;</span><a href="${base}/help" style="color:${a.c1};text-decoration:none;">Centro de ayuda</a></p>
<p class="fg2" style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#94a3b8;">© ${year} DoApp · Buenos Aires, Argentina</p>
</td></tr>
</table>
</td></tr>
</table>
</center>
</body>
</html>`;
  }

  /** Callout box: info | warning | success | danger */
  private callout(type: 'info' | 'warning' | 'success' | 'danger', title: string, content: string): string {
    const c = {
      info:    { bg: '#e0f2fe', border: '#bae6fd', ic: '#0284c7', icBg: '#bae6fd', fg: '#075985', glyph: 'i' },
      warning: { bg: '#fffbeb', border: '#fde68a', ic: '#92400e', icBg: '#fef3c7', fg: '#854d0e', glyph: '!' },
      success: { bg: '#dcfce7', border: '#86efac', ic: '#065f46', icBg: '#bbf7d0', fg: '#065f46', glyph: '✓' },
      danger:  { bg: '#fee2e2', border: '#fecaca', ic: '#991b1b', icBg: '#fecaca', fg: '#991b1b', glyph: '!' },
    }[type];
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${c.bg};border:1px solid ${c.border};border-radius:14px;margin:20px 0;">
      <tr>
        <td width="48" valign="top" style="padding:16px 0 16px 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="30" height="30" align="center" valign="middle" bgcolor="${c.icBg}" style="background:${c.icBg};border-radius:9999px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:800;color:${c.ic};">${c.glyph}</td></tr></table>
        </td>
        <td style="padding:16px 16px 16px 12px;font-family:Arial,Helvetica,sans-serif;font-size:13.5px;line-height:1.5;color:${c.fg};">
          ${title ? `<strong style="display:block;font-size:14px;margin-bottom:2px;color:${c.fg};">${title}</strong>` : ''}${content}
        </td>
      </tr>
    </table>`;
  }

  /** Receipt-style detail card. `highlight` renders the emphasized total row. */
  private detailCard(rows: Array<{ label: string; value: string; highlight?: boolean }>): string {
    const rowsHtml = rows.map((r) => `
      <tr>
        <td style="padding:9px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#64748b;border-top:${r.highlight ? '1px solid #e2e8f0' : 'none'};">${r.highlight ? '<div style="padding-top:5px;">' + r.label + '</div>' : r.label}</td>
        <td align="right" style="padding:9px 0;font-family:Arial,Helvetica,sans-serif;font-weight:${r.highlight ? 900 : 700};font-size:${r.highlight ? '21px' : '14px'};color:${r.highlight ? '#0284c7' : '#0f172a'};border-top:${r.highlight ? '1px solid #e2e8f0' : 'none'};">${r.highlight ? '<div style="padding-top:5px;">' + r.value + '</div>' : r.value}</td>
      </tr>`).join('');
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;margin:20px 0;">
      <tr><td style="padding:20px 22px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rowsHtml}</table>
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
      eyebrow: '¡Bienvenido!',
      accent: 'green',
      preheader: 'Tu cuenta ya está lista — publicá tu primer trabajo o postulate a uno.',
      title: `Tu cuenta de DoApp está lista, ${userName}.`,
      body: `
        <p>Hola <strong>${userName}</strong>, ¡bienvenido! Ya podés <strong>publicar trabajos</strong> o <strong>postularte como Doer</strong>. Tu plata queda guardada en DoApp hasta que el trabajo se confirme — sin sorpresas.</p>
        ${this.callout('success', 'Pago protegido', 'Todo lo que cobrés o pagués en DoApp queda en garantía hasta que ambas partes confirmen. Así de simple.')}
        <p>¿Alguna duda? Estamos en el <a href="${config.clientUrl}/help" style="color:#0ea5e9;">Centro de Ayuda</a>.</p>
      `,
      cta: { label: 'Publicar mi primer trabajo', url: `${config.clientUrl}/` },
    });
    await this.sendToUser(userId, '¡Bienvenido a DoApp!', html);
  }

  /** Admin verified the user's identity (DNI). */
  async sendAccountVerifiedEmail(email: string, userName: string): Promise<boolean> {
    const html = this.tpl({
      eyebrow: 'Identidad verificada',
      accent: 'green',
      preheader: 'Ya tenés la insignia de identidad verificada en tu perfil.',
      title: `Tu identidad quedó verificada, ${userName}.`,
      body: `
        <p>Buenas noticias <strong>${userName}</strong>: confirmamos tu identidad. Tu perfil ahora muestra la insignia de <strong>verificado</strong>, lo que genera más confianza con clientes y Doers.</p>
        ${this.callout('success', 'Subió tu confianza', 'Los perfiles verificados reciben en promedio más propuestas. Completá tu portafolio para sumar todavía más confianza.')}
      `,
      cta: { label: 'Ver mi perfil', url: `${config.clientUrl}/profile` },
    });
    return await this.sendEmail({ to: email, subject: 'Tu identidad fue verificada · DOAPP', html });
  }

  /** Admin banned/suspended the account. */
  async sendAccountBannedEmail(email: string, userName: string, reason: string, expiresAt?: Date | null): Promise<boolean> {
    const html = this.tpl({
      eyebrow: 'Cuenta suspendida',
      accent: 'red',
      preheader: 'Tu cuenta quedó suspendida por incumplir nuestras normas.',
      title: `Tu cuenta fue suspendida, ${userName}.`,
      body: `
        <p>Hola <strong>${userName}</strong>, tu cuenta de DoApp fue suspendida por incumplir nuestros <strong>Términos de uso</strong>. Mientras dure la suspensión no vas a poder publicar trabajos, aplicar a propuestas ni liberar pagos.</p>
        ${this.callout('danger', 'Motivo', reason || 'No especificado')}
        ${expiresAt ? `<p>La suspensión vence el <strong>${new Date(expiresAt).toLocaleDateString('es-AR')}</strong>.</p>` : ''}
        <p>Si creés que es un error, podés apelar esta decisión desde el Centro de Ayuda o respondiendo este email.</p>
      `,
      cta: { label: 'Apelar la suspensión', url: `${config.clientUrl}/help` },
    });
    return await this.sendEmail({ to: email, subject: 'Tu cuenta fue suspendida · DOAPP', html });
  }

  /** Admin permanently deleted the account. */
  async sendAccountDeletedEmail(email: string, userName: string, reason?: string): Promise<boolean> {
    const html = this.tpl({
      eyebrow: 'Cuenta eliminada',
      accent: 'red',
      preheader: 'Confirmamos que tu cuenta y tus datos fueron dados de baja.',
      footerNote: 'Si no pediste esta baja, escribinos a soporte dentro de los próximos 7 días.',
      title: 'Tu cuenta fue eliminada.',
      body: `
        <p>Hola <strong>${userName}</strong>, confirmamos que tu cuenta de DoApp y tus datos personales fueron eliminados. Los contratos ya completados quedan en nuestros registros por motivos legales e impositivos.</p>
        ${reason ? this.callout('danger', 'Motivo', reason) : ''}
        <p>Si creés que es un error, podés escribir a soporte para revisar el caso.</p>
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
      eyebrow: 'Confirmá tu cuenta',
      preheader: 'Un solo clic y ya podés usar DoApp. El link vale 24 horas.',
      title: 'Verificá tu email.',
      body: `
        <p>Gracias por registrarte en <strong>DoApp</strong>, ${userName}. Para activar tu cuenta y empezar a publicar o aplicar a trabajos, confirmá tu dirección de email.</p>
        ${this.callout('warning', 'Este enlace expira en 24 horas', 'Si no fuiste vos quien creó esta cuenta, ignorá este email.')}
      `,
      cta: { label: 'Verificar mi email', url: verificationUrl },
    });
    return await this.sendEmail({ to: email, subject: 'Confirmá tu email para activar tu cuenta · DoApp', html });
  }

  async sendPasswordResetEmail(email: string, userName: string, resetToken: string): Promise<boolean> {
    const url = `${config.clientUrl}/reset-password?token=${resetToken}`;
    const html = this.tpl({
      eyebrow: 'Cambio de contraseña',
      accent: 'red',
      preheader: 'Pediste cambiar tu contraseña. El link vale por tiempo limitado.',
      title: 'Recuperá tu contraseña.',
      body: `
        <p>Hola <strong>${userName}</strong>, pediste recuperar tu contraseña. Tocá el botón y elegí una nueva.</p>
        ${this.callout('danger', '¿No pediste este cambio?', 'Ignorá este email — tu cuenta sigue segura y tu contraseña no se modifica. Si te sigue pasando, escribinos a soporte.')}
      `,
      cta: { label: 'Crear contraseña nueva', url },
    });
    return await this.sendEmail({ to: email, subject: 'Restablecé tu contraseña de DoApp', html });
  }

  async sendPasswordChangedEmail(email: string, userName: string): Promise<boolean> {
    const html = this.tpl({
      eyebrow: 'Seguridad',
      accent: 'red',
      preheader: 'Confirmamos que tu contraseña se actualizó recién.',
      title: 'Tu contraseña se actualizó.',
      body: `
        <p>Hola <strong>${userName}</strong>, te confirmamos que tu contraseña de DoApp se cambió con éxito. Por seguridad, cerramos todas tus sesiones activas.</p>
        ${this.callout('danger', '¿No fuiste vos?', 'Restablecé tu contraseña ahora mismo y escribinos a soporte para revisar tu cuenta.')}
      `,
      cta: { label: 'No fui yo, proteger mi cuenta', url: `${config.clientUrl}/reset-password` },
    });
    return await this.sendEmail({ to: email, subject: 'Tu contraseña fue cambiada · DoApp', html });
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
      eyebrow: role === 'client' ? 'Nuevo contrato' : '¡Te seleccionaron!',
      accent: 'sky',
      preheader: role === 'client'
        ? `Ya tenés un contrato activo para "${jobTitle}".`
        : `Te eligieron para "${jobTitle}". Revisá y aceptá para arrancar.`,
      title: role === 'client' ? 'Se creó tu contrato.' : `Te seleccionaron para un trabajo.`,
      body: `
        <p>Hola <strong>${name}</strong>, ${role === 'client'
          ? 'tu contrato quedó creado. En cuanto se confirme el pago, el dinero queda protegido en DoApp hasta que se complete el trabajo.'
          : 'te eligieron para este trabajo. Revisá los detalles y aceptá el contrato para comenzar.'}</p>
        ${this.detailCard([
          { label: 'Trabajo', value: jobTitle },
          { label: 'Monto', value: `${currency} $${price.toLocaleString('es-AR')}`, highlight: true },
        ])}
        ${role === 'client'
          ? this.callout('info', 'Próximos pasos', '<ul style="margin:4px 0 0;padding-left:18px;"><li>El Doer acepta el contrato</li><li>Confirmás el pago (queda en garantía)</li><li>Al terminar, ambos confirman y se libera</li></ul>')
          : ''}
      `,
      cta: { label: role === 'client' ? 'Ver el contrato' : 'Revisar y aceptar', url },
    });

    const client = await User.findByPk(clientId);
    const doer = await User.findByPk(doerId);
    if (client?.email) await this.sendEmail({ to: client.email, subject: `Contrato creado: ${jobTitle}`, html: makeHtml(client.name, 'client') });
    if (doer?.email) await this.sendEmail({ to: doer.email, subject: `Te seleccionaron: ${jobTitle}`, html: makeHtml(doer.name, 'doer') });
  }

  async sendContractAcceptedEmail(clientId: string, doerId: string, contractId: string, jobTitle: string): Promise<void> {
    const url = `${config.clientUrl}/contracts/${contractId}`;
    const makeHtml = (name: string) => this.tpl({
      eyebrow: 'Contrato aceptado',
      accent: 'green',
      preheader: `Ya pueden coordinar los detalles de "${jobTitle}" por el chat.`,
      title: 'Contrato aceptado.',
      body: `
        <p>Buenas noticias, <strong>${name}</strong>: el contrato de "<strong>${jobTitle}</strong>" quedó aceptado. Ya pueden coordinar por el chat y arrancar.</p>
        ${this.callout('success', '¡Listo para comenzar!', 'El contrato está activo. Con el pago en garantía, tu plata está protegida hasta confirmar el trabajo.')}
      `,
      cta: { label: 'Ver el contrato', url },
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
      eyebrow: 'Pago protegido',
      accent: 'sky',
      preheader: 'La plata queda en DoApp hasta que confirmen que el trabajo está listo.',
      title: 'Tu plata está guardada.',
      body: `
        <p>Hola <strong>${user.name}</strong>, recibimos tu pago por "<strong>${jobTitle}</strong>". Queda retenido en DoApp hasta que confirmen que el trabajo está terminado. Si algo no sale como acordaron, abrís un reclamo y se devuelve.</p>
        ${this.callout('info', '¿Cómo se libera?', 'Cuando ambos confirmen que el trabajo está terminado, el dinero pasa al Doer. Sin sorpresas.')}
      `,
      amount: `${currency} $${Number(amount).toLocaleString('es-AR')}`,
      amountLabel: 'Total guardado',
      cta: { label: 'Ver el contrato', url: `${config.clientUrl}/contracts/${contractId}` },
    });
    await this.sendEmail({ to: user.email, subject: `Pago en escrow: ${jobTitle}`, html });
  }

  async sendContractAwaitingConfirmationEmail(to: string, userName: string, jobTitle: string, contractId: string, isClient: boolean): Promise<void> {
    const html = this.tpl({
      eyebrow: 'Esperando confirmación',
      accent: 'amber',
      preheader: isClient ? 'Confirmá que todo esté OK para liberar el pago.' : 'Esperando que el cliente confirme el trabajo.',
      title: isClient ? 'Confirmá que el trabajo está terminado.' : 'Trabajo marcado como terminado.',
      body: `
        <p>Hola <strong>${userName}</strong>, ${isClient
          ? `el Doer marcó como completado el trabajo "<strong>${jobTitle}</strong>". Revisá que todo esté en orden y confirmá para liberar el pago — o abrí un reclamo si algo no salió bien.`
          : `marcaste como completado el trabajo "<strong>${jobTitle}</strong>". Ahora esperamos que el cliente confirme para liberar tu pago.`}</p>
        ${isClient
          ? this.callout('warning', 'Se libera automáticamente en 2 horas', 'Si no confirmás ni abrís un reclamo, el pago se libera solo a favor del Doer.')
          : this.callout('info', 'En espera', 'Si el cliente no responde en 2 horas, el pago se libera automáticamente a tu favor.')}
      `,
      cta: { label: isClient ? 'Confirmar trabajo' : 'Ver el contrato', url: `${config.clientUrl}/contracts/${contractId}` },
    });
    await this.sendEmail({ to, subject: `Confirmación pendiente: ${jobTitle}`, html });
  }

  async sendContractCompletedEmail(clientId: string, doerId: string, contractId: string, jobTitle: string, workerAmount: number, currency = 'ARS'): Promise<void> {
    const url = `${config.clientUrl}/contracts/${contractId}`;
    const doer = await User.findByPk(doerId);
    const client = await User.findByPk(clientId);

    if (doer?.email) {
      const html = this.tpl({
        eyebrow: 'Trabajo completado',
        accent: 'green',
        preheader: 'El trabajo se cerró y tu pago ya está en tu balance.',
        title: '¡Cobraste tu trabajo!',
        body: `
          <p>Buen trabajo, <strong>${doer.name}</strong>. El trabajo "<strong>${jobTitle}</strong>" fue confirmado y tu pago ya se acreditó a tu balance.</p>
          ${this.callout('success', '¡Excelente!', 'El dinero ya está disponible en tu balance para retirarlo a tu CBU cuando quieras.')}
        `,
        amount: `${currency} $${workerAmount.toLocaleString('es-AR')}`,
        amountLabel: 'Monto acreditado',
        cta: { label: 'Ver mi balance', url: `${config.clientUrl}/balance` },
      });
      await this.sendEmail({ to: doer.email, subject: `Trabajo completado: ${jobTitle}`, html });
    }
    if (client?.email) {
      const html = this.tpl({
        eyebrow: 'Trabajo completado',
        accent: 'green',
        preheader: 'El trabajo quedó cerrado y el pago fue liberado.',
        title: 'Tu contrato quedó completado.',
        body: `
          <p>Gracias por confiar en DoApp, <strong>${client.name}</strong>. El trabajo "<strong>${jobTitle}</strong>" se cerró y el pago ya fue liberado al Doer.</p>
          ${this.callout('info', 'Dejá una reseña', 'Tu opinión ayuda a la comunidad. Calificá al Doer desde el contrato — tardás 30 segundos.')}
        `,
        cta: { label: 'Calificar al Doer', url },
      });
      await this.sendEmail({ to: client.email, subject: `Trabajo completado: ${jobTitle}`, html });
    }
  }

  async sendDisputeCreatedEmail(clientId: string, doerId: string, disputeId: string, contractTitle: string, reason: string): Promise<void> {
    const url = `${config.clientUrl}/disputes/${disputeId}`;
    const makeHtml = (name: string) => this.tpl({
      eyebrow: 'Disputa abierta',
      accent: 'red',
      preheader: 'El pago queda retenido hasta que se resuelva la disputa.',
      title: 'Se abrió una disputa.',
      body: `
        <p>Hola <strong>${name}</strong>, se abrió una disputa sobre el contrato "<strong>${contractTitle}</strong>". El pago queda retenido en garantía hasta que nuestro equipo revise el caso.</p>
        ${this.callout('danger', 'Motivo informado', reason)}
        <p>Podés sumar evidencia y responder en el panel de la disputa. Cuanto antes respondas, más rápido avanzamos.</p>
      `,
      cta: { label: 'Responder a la disputa', url },
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
      eyebrow: 'Disputa resuelta',
      accent: 'green',
      preheader: 'Nuestro equipo revisó el caso y tomó una decisión.',
      title: 'Tu disputa fue resuelta.',
      body: `
        <p>Hola <strong>${user.name}</strong>, revisamos tu disputa y ya tomamos una decisión.</p>
        ${this.callout('success', 'Resolución', resolution)}
      `,
      amount: amount > 0 ? `${currency} $${amount.toLocaleString('es-AR')}` : undefined,
      cta: { label: 'Ver el detalle', url: `${config.clientUrl}/disputes/${disputeId}` },
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
      eyebrow: 'Cambio de precio',
      accent: isIncrease ? 'amber' : 'sky',
      preheader: isIncrease ? 'Hay un aumento de precio en tu contrato.' : 'Se redujo el precio de tu contrato.',
      title: isIncrease ? 'Se modificó el precio del contrato.' : 'Se redujo el precio del contrato.',
      body: `
        <p>Hola <strong>${userName}</strong>, ${isIncrease
          ? 'se aplicó un nuevo precio al contrato. Se generó un cargo adicional por la diferencia.'
          : 'se redujo el precio del contrato y te devolvimos la diferencia a tu balance.'}</p>
        ${this.detailCard([
          { label: 'Precio anterior', value: `$${previousPrice.toLocaleString('es-AR')} ARS` },
          { label: 'Precio nuevo', value: `$${newPrice.toLocaleString('es-AR')} ARS`, highlight: true },
          { label: isIncrease ? 'Cargo adicional' : 'Reembolso a tu balance', value: `$${Math.abs(balanceChange).toLocaleString('es-AR')} ARS` },
        ])}
      `,
      cta: { label: 'Ver el contrato', url: `${config.clientUrl}/contracts/${contractId}` },
    });
    await this.sendEmail({ to, subject: `Precio modificado · DOAPP`, html });
  }

  async sendBalanceRefundEmail(to: string, userName: string, amount: number, reason: string, newBalance: number): Promise<void> {
    const html = this.tpl({
      eyebrow: 'Reembolso',
      accent: 'green',
      preheader: 'El reembolso ya está disponible en tu balance.',
      title: 'Te devolvimos tu dinero.',
      body: `
        <p>Hola <strong>${userName}</strong>, procesamos un reembolso a tu balance de DoApp. Ya podés usarlo para publicar un nuevo trabajo o retirarlo a tu CBU.</p>
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
        eyebrow: 'Falta información',
        accent: 'amber',
        preheader: 'Cargá tu CBU o CVU para poder liberarte el pago.',
        title: 'Nos falta tu CBU para pagarte.',
        body: `
          <p>Hola <strong>${user.name}</strong>, tu pago ya está listo para liberarse, pero todavía no cargaste un CBU o CVU en tu cuenta. Cargalo para recibir la plata sin demoras.</p>
          ${this.callout('warning', 'El pago queda en tu balance mientras tanto', 'No se pierde — apenas cargues tu CBU (22 dígitos) lo transferimos.')}
        `,
        amount: `$${amount.toLocaleString('es-AR')} ARS`,
        amountLabel: 'Monto pendiente',
        cta: { label: 'Cargar mi CBU', url: `${config.clientUrl}/settings?tab=banking` },
      });
      await this.sendEmail({ to: user.email, subject: 'Datos bancarios requeridos · DOAPP', html });
    } catch (error) {
      console.error('Error sending banking info required email:', error);
    }
  }

  async sendTicketCreatedEmail(ticketId: string, ticketNumber: string, subject: string, userEmail: string, userName: string): Promise<void> {
    try {
      const html = this.tpl({
        eyebrow: 'Ticket creado',
        preheader: 'Nuestro equipo te va a responder en menos de 24 horas.',
        title: 'Recibimos tu consulta.',
        body: `
          <p>Hola <strong>${userName}</strong>, tu ticket de soporte fue creado. Nuestro equipo lo revisa y te responde por acá mismo en menos de 24 horas.</p>
          ${this.detailCard([
            { label: 'Ticket', value: `#${ticketNumber}` },
            { label: 'Asunto', value: subject },
          ])}
        `,
        cta: { label: 'Ver mi ticket', url: `${config.clientUrl}/tickets/${ticketId}` },
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
        eyebrow: 'Nuevo mensaje',
        preheader: 'Tenés una respuesta nueva en tu ticket de soporte.',
        title: 'Tenés una respuesta de soporte.',
        body: `
          <p>Hola <strong>${recipientName}</strong>, ${isAdminReply ? '<strong>Soporte DoApp</strong>' : `<strong>${senderName}</strong>`} respondió en tu ticket "<strong>${subject}</strong>":</p>
          ${this.callout('info', '', `<em>"${preview}"</em>`)}
        `,
        cta: { label: 'Ver la respuesta', url: `${config.clientUrl}/tickets/${ticketId}` },
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
        eyebrow: 'Nuevo mensaje',
        accent: 'red',
        preheader: 'Hay un mensaje nuevo en tu disputa.',
        title: 'Tenés un mensaje en tu disputa.',
        body: `
          <p>Hola <strong>${recipientName}</strong>, ${isAdminMessage ? '<strong>el equipo de mediación de DoApp</strong>' : `<strong>${senderName}</strong>`} dejó un mensaje en la disputa:</p>
          ${this.callout('warning', '', `<em>"${preview}"</em>`)}
          <p>Te pedimos que respondas para poder avanzar con la resolución.</p>
        `,
        cta: { label: 'Ver el mensaje', url: `${config.clientUrl}/disputes/${disputeId}` },
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
