import express from 'express';
import { Payment } from "../models/sql/Payment.model.js";
import { Contract } from "../models/sql/Contract.model.js";
import { Membership } from "../models/sql/Membership.model.js";
import { User } from "../models/sql/User.model.js";
import { Notification } from "../models/sql/Notification.model.js";
import mercadopagoService from '../services/mercadopago.js';
import membershipService from '../services/membershipService.js';
import emailService from '../services/email.js';
import logger from '../services/logger.js';
import { Op } from 'sequelize';

const router = express.Router();

/**
 * POST /api/webhooks/mercadopago
 * Webhook para recibir notificaciones de MercadoPago
 */
router.post('/mercadopago', async (req, res) => {
  const startTime = Date.now();

  try {
    const { type, data, action } = req.body;
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';

    // Log webhook recibido
    logger.webhook('mercadopago', type || action || 'unknown', 'Webhook received', {
      data: { type, action, dataId: data?.id },
      ip
    });

    // Responder inmediatamente a MercadoPago (evitar timeout)
    res.status(200).send('OK');

    // Procesar el webhook de forma asíncrona
    if (type === 'payment' || action === 'payment.created' || action === 'payment.updated') {
      await handlePaymentWebhook(data, ip);
    } else if (type === 'subscription' || action?.startsWith('subscription')) {
      await handleSubscriptionWebhook(data, action, ip);
    }

    // Log tiempo de procesamiento
    const processingTime = Date.now() - startTime;
    logger.webhook('mercadopago', type || action || 'unknown', `Webhook processed in ${processingTime}ms`, {
      data: { processingTime, dataId: data?.id }
    });
  } catch (error: any) {
    logger.error('webhooks', 'Error processing MercadoPago webhook', {
      data: { error: error.message, stack: error.stack },
      ip: req.ip
    });
    // Ya respondimos 200, solo loguear el error
  }
});

/**
 * Manejar webhook de pago
 */
async function handlePaymentWebhook(data: any, ip: string) {
  try {
    const paymentId = data.id;

    logger.payment('WEBHOOK_PROCESS', `Processing payment webhook for ID: ${paymentId}`, {
      paymentId: paymentId?.toString()
    });

    const mpPaymentData = await mercadopagoService.getPayment(paymentId, 'mercadopago');

    const { status, metadata, transaction_amount, currency_id } = mpPaymentData;
    const external_reference = metadata?.external_reference;
    const status_detail = mpPaymentData.status_detail || status;

    // Extract payment method details
    const paymentMethodInfo = {
      payment_type_id: mpPaymentData.payment_type_id,
      payment_method_id: mpPaymentData.payment_method_id,
      card_last_four_digits: mpPaymentData.card_last_four_digits,
      card_brand: mpPaymentData.card_brand,
    };

    logger.payment('WEBHOOK_DATA', `MercadoPago payment data received`, {
      paymentId: paymentId?.toString(),
      status,
      data: { external_reference, amount: transaction_amount, currency: currency_id, ...paymentMethodInfo }
    });

    // Buscar el pago en nuestra base de datos
    const dbPayment = await Payment.findOne({
      where: {
        [Op.or]: [
          { mercadopagoPaymentId: paymentId?.toString() },
          { contractId: external_reference },
        ],
      },
    });

    // Si no se encuentra por contractId, buscar por metadata.job_id
    let foundPayment = dbPayment;
    if (!foundPayment && metadata?.job_id) {
      const { Job } = await import('../models/sql/Job.model.js');
      const job = await Job.findByPk(metadata.job_id);
      if (job && job.publicationPaymentId) {
        foundPayment = await Payment.findByPk(job.publicationPaymentId);
      }
    }

    if (!foundPayment) {
      logger.warn('webhooks', `Payment not found in database: ${paymentId}`, {
        data: { mpPaymentId: paymentId, external_reference }
      });
      return;
    }

    // Actualizar estado del pago
    const previousStatus = foundPayment.status;
    foundPayment.mercadopagoPaymentId = paymentId?.toString();
    foundPayment.mercadopagoStatus = status;
    foundPayment.mercadopagoStatusDetail = status_detail;

    // Save payment method details
    foundPayment.paymentTypeId = paymentMethodInfo.payment_type_id;
    foundPayment.paymentMethodId = paymentMethodInfo.payment_method_id;
    foundPayment.cardLastFourDigits = paymentMethodInfo.card_last_four_digits;
    foundPayment.cardBrand = paymentMethodInfo.card_brand;

    if (status === 'succeeded' || status === 'approved') {
      await handleApprovedPayment(foundPayment, metadata);
    } else if (status === 'rejected' || status === 'cancelled') {
      await handleRejectedPayment(foundPayment);
    } else if (status === 'refunded') {
      await handleRefundedPayment(foundPayment);
    } else if (status === 'pending' || status === 'in_process') {
      foundPayment.status = 'processing';
      await foundPayment.save();

      logger.payment('PENDING', `Payment pending: ${paymentId}`, {
        paymentId: foundPayment.id?.toString(),
        status: 'processing'
      });
    }

    logger.payment('STATUS_CHANGE', `Payment status changed: ${previousStatus} → ${foundPayment.status}`, {
      paymentId: foundPayment.id?.toString(),
      status: foundPayment.status,
      data: { previousStatus, newStatus: foundPayment.status, mpStatus: status }
    });

    // Si es un pago de membresía
    if (metadata?.type === 'membership') {
      await handleMembershipPayment(metadata.user_id, paymentId, status);
    }
  } catch (error: any) {
    logger.error('webhooks', `Error handling payment webhook: ${error.message}`, {
      data: { error: error.message, stack: error.stack, paymentId: data?.id }
    });
  }
}

