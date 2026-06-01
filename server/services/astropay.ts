/**
 * AstroPay Payment Service
 * Hosted-checkout integration for Argentina (ARS) — alternative to MercadoPago.
 *
 * Flow (mirrors MercadoPago service interface):
 *   createPayment() -> returns a redirect `checkoutUrl`
 *   AstroPay redirects the user back to success/cancel URLs
 *   AstroPay calls our webhook -> verifyWebhookSignature() -> we confirm the payment
 *
 * NOTE: The exact AstroPay endpoint paths and request/response field names must be
 * confirmed against your AstroPay merchant dashboard + API docs and the credentials
 * (ASTROPAY_API_KEY / ASTROPAY_SECRET_KEY). The plumbing here is production-shaped:
 * HMAC-SHA256 body signing, config-driven base URL, and the standard deposit-init →
 * redirect → webhook lifecycle. Adjust `DEPOSIT_INIT_PATH` and payload mapping if your
 * merchant contract differs.
 */

import crypto from "crypto";
import { config } from "../config/env.js";

export interface AstroPayCreateParams {
  amount: number;
  currency: string;
  description: string;
  metadata?: Record<string, any>;
  successUrl?: string;
  cancelUrl?: string;
  customerEmail?: string;
}

export interface AstroPayCreateResult {
  paymentId: string;
  checkoutUrl?: string;
  status: "pending" | "requires_action" | "succeeded" | "failed";
  provider: "astropay";
  providerPaymentId?: string;
}

const DEPOSIT_INIT_PATH = "/merchant/v1/deposit/init";

class AstroPayService {
  private get enabled(): boolean {
    return config.astropayEnabled && !!config.astropayApiKey && !!config.astropaySecretKey;
  }

  isAvailable(): boolean {
    return this.enabled;
  }

  /**
   * Sign a JSON body with HMAC-SHA256 using the merchant secret key.
   * AstroPay verifies this signature server-side.
   */
  private sign(payload: string): string {
    return crypto.createHmac("sha256", config.astropaySecretKey).update(payload).digest("hex");
  }

  async createPayment(params: AstroPayCreateParams): Promise<AstroPayCreateResult> {
    if (!this.enabled) {
      throw new Error("AstroPay no está configurado (faltan credenciales o está deshabilitado).");
    }

    const externalId = `doapp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const body = {
      merchant_deposit_id: externalId,
      amount: Number(params.amount.toFixed(2)),
      currency: params.currency,
      country: "AR",
      description: params.description,
      user: {
        email: params.customerEmail || undefined,
      },
      redirect_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: params.metadata || {},
    };

    const payload = JSON.stringify(body);
    const signature = this.sign(payload);

    console.log(`💳 Creating payment with AstroPay: ${params.amount} ${params.currency}`);

    const response = await fetch(`${config.astropayBaseUrl}${DEPOSIT_INIT_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Merchant-Gateway-Api-Key": config.astropayApiKey,
        "Merchant-Gateway-Signature": signature,
      },
      body: payload,
    });

    const data = (await (response.json() as Promise<any>).catch(() => ({}))) as any;

    if (!response.ok) {
      console.error("❌ AstroPay deposit init failed:", response.status, data);
      throw new Error(data?.message || `AstroPay error (${response.status})`);
    }

    const checkoutUrl: string | undefined = data.url || data.redirect_url || data.checkout_url;
    if (!checkoutUrl) {
      throw new Error("AstroPay no devolvió una URL de checkout.");
    }

    return {
      paymentId: data.deposit_id || data.id || externalId,
      checkoutUrl,
      status: "pending",
      provider: "astropay",
      providerPaymentId: data.deposit_id || data.id || externalId,
    };
  }

  /**
   * Verify the HMAC signature AstroPay sends with webhook callbacks.
   * @param rawBody the exact raw request body string received
   * @param signature the signature header sent by AstroPay
   */
  verifyWebhookSignature(rawBody: string, signature: string | undefined): boolean {
    if (!signature) return false;
    const expected = this.sign(rawBody);
    try {
      return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    } catch {
      return false;
    }
  }
}

const astropayService = new AstroPayService();
export default astropayService;
