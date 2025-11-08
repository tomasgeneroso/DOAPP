import express from 'express';
import { Payment } from "../models/sql/Payment.model.js";
import { Contract } from "../models/sql/Contract.model.js";
import { Membership } from "../models/sql/Membership.model.js";
import { User } from "../models/sql/User.model.js";
import mercadopago from '../services/mercadopago.js';
import membershipService from '../services/membershipService.js';
import { Op } from 'sequelize';

const router = express.Router();

/**
 * POST /api/webhooks/mercadopago
 * Webhook para recibir notificaciones de MercadoPago
 */
router.post('/mercadopago', async (req, res) => {
  try {
    const { type, data } = req.body;

    console.log('MercadoPago Webhook received:', { type, data });

    // Responder inmediatamente a MercadoPago
    res.status(200).send('OK');

    // Procesar el webhook de forma asíncrona
    if (type === 'payment') {
      await handlePaymentWebhook(data);
    }
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).send('Error processing webhook');
  }
});

/**
 * Manejar webhook de pago
 */
async function handlePaymentWebhook(data: any) {
  try {
    const paymentId = data.id;
    const payment = await mercadopago.getPayment(paymentId);

    const { status, status_detail, external_reference, metadata } = payment;

    // Buscar el pago en nuestra base de datos
    const dbPayment = await Payment.findOne({
      [Op.or]: [
        { mercadopagoPaymentId: paymentId },
        { contractId: external_reference },
      ],
    });

    if (!dbPayment) {
      console.log('Payment not found in database:', paymentId);
      return;
    }

    // Actualizar estado del pago
    dbPayment.mercadopagoPaymentId = paymentId;
    dbPayment.mercadopagoStatus = status;
    dbPayment.mercadopagoStatusDetail = status_detail;

    if (status === 'approved') {
      dbPayment.status = 'held_escrow'; // Pago aprobado, en escrow
      dbPayment.paymentType = 'escrow_deposit';

      // Actualizar contrato
      const contract = await Contract.findByPk(dbPayment.contractId);
      if (contract) {
        contract.paymentStatus = 'escrow';
        contract.paymentDate = new Date();
        contract.status = 'in_progress';
        await contract.save();

        // Send escrow email notification
        const emailService = (await import('../services/email.js')).default;
        const Job = (await import('../models/Job.js')).default;
        const job = await Job.findByPk(contract.job);

        await emailService.sendPaymentEscrowEmail(
          contract.client.toString(),
          contract.doer.toString(),
          contract._id.toString(),
          job?.title || 'Contrato',
          dbPayment.amountARS || 0,
          'ARS'
        );
      }
    } else if (status === 'rejected' || status === 'cancelled') {
      dbPayment.status = 'failed';

      const contract = await Contract.findByPk(dbPayment.contractId);
      if (contract) {
        contract.paymentStatus = 'pending';
        contract.status = 'cancelled';
        await contract.save();
      }
    } else if (status === 'refunded') {
      dbPayment.status = 'refunded';
      dbPayment.refundedAt = new Date();
    }

    await dbPayment.save();

    // Si es un pago de membresía
    if (metadata?.type === 'membership') {
      await handleMembershipPayment(metadata.user_id, paymentId, status);
    }

    console.log('Payment updated successfully:', paymentId, status);
  } catch (error) {
    console.error('Error handling payment webhook:', error);
  }
}

/**
 * Manejar pago de membresía
 */
async function handleMembershipPayment(userId: string, paymentId: string, status: string) {
  try {
    if (status === 'approved') {
      await membershipService.activateMembership(userId, paymentId);
      console.log('Membership activated for user:', userId);
    } else if (status === 'rejected' || status === 'cancelled') {
      const membership = await Membership.findOne({ userId });
      if (membership) {
        membership.status = 'payment_failed';
        await membership.save();
      }

      const user = await User.findByPk(userId);
      if (user) {
        user.hasMembership = false;
        await user.save();
      }
    }
  } catch (error) {
    console.error('Error handling membership payment:', error);
  }
}

/**
 * POST /api/webhooks/mercadopago/subscription
 * Webhook para suscripciones de MercadoPago
 */
router.post('/mercadopago/subscription', async (req, res) => {
  try {
    const { type, data } = req.body;

    console.log('MercadoPago Subscription Webhook received:', { type, data });

    res.status(200).send('OK');

    // Procesar renovaciones automáticas de membresía
    if (type === 'subscription' && data.status === 'authorized') {
      const userId = data.external_reference;
      await membershipService.renewMembership(userId);
    }
  } catch (error) {
    console.error('Error processing subscription webhook:', error);
    res.status(500).send('Error processing webhook');
  }
});

export default router;
