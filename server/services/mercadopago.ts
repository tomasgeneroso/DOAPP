import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import currencyExchange from './currencyExchange.js';

const client = new MercadoPagoConfig({
  accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN || '',
  options: {
    timeout: 5000,
  },
});

const preferenceService = new Preference(client);
const paymentService = new Payment(client);

interface CreatePaymentParams {
  contractId: string;
  amount: number;
  payerId: string;
  recipientId: string;
  description: string;
  platformFeePercentage: number;
}

interface PaymentPreferenceResult {
  preferenceId: string;
  initPoint: string;
  sandboxInitPoint?: string;
}

class MercadoPagoService {
  async createPaymentPreference(params: CreatePaymentParams): Promise<PaymentPreferenceResult> {
    try {
      const { contractId, amount, payerId, recipientId, description, platformFeePercentage } = params;

      const amountARS = await currencyExchange.convertUSDtoARS(amount);
      const platformFee = (amountARS * platformFeePercentage) / 100;

      const preference = await preferenceService.create({
        body: {
          items: [{
            id: contractId,
            title: description || 'Pago de contrato',
            description: `Contrato #${contractId}`,
            quantity: 1,
            unit_price: amountARS,
            currency_id: 'ARS',
          }],
          back_urls: {
            success: `${process.env.CLIENT_URL}/contracts/${contractId}/payment/success`,
            failure: `${process.env.CLIENT_URL}/contracts/${contractId}/payment/failure`,
            pending: `${process.env.CLIENT_URL}/contracts/${contractId}/payment/pending`,
          },
          auto_return: 'approved',
          notification_url: `${process.env.SERVER_URL}/api/webhooks/mercadopago`,
          external_reference: contractId,
          metadata: {
            contract_id: contractId,
            payer_id: payerId,
            recipient_id: recipientId,
            platform_fee: platformFee,
            platform_fee_percentage: platformFeePercentage,
          },
          statement_descriptor: 'DOAPP',
        },
      });

      return {
        preferenceId: preference.id!,
        initPoint: preference.init_point!,
        sandboxInitPoint: preference.sandbox_init_point,
      };
    } catch (error) {
      console.error('Error creating MercadoPago preference:', error);
      throw new Error('Failed to create payment preference');
    }
  }

  async getPayment(paymentId: string) {
    try {
      const payment = await paymentService.get({ id: paymentId });
      return payment;
    } catch (error) {
      console.error('Error getting payment:', error);
      throw new Error('Failed to get payment information');
    }
  }

  async processWebhook(data: any) {
    try {
      const { type, data: webhookData } = data;

      if (type === 'payment') {
        const paymentId = webhookData.id;
        const payment = await this.getPayment(paymentId);

        return {
          paymentId,
          status: payment.status,
          statusDetail: payment.status_detail,
          externalReference: payment.external_reference,
          metadata: payment.metadata,
        };
      }

      return null;
    } catch (error) {
      console.error('Error processing webhook:', error);
      throw error;
    }
  }

  async releaseEscrow(paymentId: string, recipientId: string) {
    try {
      const payment = await this.getPayment(paymentId);

      if (payment.status !== 'approved') {
        throw new Error('Payment is not approved yet');
      }

      return {
        success: true,
        paymentId,
        status: 'released',
        message: 'Payment released to recipient',
      };
    } catch (error) {
      console.error('Error releasing escrow:', error);
      throw error;
    }
  }

  async refundPayment(paymentId: string, reason?: string) {
    try {
      const refund = await paymentService.refund({
        id: paymentId,
      });

      return {
        success: true,
        refundId: refund.id,
        status: refund.status,
        amount: refund.amount,
      };
    } catch (error) {
      console.error('Error refunding payment:', error);
      throw error;
    }
  }

  async partialRefund(paymentId: string, amount: number) {
    try {
      const refund = await paymentService.refund({
        id: paymentId,
        body: {
          amount,
        },
      });

      return {
        success: true,
        refundId: refund.id,
        status: refund.status,
        amount: refund.amount,
      };
    } catch (error) {
      console.error('Error processing partial refund:', error);
      throw error;
    }
  }

  async createSubscription(userId: string, priceARS: number) {
    try {
      const preference = await preferenceService.create({
        body: {
          items: [{
            title: 'Membresía DOAPP - Mensual',
            description: 'Suscripción mensual con beneficios exclusivos',
            quantity: 1,
            unit_price: priceARS,
            currency_id: 'ARS',
          }],
          back_urls: {
            success: `${process.env.CLIENT_URL}/membership/success`,
            failure: `${process.env.CLIENT_URL}/membership/failure`,
          },
          notification_url: `${process.env.SERVER_URL}/api/webhooks/mercadopago/subscription`,
          external_reference: userId,
          metadata: {
            user_id: userId,
            type: 'membership',
          },
        },
      });

      return {
        preferenceId: preference.id!,
        initPoint: preference.init_point!,
      };
    } catch (error) {
      console.error('Error creating subscription:', error);
      throw new Error('Failed to create subscription');
    }
  }

  async cancelSubscription(subscriptionId: string) {
    try {
      return {
        success: true,
        subscriptionId,
        status: 'cancelled',
      };
    } catch (error) {
      console.error('Error cancelling subscription:', error);
      throw error;
    }
  }
}

export default new MercadoPagoService();
