import cron from 'node-cron';
import { Contract } from '../models/sql/Contract.model.js';
import { Job } from '../models/sql/Job.model.js';
import { User } from '../models/sql/User.model.js';
import { Notification } from '../models/sql/Notification.model.js';
import { BalanceTransaction } from '../models/sql/BalanceTransaction.model.js';
import emailService from '../services/email.js';
import { Op } from 'sequelize';
import { POLITICAS } from '../../shared/constants/policies.js';

/**
 * Horas en awaiting_confirmation antes de confirmar solo y liberar el escrow.
 *
 * 24 y no menos: con el plazo anterior (5 h), un trabajo confirmado a las 22:00 se
 * auto-confirmaba a las 3 de la manana y el cliente perdia su ventana por
 * dormirse. 24 cubre un dia entero sin mirar el telefono sin dejar la plata
 * del trabajador en el aire, y el reclamo sigue abierto unos dias despues de
 * terminado el contrato (T&C 10.7), asi que auto-confirmar no cierra la puerta.
 *
 * El numero vive en shared/constants/policies.ts junto con los terminos (7.6).
 */
export const AUTO_CONFIRM_HOURS = POLITICAS.AUTO_CONFIRMACION_HORAS;

/**
 * Cron job para auto-confirmar contratos después de AUTO_CONFIRM_HOURS en
 * estado awaiting_confirmation.
 *
 * Si la otra parte no responde en ese plazo, el contrato se confirma
 * automáticamente y el pago se libera al trabajador.
 *
 * Se ejecuta cada 5 minutos.
 */
export function startAutoConfirmContractsJob() {
  // Ejecutar cada 5 minutos: */5 * * * *
  cron.schedule('*/5 * * * *', async () => {
    try {
      console.log('🔍 [CRON] Verificando contratos pendientes de confirmación...');

      const now = new Date();
      const limite = new Date(now.getTime() - AUTO_CONFIRM_HOURS * 60 * 60 * 1000);

      // Buscar contratos en awaiting_confirmation que llevan más del plazo
      const contractsToAutoConfirm = await Contract.findAll({
        where: {
          status: 'awaiting_confirmation',
          awaitingConfirmationAt: {
            [Op.lte]: limite,
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
            const workerPaymentAmount = (contract as any).workerPaymentAmount || contract.allocatedAmount || contract.price;

            // Marcar como confirmado por ambos
            contract.clientConfirmed = true;
            contract.clientConfirmedAt = contract.clientConfirmedAt || now;
            contract.doerConfirmed = true;
            contract.doerConfirmedAt = contract.doerConfirmedAt || now;
            contract.status = 'completed';
            (contract as any).completedAt = now;
            contract.paymentStatus = 'pending_payout'; // Pendiente de pago por admin (no automático)
            contract.escrowStatus = 'released';
            // Usar horas propuestas si existen, sino las originales
            contract.actualStartDate = contract.proposedStartTime || contract.startDate;
            contract.actualEndDate = contract.proposedEndTime || contract.endDate;
            await contract.save();

            // Crear transacción de balance como pendiente (el admin debe verificar y procesar el pago)
            if (workerPaymentAmount > 0 && doer) {
              const doerUser = await User.findByPk(doer.id);
              const currentBalance = parseFloat(doerUser?.balanceArs as any) || 0;

              // Crear transacción pendiente (no se acredita aún)
              // Note: balanceAfter = balanceBefore because status is 'pending' - actual credit happens when admin processes
              await BalanceTransaction.create({
                userId: doer.id,
                type: 'payment',
                amount: workerPaymentAmount,
                balanceBefore: currentBalance,
                balanceAfter: currentBalance + workerPaymentAmount, // Expected balance after processing
                description: `Pago pendiente por trabajo completado: ${job?.title || 'Contrato'}`,
                relatedContractId: contract.id,
                status: 'pending', // Pendiente de procesamiento por admin
              });
            }

            // Notificación al cliente
            await Notification.create({
              recipientId: contract.clientId,
              type: 'info',
              category: 'contracts',
              title: 'Contrato confirmado automáticamente',
              message: `El contrato para "${job?.title || 'trabajo'}" se confirmó automáticamente después de ${AUTO_CONFIRM_HOURS} horas sin respuesta. Si algo no salió bien, podés abrir un reclamo hasta ${POLITICAS.DIAS_PARA_DISPUTAR} días después de terminado el trabajo; el pago al trabajador se retiene hasta entonces.`,
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
              type: 'info',
              category: 'contracts',
              title: 'Trabajo confirmado, pago en retención',
              // Decirle "se acredita pronto" y transferirle a los 7 días es la
              // forma más rápida de que escriba a soporte enojado. Se le dice
              // la fecha.
              message: `El contrato para "${job?.title || 'trabajo'}" se confirmó automáticamente. Tu pago de $${workerPaymentAmount?.toLocaleString('es-AR')} se transfiere a partir del ${new Date(now.getTime() + POLITICAS.DIAS_PARA_DISPUTAR * 86_400_000).toLocaleDateString('es-AR')}, cuando vence el plazo del cliente para reclamar.`,
              relatedModel: 'Contract',
              relatedId: contract.id,
              actionText: 'Ver contrato',
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
                  <p>El contrato para <strong>"${job?.title || 'trabajo'}"</strong> se confirmó automáticamente después de ${AUTO_CONFIRM_HOURS} horas sin respuesta.</p>
                  <p>El pago de <strong>$${workerPaymentAmount?.toLocaleString('es-AR')} ARS</strong> queda retenido y se transfiere al trabajador cuando vence el plazo para reclamar.</p>
                  <p style="color: #666; font-size: 12px;">
                    Si algo no salió bien con el trabajo, podés abrir un reclamo hasta ${POLITICAS.DIAS_PARA_DISPUTAR} días después de terminado. Mientras el reclamo esté abierto, el pago no se transfiere.
                  </p>
                `,
              });
            }

            // Email al trabajador
            if (doer?.email) {
              await emailService.sendEmail({
                to: doer.email,
                subject: `⏳ Pago en proceso: ${job?.title || 'Trabajo'}`,
                html: `
                  <h2>Tu pago está siendo procesado</h2>
                  <p>El contrato para <strong>"${job?.title || 'trabajo'}"</strong> ha sido confirmado automáticamente.</p>
                  <p>Tu pago de <strong>$${workerPaymentAmount?.toLocaleString('es-AR')} ARS</strong> está siendo procesado y se acreditará a tu cuenta bancaria pronto.</p>
                  <p>
                    <a href="${process.env.CLIENT_URL}/contracts/${contract.id}"
                       style="display: inline-block; padding: 12px 24px; background-color: #0284c7; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">
                      Ver contrato
                    </a>
                  </p>
                `,
              });
            }

            console.log(`✅ [CRON] Contrato "${contract.id}" auto-confirmado. Pago de $${workerPaymentAmount} pendiente de procesamiento para ${doer?.name}`);
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
