import twilio from "twilio";
import { config } from "../config/env.js";

interface WhatsAppMessage {
  to: string; // Phone number in E.164 format (e.g., +5491123456789)
  body: string;
}

class WhatsAppService {
  private client: any;
  private initialized = false;
  private fromNumber: string;

  constructor() {
    this.fromNumber = process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886";
    this.initialize();
  }

  private initialize() {
    try {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;

      if (accountSid && authToken && accountSid !== "your_account_sid") {
        this.client = twilio(accountSid, authToken);
        this.initialized = true;
        console.log("✅ Twilio WhatsApp initialized");
      } else {
        console.warn("⚠️  Twilio credentials not configured. WhatsApp messages will be disabled.");
      }
    } catch (error) {
      console.error("❌ Failed to initialize Twilio:", error);
    }
  }

  /**
   * Send WhatsApp message
   */
  async sendMessage(options: WhatsAppMessage): Promise<boolean> {
    if (!this.initialized) {
      console.warn("Twilio not initialized. Skipping WhatsApp message.");
      return false;
    }

    try {
      // Format phone number for WhatsApp
      const toNumber = options.to.startsWith("whatsapp:")
        ? options.to
        : `whatsapp:${options.to}`;

      await this.client.messages.create({
        from: this.fromNumber,
        to: toNumber,
        body: options.body,
      });

      console.log(`✅ WhatsApp message sent to ${options.to}`);
      return true;
    } catch (error: any) {
      console.error("Error sending WhatsApp message:", error);
      return false;
    }
  }

  /**
   * Send phone verification code via SMS (Twilio)
   */
  async sendPhoneVerificationCode(
    phone: string,
    userName: string,
    code: string
  ): Promise<boolean> {
    const message = `Hola ${userName},

✅ Tu código de verificación de teléfono para DoApp es:

*${code}*

Este código expirará en 10 minutos.

- Equipo DoApp`;

    return await this.sendMessage({
      to: phone,
      body: message,
    });
  }

  /**
   * Send simple phone verification code
   */
  async sendVerificationCodeSimple(
    phone: string,
    code: string
  ): Promise<boolean> {
    const message = `Tu código de verificación de DoApp es: ${code}

Este código expirará en 10 minutos.`;

    return await this.sendMessage({
      to: phone,
      body: message,
    });
  }

  /**
   * Check if WhatsApp is available
   */
  isAvailable(): boolean {
    return this.initialized;
  }
}

// Export singleton instance
export default new WhatsAppService();
