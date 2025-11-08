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
  console.log("🔵 [PAYPAL SERVICE] Creating PayPal order...");
  console.log("🔵 [PAYPAL SERVICE] Amount:", data.amount, data.currency || "USD");
  console.log("🔵 [PAYPAL SERVICE] ContractId:", data.contractId);

  const client = getPayPalClient();
  const request = new paypal.orders.OrdersCreateRequest();
  request.prefer("return=representation");

  const { amount, currency = "USD", description, contractId } = data;

  const requestBody = {
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
  };

  console.log("🔵 [PAYPAL SERVICE] Request body:", JSON.stringify(requestBody, null, 2));
  request.requestBody(requestBody);

  try {
    const response = await client.execute(request);
    console.log("✅ [PAYPAL SERVICE] Order created successfully");
    console.log("✅ [PAYPAL SERVICE] OrderId:", response.result.id);
    console.log("✅ [PAYPAL SERVICE] Status:", response.result.status);
    console.log("✅ [PAYPAL SERVICE] Links:", response.result.links?.map((l: any) => `${l.rel}: ${l.href}`));

    return {
      orderId: response.result.id,
      status: response.result.status,
      links: response.result.links,
    };
  } catch (error: any) {
    console.error("❌ [PAYPAL SERVICE] Order Creation Error:", error);
    console.error("❌ [PAYPAL SERVICE] Error details:", JSON.stringify(error, null, 2));
    throw new Error(`Failed to create PayPal order: ${error.message}`);
  }
}

/**
 * Capture payment for an approved order
 */
export async function capturePayPalOrder(orderId: string): Promise<CaptureOrderResult> {
  console.log("🟢 [PAYPAL SERVICE] Capturing PayPal order...");
  console.log("🟢 [PAYPAL SERVICE] OrderId:", orderId);

  const client = getPayPalClient();
  const request = new paypal.orders.OrdersCaptureRequest(orderId);
  request.prefer("return=representation");

  try {
    console.log("🟢 [PAYPAL SERVICE] Executing capture request...");
    const response = await client.execute(request);

    console.log("🟢 [PAYPAL SERVICE] Capture response received");
    console.log("🟢 [PAYPAL SERVICE] Response status:", response.statusCode);
    console.log("🟢 [PAYPAL SERVICE] Full response:", JSON.stringify(response.result, null, 2));

    const capture = response.result.purchase_units[0].payments.captures[0];
    const payer = response.result.payer;

    console.log("✅ [PAYPAL SERVICE] Capture successful");
    console.log("✅ [PAYPAL SERVICE] CaptureId:", capture.id);
    console.log("✅ [PAYPAL SERVICE] Capture Status:", capture.status);
    console.log("✅ [PAYPAL SERVICE] Amount:", capture.amount.value, capture.amount.currency_code);
    console.log("✅ [PAYPAL SERVICE] PayerId:", payer.payer_id);
    console.log("✅ [PAYPAL SERVICE] PayerEmail:", payer.email_address);

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
    console.error("❌ [PAYPAL SERVICE] Order Capture Error:", error);
    console.error("❌ [PAYPAL SERVICE] Error message:", error.message);
    console.error("❌ [PAYPAL SERVICE] Error details:", JSON.stringify(error, null, 2));

    // Log additional error information if available
    if (error.statusCode) {
      console.error("❌ [PAYPAL SERVICE] HTTP Status Code:", error.statusCode);
    }
    if (error.headers) {
      console.error("❌ [PAYPAL SERVICE] Response headers:", error.headers);
    }

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
