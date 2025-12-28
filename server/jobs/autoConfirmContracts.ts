import cron from 'node-cron';
import { Contract } from '../models/sql/Contract.model.js';
import { Job } from '../models/sql/Job.model.js';
import { User } from '../models/sql/User.model.js';
import { Notification } from '../models/sql/Notification.model.js';
import { BalanceTransaction } from '../models/sql/BalanceTransaction.model.js';
import emailService from '../services/email.js';
import { Op } from 'sequelize';

/**
 * Cron job para auto-confirmar contratos después de 2 horas en estado awaiting_confirmation
 *
 * Si ambas partes no confirman dentro de 2 horas, el contrato se confirma automáticamente
 * y el pago se libera al trabajador.
 *
 * Se ejecuta cada 5 minutos.
 */
export function startAutoConfirmContractsJob() {
  // Ejecutar cada 5 minutos: */5 * * * *
  cron.schedule('*/5 * * * *', async () => {
    try {
      console.log('🔍 [CRON] Verificando contratos pendientes de confirmación...');

      const now = new Date();
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

      // Buscar contratos en awaiting_confirmation que llevan más de 2 horas
      const contractsToAutoConfirm = await Contract.findAll({
        where: {
          status: 'awaiting_confirmation',
          awaitingConfirmationAt: {
            [Op.lte]: twoHoursAgo,
          },
          // Al menos uno no ha confirmado
          [Op.or]: [
            { clientConfirmed: false },
            { doerConfirmed: false },
          ],
        },
        include: [
          {
            model: Job,
            as: 'job',
            attributes: ['id', 'title', 'price'],
          },
          {
            model: User,
            as: 'client',
            attributes: ['id', 'name', 'email'],
          },
          {
            model: User,
            as: 'doer',
            attributes: ['id', 'name', 'email'],
          },
        ],
      });

      if (contractsToAutoConfirm.length > 0) {
        console.log(`⏰ [CRON] Encontrados ${contractsToAutoConfirm.length} contratos para auto-confirmar`);

        for (const contract of contractsToAutoConfirm) {
          try {
            const job = contract.job;
            const client = contract.client as any;
            const doer = contract.doer as any;

            // Calcular el monto a pagar al trabajador
            const workerPaymentAmount = contract.workerPaymentAmount || contract.allocatedAmount || contract.price;

            // Marcar como confirmado por ambos
            contract.clientConfirmed = true;
            contract.clientConfirmedAt = contract.clientConfirmedAt || now;
            contract.doerConfirmed = true;
            contract.doerConfirmedAt = contract.doerConfirmedAt || now;
            contract.status = 'completed';
            contract.completedAt = now;
            contract.escrowStatus = 'released';
            await contract.save();

            // Liberar fondos al trabajador
            if (workerPaymentAmount > 0 && doer) {
              // Obtener el balance actual del trabajador
              const doerUser = await User.findByPk(doer.id);
              const previousBalance = parseFloat(doerUser?.balance as any) || 0;
              const newBalance = previousBalance + workerPaymentAmount;

              await User.update(
                { balance: newBalance },
                { where: { id: doer.id } }
              );

              // Crear transacción de balance
              await BalanceTransaction.create({
                userId: doer.id,
                type: 'payment',
                amount: workerPaymentAmount,
                previousBalance: previousBalance,
                newBalance: newBalance,
                description: `Pago por trabajo completado: ${job?.title || 'Contrato'}`,
                relatedModel: 'Contract',
                relatedId: contract.id,
                status: 'completed',
              });
            }

            // Notificación al cliente
            await Notification.create({
              recipientId: contract.clientId,
              type: 'info',
              category: 'contracts',
              title: 'Contrato confirmado automáticamente',
              message: `El contrato para "${job?.title || 'trabajo'}" ha sido confirmado automáticamente después de 2 horas. El pago ha sido liberado al trabajador.`,
              relatedModel: 'Contract',
              relatedId: contract.id,
              actionText: 'Ver contrato',
              data: {
                contractId: contract.id,
                autoConfirmed: true,
              },
              read: false,
            });

            // Notificación al trabajador
            await Notification.create({
              recipientId: contract.doerId,
              type: 'success',
              category: 'contracts',
              title: '¡Pago recibido!',
              message: `El contrato para "${job?.title || 'trabajo'}" ha sido confirmado automáticamente. Has recibido $${workerPaymentAmount?.toLocaleString('es-AR')} en tu balance.`,
              relatedModel: 'Contract',
              relatedId: contract.id,
              actionText: 'Ver balance',
              data: {
                contractId: contract.id,
                amount: workerPaymentAmount,
                autoConfirmed: true,
              },
              read: false,
            });

            // Email al cliente
            if (client?.email) {
              await emailService.sendEmail({
                to: client.email,
                subject: `✅ Contrato confirmado automáticamente: ${job?.title || 'Trabajo'}`,
                html: `
                  <h2>Contrato confirmado automáticamente</h2>
                  <p>El contrato para <strong>"${job?.title || 'trabajo'}"</strong> ha sido confirmado automáticamente después de 2 horas sin respuesta.</p>
                  <p>El pago de <strong>$${workerPaymentAmount?.toLocaleString('es-AR')} ARS</strong> ha sido liberado al trabajador.</p>
                  <p style="color: #666; font-size: 12px;">
                    Si tienes algún problema con el trabajo realizado, puedes abrir una disputa dentro de las próximas 24 horas.
                  </p>
                `,
              });
            }

            // Email al trabajador
            if (doer?.email) {
              await emailService.sendEmail({
                to: doer.email,
                subject: `💰 ¡Pago recibido! ${job?.title || 'Trabajo'}`,
                html: `
                  <h2>¡Has recibido un pago!</h2>
                  <p>El contrato para <strong>"${job?.title || 'trabajo'}"</strong> ha sido confirmado automáticamente.</p>
                  <p>Se han acreditado <strong>$${workerPaymentAmount?.toLocaleString('es-AR')} ARS</strong> a tu balance.</p>
                  <p>
                    <a href="${process.env.CLIENT_URL}/balance"
                       style="display: inline-block; padding: 12px 24px; background-color: #22c55e; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">
                      Ver mi balance
                    </a>
                  </p>
                `,
              });
            }

            console.log(`✅ [CRON] Contrato "${contract.id}" auto-confirmado. Pago de $${workerPaymentAmount} liberado a ${doer?.name}`);
          } catch (error) {
            console.error(`❌ [CRON] Error auto-confirmando contrato ${contract.id}:`, error);
          }
        }
      } else {
        console.log('✅ [CRON] No hay contratos pendientes de auto-confirmación');
      }

      console.log(`🎯 [CRON] Proceso de auto-confirmación completado: ${contractsToAutoConfirm.length} contratos procesados`);
    } catch (error) {
      console.error('❌ [CRON] Error en job de auto-confirmación:', error);
    }
  });

  console.log('✅ [CRON] Job de auto-confirmación de contratos iniciado (cada 5 minutos)');
}
