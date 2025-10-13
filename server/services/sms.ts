import twilio from "twilio";
import { config } from "../config/env.js";

interface SMSMessage {
  to: string; // Phone number in E.164 format (e.g., +5491123456789)
  body: string;
}

class SMSService {
  private client: any;
  private initialized = false;
  private fromNumber: string;

  constructor() {
    this.fromNumber = config.twilioPhoneNumber;
    this.initialize();
  }

  private initialize() {
    try {
      const accountSid = config.twilioAccountSid;
      const authToken = config.twilioAuthToken;

      if (accountSid && authToken && this.fromNumber) {
        this.client = twilio(accountSid, authToken);
        this.initialized = true;
        console.log("✅ Twilio SMS initialized");
      } else {
        console.warn("⚠️  Twilio credentials not configured. SMS verification will be disabled.");
      }
    } catch (error) {
      console.error("❌ Failed to initialize Twilio:", error);
    }
  }

  /**
   * Send SMS message
   */
  async sendSMS(options: SMSMessage): Promise<boolean> {
    if (!this.initialized) {
      console.warn("Twilio not initialized. Skipping SMS.");
      return false;
    }

    try {
      await this.client.messages.create({
        from: this.fromNumber,
        to: options.to,
        body: options.body,
      });

      console.log(`✅ SMS sent to ${options.to}`);
      return true;
    } catch (error: any) {
      console.error("Error sending SMS:", error);
      return false;
    }
  }

  /**
   * Send phone verification code via SMS
   */
  async sendVerificationCode(
    phone: string,
    userName: string,
    code: string
  ): Promise<boolean> {
    const message = `Hola ${userName},

Tu código de verificación para DoApp es:

${code}

Este código expirará en 10 minutos.

- Equipo DoApp`;

    return await this.sendSMS({
      to: phone,
      body: message,
    });
  }

  /**
   * Send phone verification code (simple version)
   */
  async sendPhoneVerificationCode(
    phone: string,
    code: string
  ): Promise<boolean> {
    const message = `Tu código de verificación de DoApp es: ${code}

Este código expirará en 10 minutos.`;

    return await this.sendSMS({
      to: phone,
      body: message,
    });
  }

  /**
   * Check if SMS service is available
   */
  isAvailable(): boolean {
    return this.initialized;
  }
}

// Export singleton instance
export default new SMSService();