/**
 * Manejar pago aprobado
 */
async function handleApprovedPayment(payment: any, metadata: any) {
  const { Job } = await import('../models/sql/Job.model.js');

  // Check if it's a job publication payment
  if (metadata?.type === 'job_publication' || payment.paymentType === 'job_publication') {
    payment.status = 'completed';
    await payment.save();

    const job = await Job.findOne({ where: { publicationPaymentId: payment.id } });
    if (job) {
      job.status = 'open';
      job.publicationPaid = true;
      job.publicationPaidAt = new Date();
      await job.save();

      // Notificación in-app
      await Notification.create({
        recipientId: payment.payerId,
        type: "success",
        category: "payment",
        title: "Trabajo publicado",
        message: `Tu trabajo "${job.title}" ha sido publicado exitosamente.`,
        relatedModel: "Job",
        relatedId: job.id,
        sentVia: ["in_app"],
      });

      // Email de confirmación
      const user = await User.findByPk(payment.payerId);
      if (user) {
        await emailService.sendJobUpdateNotification(
          payment.payerId.toString(),
          job.title,
          'Tu trabajo ha sido publicado exitosamente y ya está visible para los doers.',
          job.id.toString()
        );
      }

      logger.payment('JOB_PUBLISHED', `Job published via webhook: ${job.id}`, {
        paymentId: payment.id?.toString(),
        data: { jobId: job.id, jobTitle: job.title },
        userId: payment.payerId?.toString()
      });
    }
  } else {
    // Contract escrow payment
    payment.status = 'held_escrow';
    await payment.save();

    const contract = await Contract.findByPk(payment.contractId);
    if (contract) {
      contract.paymentStatus = 'escrow';
      contract.paymentDate = new Date();
      contract.status = 'in_progress';
      await contract.save();

      const job = await Job.findByPk(contract.jobId);
      const jobTitle = job?.title || 'Contrato';

      // Email de escrow a ambas partes
      await emailService.sendPaymentEscrowEmail(
        contract.clientId.toString(),
        contract.doerId.toString(),
        contract.id.toString(),
        jobTitle,
        payment.amount || 0,
        'ARS'
      );

      // Notificaciones in-app
      await Promise.all([
        Notification.create({
          recipientId: contract.clientId,
          type: "success",
          category: "payment",
          title: "Pago en escrow",
          message: `Tu pago de $${payment.amount} para "${jobTitle}" está asegurado.`,
          relatedModel: "Contract",
          relatedId: contract.id,
          sentVia: ["in_app", "push"],
        }),
        Notification.create({
          recipientId: contract.doerId,
          type: "info",
          category: "contract",
          title: "Pago asegurado",
          message: `El pago de $${payment.amount} para "${jobTitle}" está en escrow. ¡Puedes comenzar!`,
          relatedModel: "Contract",
          relatedId: contract.id,
          sentVia: ["in_app", "push"],
        })
      ]);

      logger.payment('ESCROW_HELD', `Payment held in escrow for contract: ${contract.id}`, {
        paymentId: payment.id?.toString(),
        amount: payment.amount,
        data: { contractId: contract.id, jobTitle },
        userId: contract.clientId?.toString()
      });
    }
  }
}

