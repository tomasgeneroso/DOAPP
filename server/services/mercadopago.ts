/**
 * MercadoPago Payment Service
 * Direct integration with MercadoPago Checkout Pro
 * Bank Transfer handled separately
 */

import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';

export type PaymentProvider = 'mercadopago' | 'bank_transfer' | 'binance';

interface CreatePaymentParams {
  amount: number;
  currency: string;
  description: string;
  provider: PaymentProvider;
  metadata?: Record<string, any>;
  successUrl?: string;
  cancelUrl?: string;
  customerEmail?: string;
}

interface CreatePaymentResult {
  paymentId: string;
  checkoutUrl?: string;
  status: 'pending' | 'requires_action' | 'succeeded' | 'failed';
  provider: PaymentProvider;
  providerPaymentId?: string;
}

class MercadoPagoPaymentService {
  private client: Preference | null = null;
  private paymentClient: Payment | null = null;
  private isInitialized: boolean = false;

  constructor() {
    this.initializeMercadoPago();
  }

  private initializeMercadoPago() {
    try {
      const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;

      if (!accessToken) {
        console.warn('⚠️  MERCADOPAGO_ACCESS_TOKEN not configured. Payment processing will not work.');
        this.isInitialized = false;
        return;
      }

      // MercadoPago initialized silently

      const mpConfig = new MercadoPagoConfig({
        accessToken: accessToken,
        options: {
          timeout: 5000,
          idempotencyKey: 'abc',
        },
      });

      this.client = new Preference(mpConfig);
      this.paymentClient = new Payment(mpConfig);
      this.isInitialized = true;
      // MercadoPago ready
    } catch (error) {
      console.error('❌ Error initializing MercadoPago:', error);
      this.isInitialized = false;
    }
  }

  /**
   * Create a payment using the specified provider
   */
  async createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
    const {
      amount,
      currency,
      description,
      provider,
      metadata = {},
      successUrl,
      cancelUrl,
      customerEmail,
    } = params;

    console.log(`💳 Creating payment with ${provider}:`, {
      amount,
      currency,
      description,
    });

