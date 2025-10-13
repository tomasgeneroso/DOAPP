// @ts-ignore - PayPal SDK has incomplete type definitions
import paypal from "@paypal/checkout-server-sdk";
import { config } from "../config/env";

// PayPal environment setup
function getPayPalEnvironment() {
  const clientId = config.paypalClientId;
  const clientSecret = config.paypalClientSecret;

  if (config.paypalMode === "production") {
    return new paypal.core.LiveEnvironment(clientId, clientSecret);
  }
  return new paypal.core.SandboxEnvironment(clientId, clientSecret);
}

// PayPal client
function getPayPalClient() {
  return new paypal.core.PayPalHttpClient(getPayPalEnvironment());
}

export interface CreateOrderData {
  amount: string;
  currency?: string;
  description?: string;
  contractId: string;
  returnUrl?: string;
  cancelUrl?: string;
}

export interface CaptureOrderResult {
  orderId: string;
  captureId: string;
  status: string;
  payerId: string;
  payerEmail: string;
  amount: string;
  currency: string;
}

/**
 * Create a PayPal order for payment
 */
export async function createPayPalOrder(data: CreateOrderData) {
  const client = getPayPalClient();
  const request = new paypal.orders.OrdersCreateRequest();
  // @ts-ignore - prefer method exists but not in types
  request.prefer("return=representation");

  const { amount, currency = "USD", description, contractId } = data;

  request.requestBody({
    intent: "CAPTURE",
    purchase_units: [
      {
        reference_id: contractId,
        description: description || `Payment for contract ${contractId}`,
        amount: {
          currency_code: currency,
          value: amount,
        },
      },
    ],
    application_context: {
      brand_name: config.isProduction ? "Do Platform" : "Do Platform (Sandbox)",
      landing_page: "NO_PREFERENCE",
      user_action: "PAY_NOW",
      return_url: data.returnUrl || `${config.clientUrl}/payment/success`,
      cancel_url: data.cancelUrl || `${config.clientUrl}/payment/cancel`,
    },
  });

  try {
    const response = await client.execute(request);
    return {
      orderId: response.result.id,
      status: response.result.status,
      links: response.result.links,
    };
  } catch (error: any) {
    console.error("PayPal Order Creation Error:", error);
    throw new Error(`Failed to create PayPal order: ${error.message}`);
  }
}

/**
 * Capture payment for an approved order
 */
export async function capturePayPalOrder(orderId: string): Promise<CaptureOrderResult> {
  const client = getPayPalClient();
  const request = new paypal.orders.OrdersCaptureRequest(orderId);
  // @ts-ignore - prefer method exists but not in types
  request.prefer("return=representation");

  try {
    const response = await client.execute(request);
    const capture = response.result.purchase_units[0].payments.captures[0];
    const payer = response.result.payer;

    return {
      orderId: response.result.id,
      captureId: capture.id,
      status: capture.status,
      payerId: payer.payer_id,
      payerEmail: payer.email_address,
      amount: capture.amount.value,
      currency: capture.amount.currency_code,
    };
  } catch (error: any) {
    console.error("PayPal Order Capture Error:", error);
    throw new Error(`Failed to capture PayPal order: ${error.message}`);
  }
}

/**
 * Get order details
 */
export async function getPayPalOrderDetails(orderId: string) {
  const client = getPayPalClient();
  const request = new paypal.orders.OrdersGetRequest(orderId);

  try {
    const response = await client.execute(request);
    return response.result;
  } catch (error: any) {
    console.error("PayPal Get Order Error:", error);
    throw new Error(`Failed to get PayPal order: ${error.message}`);
  }
}

/**
 * Refund a captured payment
 */
export async function refundPayPalPayment(captureId: string, amount?: string, currency?: string) {
  const client = getPayPalClient();
  const request = new paypal.payments.CapturesRefundRequest(captureId);
  // @ts-ignore - prefer method exists but not in types
  request.prefer("return=representation");

  if (amount && currency) {
    request.requestBody({
      amount: {
        value: amount,
        currency_code: currency,
      },
    });
  }

  try {
    const response = await client.execute(request);
    return {
      refundId: response.result.id,
      status: response.result.status,
      amount: response.result.amount.value,
      currency: response.result.amount.currency_code,
    };
  } catch (error: any) {
    console.error("PayPal Refund Error:", error);
    throw new Error(`Failed to refund PayPal payment: ${error.message}`);
  }
}

/**
 * Calculate platform fee
 */
export function calculatePlatformFee(amount: number): number {
  const feePercentage = config.paypalPlatformFeePercentage;
  return parseFloat(((amount * feePercentage) / 100).toFixed(2));
}

/**
 * Verify webhook signature (for webhook events)
 */
export async function verifyWebhookSignature(
  headers: any,
  body: any,
  webhookId: string
): Promise<boolean> {
  const client = getPayPalClient();
  // @ts-ignore - notifications module exists but not in types
  const request = new paypal.notifications.WebhookVerifySignatureRequest();

  request.requestBody({
    auth_algo: headers["paypal-auth-algo"],
    cert_url: headers["paypal-cert-url"],
    transmission_id: headers["paypal-transmission-id"],
    transmission_sig: headers["paypal-transmission-sig"],
    transmission_time: headers["paypal-transmission-time"],
    webhook_id: webhookId,
    webhook_event: body,
  });

  try {
    const response = await client.execute(request);
    return response.result.verification_status === "SUCCESS";
  } catch (error: any) {
    console.error("PayPal Webhook Verification Error:", error);
    return false;
  }
}

export default {
  createOrder: createPayPalOrder,
  captureOrder: capturePayPalOrder,
  getOrderDetails: getPayPalOrderDetails,
  refundPayment: refundPayPalPayment,
  calculatePlatformFee,
  verifyWebhookSignature,
};