/**
 * Manejar pago rechazado
 */
async function handleRejectedPayment(payment: any) {
  payment.status = 'failed';
  await payment.save();

  const contract = await Contract.findByPk(payment.contractId);
  if (contract) {
    contract.paymentStatus = 'pending';
    // No cancelar automáticamente el contrato, solo marcar el pago como fallido
    await contract.save();

    const { Job } = await import('../models/sql/Job.model.js');
    const job = await Job.findByPk(contract.jobId);
    const jobTitle = job?.title || 'Contrato';

    // Notificar al cliente
    await Notification.create({
      recipientId: contract.clientId,
      type: "error",
      category: "payment",
      title: "Pago rechazado",
      message: `El pago para "${jobTitle}" fue rechazado. Por favor, intenta con otro método de pago.`,
      relatedModel: "Contract",
      relatedId: contract.id,
      sentVia: ["in_app", "push", "email"],
    });

    // Email de pago rechazado
    const user = await User.findByPk(contract.clientId);
    if (user) {
      await emailService.sendPaymentNotification(
        contract.clientId.toString(),
        payment.amount || 0,
        `Tu pago para "${jobTitle}" fue rechazado. Por favor, intenta nuevamente con otro método de pago.`,
        payment.id?.toString()
      );
    }

    logger.payment('REJECTED', `Payment rejected for contract: ${contract.id}`, {
      paymentId: payment.id?.toString(),
      status: 'failed',
      data: { contractId: contract.id, reason: payment.mercadopagoStatusDetail },
      userId: contract.clientId?.toString()
    });
  }
}

/**
 * Manejar reembolso
 */
async function handleRefundedPayment(payment: any) {
  payment.status = 'refunded';
  payment.refundedAt = new Date();
  await payment.save();

  const contract = await Contract.findByPk(payment.contractId);
  if (contract) {
    const { Job } = await import('../models/sql/Job.model.js');
    const job = await Job.findByPk(contract.jobId);
    const jobTitle = job?.title || 'Contrato';

    // Notificar a ambas partes
    await Promise.all([
      Notification.create({
        recipientId: contract.clientId,
        type: "info",
        category: "payment",
        title: "Reembolso procesado",
        message: `Se ha procesado el reembolso de $${payment.amount} para "${jobTitle}".`,
        relatedModel: "Contract",
        relatedId: contract.id,
        sentVia: ["in_app", "push", "email"],
      }),
      Notification.create({
        recipientId: contract.doerId,
        type: "info",
        category: "payment",
        title: "Pago reembolsado",
        message: `El pago de "${jobTitle}" ha sido reembolsado al cliente.`,
        relatedModel: "Contract",
        relatedId: contract.id,
        sentVia: ["in_app"],
      })
    ]);

    // Email de reembolso
    const client = await User.findByPk(contract.clientId);
    if (client) {
      await emailService.sendBalanceRefundEmail(
        client.email,
        client.name,
        payment.amount || 0,
        `Reembolso del contrato "${jobTitle}"`,
        client.balance || 0
      );
    }

    logger.payment('REFUNDED', `Payment refunded for contract: ${contract.id}`, {
      paymentId: payment.id?.toString(),
      amount: payment.amount,
      data: { contractId: contract.id, jobTitle },
      userId: contract.clientId?.toString()
    });
  }
}

/**
 * Manejar pago de membresía
 */