    try {
      // Handle bank transfer separately (manual process)
      if (provider === 'bank_transfer') {
        return {
          paymentId: `bank_${Date.now()}`,
          status: 'pending',
          provider: 'bank_transfer',
        };
      }

      // Handle Binance Pay separately
      if (provider === 'binance') {
        return await this.createBinancePayment({
          amount,
          currency,
          description,
          metadata,
          successUrl,
          cancelUrl,
        });
      }

      // Use MercadoPago Checkout Pro
      if (!this.isInitialized || !this.client) {
        throw new Error('MercadoPago is not initialized. Check your MERCADOPAGO_ACCESS_TOKEN.');
      }

      // Create preference following MercadoPago Checkout Pro documentation
      const preferenceData: any = {
        items: [
          {
            title: description,
            quantity: 1,
            unit_price: amount,
            currency_id: currency,
          }
        ],
        // Removed payer email to avoid TEST user validation errors
        // MercadoPago will ask for email in the checkout page
        // payer: customerEmail ? {
        //   email: customerEmail,
        // } : undefined,

        // Payment methods configuration: Only accept single payment (no installments)
        payment_methods: {
          installments: 1, // Only allow 1 installment (single payment)
          default_installments: 1,
        },

        metadata: metadata,
      };

      // Only add back_urls if successUrl is provided
      if (successUrl) {
        preferenceData.back_urls = {
          success: successUrl,
          failure: cancelUrl || successUrl,
          pending: successUrl,
        };
        // Don't use auto_return - let MercadoPago show the confirmation page
        // preferenceData.auto_return = 'approved';
      }

      const preference = await this.client.create({ body: preferenceData });

      console.log(`✅ Payment preference created with MercadoPago:`, preference.id);

      return {
        paymentId: preference.id || `mp_${Date.now()}`,
        checkoutUrl: preference.init_point || preference.sandbox_init_point,
        status: 'pending',
        provider: 'mercadopago',
        providerPaymentId: preference.id,
      };
    } catch (error: any) {
      console.error(`❌ Error creating payment with ${provider}:`, error);
      throw new Error(`Failed to create payment: ${error.message || 'Unknown error'}`);
    }
  }

  /**
   * Create a payment with Binance
   * Simplified: User transfers to Binance ID and uploads proof
   */
  private async createBinancePayment(params: {
    amount: number;
    currency: string;
    description: string;
    metadata?: Record<string, any>;
    successUrl?: string;
    cancelUrl?: string;
  }): Promise<CreatePaymentResult> {
    const { amount, currency, description, metadata } = params;

    const binanceId = process.env.BINANCE_ID;

    if (!binanceId) {
      throw new Error('Binance ID not configured. Set BINANCE_ID in .env');
    }

    try {
      console.log('💰 Creating Binance payment (manual transfer)...');

      // Generate a unique payment ID
      const paymentId = `binance_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      // For Binance, we don't redirect - user must transfer manually and upload proof
      // The checkoutUrl will be null, frontend will show manual instructions
      console.log('✅ Binance payment created (requires manual transfer):', { paymentId, binanceId });

      return {
        paymentId: paymentId,
        checkoutUrl: undefined, // No redirect - manual process
        status: 'pending',
        provider: 'binance',
        providerPaymentId: paymentId,
      };
    } catch (error: any) {
      console.error('❌ Error creating Binance payment:', error);
      throw new Error(`Binance payment failed: ${error.message}`);
    }
  }

  /**
   * Get payment status and details from MercadoPago Payment API
   * This uses the actual payment ID from webhooks to get full payment info
   * including card details, payment method, etc.
   */
  async getPayment(paymentId: string, provider: PaymentProvider) {
    if (!this.isInitialized || !this.paymentClient) {
      throw new Error('MercadoPago is not initialized');
    }

    try {
      // Get payment by ID using Payment API
      const payment = await this.paymentClient.get({ id: paymentId });

      // Extract card info if available
      const cardData = payment.card || {};
      const lastFourDigits = cardData.last_four_digits || null;
      const cardBrand = this.normalizeCardBrand(payment.payment_method_id);

      return {
        id: payment.id?.toString() || paymentId,
        status: payment.status || 'pending',
        status_detail: payment.status_detail,
        amount: payment.transaction_amount || 0,
        transaction_amount: payment.transaction_amount,
        currency: payment.currency_id || 'ARS',
        currency_id: payment.currency_id,
        provider: provider,
        metadata: payment.metadata || {},
        // Payment method details
        payment_type_id: payment.payment_type_id, // credit_card, debit_card, bank_transfer, etc.
        payment_method_id: payment.payment_method_id, // visa, master, amex, etc.
        card_last_four_digits: lastFourDigits,
        card_brand: cardBrand,
        // Additional card info
        card_first_six_digits: cardData.first_six_digits,
        card_expiration_month: cardData.expiration_month,
        card_expiration_year: cardData.expiration_year,
        cardholder_name: cardData.cardholder?.name,
      };
    } catch (error: any) {
      console.error(`Error fetching payment ${paymentId}:`, error);
      throw error;
    }
  }

  /**
   * Normalize card brand name for display
   */
  private normalizeCardBrand(paymentMethodId: string | undefined): string | null {
    if (!paymentMethodId) return null;

    const brandMap: Record<string, string> = {
      'visa': 'Visa',
      'master': 'Mastercard',
      'mastercard': 'Mastercard',
      'amex': 'American Express',
      'american_express': 'American Express',
      'diners': 'Diners Club',
      'naranja': 'Naranja',
      'nativa': 'Nativa',
      'tarshop': 'Tarjeta Shopping',
      'cencosud': 'Cencosud',
      'cabal': 'Cabal',
      'argencard': 'Argencard',
      'cordobesa': 'Cordobesa',
      'cmr': 'CMR Falabella',
      'cordial': 'Cordial',
      'account_money': 'Dinero en cuenta',
      'rapipago': 'Rapipago',
      'pagofacil': 'Pago Fácil',
      'bapropagos': 'BaproPagos',
      'cargavirtual': 'Carga Virtual',
      'redlink': 'Red Link',
    };

    return brandMap[paymentMethodId.toLowerCase()] || paymentMethodId;
  }

  /**
   * Refund a payment
   * Note: Refunds require the actual payment ID, not the preference ID
   * This should be called with the payment_id from the webhook
   */
  async refundPayment(paymentId: string, provider: PaymentProvider, amount?: number) {
    if (!this.isInitialized) {
      throw new Error('MercadoPago is not initialized');
    }

    try {
      if (provider !== 'mercadopago') {
        throw new Error(`Refunds not supported for provider: ${provider}`);
      }

      // MercadoPago refunds require using the Refund API with actual payment ID
      // This is a placeholder - we need to use the Payment API for refunds
      console.warn('⚠️  Refund functionality requires MercadoPago Payment API integration');

      throw new Error('Refund functionality requires payment ID from webhook. Use MercadoPago dashboard for manual refunds.');
    } catch (error: any) {
      console.error(`Error refunding payment ${paymentId}:`, error);
      throw error;
    }
  }

  /**
   * Process webhook from payment provider
   * MercadoPago webhooks send payment notifications
   */
  async processWebhook(provider: PaymentProvider, req: any) {
    if (!this.isInitialized) {
      throw new Error('MercadoPago is not initialized');
    }

    try {
      if (provider !== 'mercadopago') {
        throw new Error(`Webhooks not supported for provider: ${provider}`);
      }

      // MercadoPago sends webhooks with this structure:
      // { type: "payment", data: { id: "payment_id" } }
      const body = req.body;
      const query = req.query;

      console.log(`📨 Webhook received from ${provider}:`, {
        type: body?.type || query?.type,
        topic: query?.topic,
        id: body?.data?.id || query?.id,
      });

      return {
        eventType: body?.type || query?.topic || 'payment',
        paymentId: body?.data?.id || query?.id,
        status: this.mapProviderStatus(body?.action || 'pending'),
        data: body,
      };
    } catch (error: any) {
      console.error(`Error processing webhook for ${provider}:`, error);
      throw error;
    }
  }

  /**
   * Map provider-specific status to unified status
   */
  private mapProviderStatus(providerStatus: string): 'pending' | 'requires_action' | 'succeeded' | 'failed' {
    const statusMap: Record<string, 'pending' | 'requires_action' | 'succeeded' | 'failed'> = {
      // MercadoPago
      'pending': 'pending',
      'approved': 'succeeded',
      'rejected': 'failed',
      'cancelled': 'failed',
      'refunded': 'failed',
      'in_process': 'pending',

      // Generic
      'success': 'succeeded',
      'failed': 'failed',
    };

    return statusMap[providerStatus] || 'pending';
  }

  /**
   * Get available payment providers with their status
   */
  getAvailableProviders() {
    return {
      mercadopago: {
        enabled: !!process.env.MERCADOPAGO_ACCESS_TOKEN,
        name: 'MercadoPago',
        currencies: ['ARS', 'USD', 'BRL'],
        via: 'Direct SDK',
      },
      binance: {
        enabled: !!process.env.BINANCE_ID,
        name: 'Binance Pay',
        currencies: ['USDT', 'BUSD', 'BTC', 'ETH', 'BNB'],
        via: 'Crypto',
      },
      bank_transfer: {
        enabled: true,
        name: 'Transferencia Bancaria',
        currencies: ['ARS'],
        via: 'Manual',
      },
    };
  }
}

// Export singleton instance
export default new MercadoPagoPaymentService();