async function handleMembershipPayment(userId: string, paymentId: string, status: string) {
  try {
    const user = await User.findByPk(userId);

    if (status === 'approved') {
      await membershipService.activateMembership(userId, paymentId);

      if (user) {
        // Notificación in-app
        await Notification.create({
          recipientId: parseInt(userId),
          type: "success",
          category: "membership",
          title: "¡Membresía activada!",
          message: "Tu membresía PRO ha sido activada. ¡Disfruta de los beneficios!",
          sentVia: ["in_app", "push", "email"],
        });

        // Email de bienvenida PRO
        await emailService.sendEmail({
          to: user.email,
          subject: "¡Bienvenido a PRO! - Doers",
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                .benefit { background: white; padding: 15px; margin: 10px 0; border-left: 4px solid #f59e0b; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>🌟 ¡Bienvenido a PRO!</h1>
                </div>
                <div class="content">
                  <p>Hola ${user.name},</p>
                  <p>¡Tu membresía PRO ha sido activada exitosamente!</p>
                  <h3>Tus beneficios:</h3>
                  <div class="benefit">✅ 3 contratos mensuales con solo 3% de comisión</div>
                  <div class="benefit">✅ Badge PRO visible en tu perfil</div>
                  <div class="benefit">✅ Prioridad en búsquedas</div>
                  <div class="benefit">✅ Estadísticas avanzadas</div>
                  <div class="benefit">✅ Soporte prioritario</div>
                  <p>¡Comienza a disfrutar de tus beneficios ahora!</p>
                </div>
              </div>
            </body>
            </html>
          `
        });
      }

      logger.membership('ACTIVATED', `Membership activated for user: ${userId}`, {
        userId,
        data: { paymentId }
      });
    } else if (status === 'rejected' || status === 'cancelled') {
      const membership = await Membership.findOne({ where: { userId } });
      if (membership) {
        membership.status = 'payment_failed';
        await membership.save();
      }

      if (user) {
        user.hasMembership = false;
        await user.save();

        // Notificación de pago fallido
        await Notification.create({
          recipientId: parseInt(userId),
          type: "error",
          category: "membership",
          title: "Pago de membresía fallido",
          message: "No pudimos procesar el pago de tu membresía. Por favor, intenta nuevamente.",
          sentVia: ["in_app", "push", "email"],
        });
      }

      logger.membership('PAYMENT_FAILED', `Membership payment failed for user: ${userId}`, {
        userId,
        data: { paymentId, status }
      });
    }
  } catch (error: any) {
    logger.error('webhooks', `Error handling membership payment: ${error.message}`, {
      data: { error: error.message, userId, paymentId },
      userId
    });
  }
}

/**
 * Manejar webhook de suscripción
 */
async function handleSubscriptionWebhook(data: any, action: string, ip: string) {
  try {
    logger.webhook('mercadopago', 'subscription', `Processing subscription webhook: ${action}`, {
      data: { action, subscriptionId: data?.id },
      ip
    });

    if (action === 'subscription.authorized' || data?.status === 'authorized') {
      const userId = data.external_reference;
      if (userId) {
        await membershipService.renewMembership(userId);

        const user = await User.findByPk(userId);
        if (user) {
          await Notification.create({
            recipientId: parseInt(userId),
            type: "success",
            category: "membership",
            title: "Membresía renovada",
            message: "Tu membresía PRO ha sido renovada automáticamente.",
            sentVia: ["in_app", "email"],
          });
        }

        logger.membership('RENEWED', `Membership renewed for user: ${userId}`, {
          userId,
          data: { subscriptionId: data?.id }
        });
      }
    } else if (action === 'subscription.cancelled' || data?.status === 'cancelled') {
      const userId = data.external_reference;
      if (userId) {
        const membership = await Membership.findOne({ where: { userId } });
        if (membership) {
          membership.status = 'cancelled';
          membership.cancelledAt = new Date();
          await membership.save();
        }

        const user = await User.findByPk(userId);
        if (user) {
          await Notification.create({
            recipientId: parseInt(userId),
            type: "info",
            category: "membership",
            title: "Membresía cancelada",
            message: "Tu membresía PRO ha sido cancelada. Seguirás teniendo acceso hasta el fin del período actual.",
            sentVia: ["in_app", "email"],
          });
        }

        logger.membership('CANCELLED', `Membership cancelled for user: ${userId}`, {
          userId,
          data: { subscriptionId: data?.id }
        });
      }
    }
  } catch (error: any) {
    logger.error('webhooks', `Error handling subscription webhook: ${error.message}`, {
      data: { error: error.message, action }
    });
  }
}

/**
 * POST /api/webhooks/mercadopago/subscription
 * Webhook para suscripciones de MercadoPago (legacy endpoint)
 */
router.post('/mercadopago/subscription', async (req, res) => {
  try {
    const { type, data, action } = req.body;
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';

    logger.webhook('mercadopago', 'subscription', 'Subscription webhook received (legacy)', {
      data: { type, action, dataId: data?.id },
      ip: ip as string
    });

    res.status(200).send('OK');

    // Procesar usando el handler unificado
    await handleSubscriptionWebhook(data, action || type, ip as string);
  } catch (error: any) {
    logger.error('webhooks', `Error processing subscription webhook: ${error.message}`, {
      data: { error: error.message }
    });
    res.status(500).send('Error processing webhook');
  }
});

export default router;
