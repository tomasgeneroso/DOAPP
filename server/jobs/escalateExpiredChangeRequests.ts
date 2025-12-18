import cron from 'node-cron';
import { ContractChangeRequest } from '../models/sql/ContractChangeRequest.model.js';
import { Contract } from '../models/sql/Contract.model.js';
import { Ticket } from '../models/sql/Ticket.model.js';
import emailService from '../services/email.js';
import { Op } from 'sequelize';

/**
 * Cron job para escalar solicitudes de cambio de contrato sin respuesta
 * Se ejecuta cada 6 horas para verificar solicitudes pendientes
 */
export function startEscalateExpiredChangeRequestsJob() {
  // Ejecutar cada 6 horas: 0 */6 * * *
  cron.schedule('0 */6 * * *', async () => {
    try {
      console.log('🔍 [CRON] Verificando solicitudes de cambio de contrato expiradas...');

      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

      // Buscar solicitudes pendientes creadas hace más de 2 días
      const expiredRequests = await (ContractChangeRequest as any).findAll({
        where: {
          status: 'pending',
          createdAt: { [Op.lte]: twoDaysAgo },
        },
        include: ['contract'],
      });

      if (expiredRequests.length === 0) {
        console.log('✅ [CRON] No hay solicitudes expiradas para escalar');
        return;
      }

      console.log(`⚠️  [CRON] Encontradas ${expiredRequests.length} solicitudes expiradas`);

      let escalatedCount = 0;

      for (const request of expiredRequests) {
        try {
          const contract = request.contract as any;
          const requesterUser =
            request.requestedBy.toString() === contract.client._id.toString()
              ? contract.client
              : contract.doer;
          const otherUser =
            request.requestedBy.toString() === contract.client._id.toString()
              ? contract.doer
              : contract.client;
          const jobTitle = contract.job?.title || 'Contrato';

          // Crear ticket de soporte
          const ticket = await Ticket.create({
            user: request.requestedBy,
            subject: `Solicitud de ${request.type === 'cancel' ? 'cancelación' : 'modificación'} sin respuesta - ${jobTitle}`,
            message: `
Solicitud automáticamente escalada después de 2 días sin respuesta.

**Tipo:** ${request.type === 'cancel' ? 'Cancelación' : 'Modificación'}
**Razón:** ${request.reason}

**Contrato:** ${contract._id}
**Cliente:** ${contract.client.name} (${contract.client.email})
**Doer:** ${contract.doer.name} (${contract.doer.email})

**Solicitado por:** ${requesterUser.name}
**Sin respuesta de:** ${otherUser.name}

**Fecha de solicitud:** ${new Date(request.createdAt).toLocaleString('es-AR')}
            `.trim(),
            category: 'contract_issue',
            priority: 'high',
            status: 'open',
          });

          // Actualizar solicitud
          request.status = 'escalated_to_support';
          request.escalatedAt = new Date();
          request.supportTicketId = (ticket as any).id;
          await request.save();

          // Enviar emails a ambas partes
          await emailService.sendEmail({
            to: requesterUser.email,
            subject: `Tu solicitud ha sido escalada a soporte - ${jobTitle}`,
            html: `
              <h2>Tu solicitud ha sido escalada a soporte</h2>
              <p>No recibimos respuesta de la otra parte en 2 días, por lo que tu solicitud de ${
                request.type === 'cancel' ? 'cancelación' : 'modificación'
              } para <strong>${jobTitle}</strong> ha sido escalada a nuestro equipo de soporte.</p>

              <p>Nuestro equipo revisará el caso y se pondrá en contacto contigo pronto.</p>

              <p><strong>Número de ticket:</strong> #${(ticket as any).id}</p>

              <p>
                <a href="${process.env.CLIENT_URL}/support/tickets/${(ticket as any).id}"
                   style="display: inline-block; padding: 12px 24px; background-color: #0ea5e9; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">
                  Ver ticket de soporte
                </a>
              </p>
            `,
          });

          await emailService.sendEmail({
            to: otherUser.email,
            subject: `Solicitud escalada a soporte - ${jobTitle}`,
            html: `
              <h2>Una solicitud de cambio de contrato ha sido escalada a soporte</h2>
              <p><strong>${requesterUser.name}</strong> había solicitado ${
              request.type === 'cancel' ? 'cancelar' : 'modificar'
            } el contrato para <strong>${jobTitle}</strong>, pero no recibimos tu respuesta en 2 días.</p>

              <p>La solicitud ha sido escalada a nuestro equipo de soporte para su revisión.</p>

              <p><strong>Razón de la solicitud:</strong></p>
              <p>${request.reason}</p>

              <p><strong>Número de ticket:</strong> #${(ticket as any).id}</p>

              <p>Si deseas proporcionar información adicional, puedes responder en el ticket de soporte.</p>

              <p>
                <a href="${process.env.CLIENT_URL}/support/tickets/${(ticket as any).id}"
                   style="display: inline-block; padding: 12px 24px; background-color: #0ea5e9; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">
                  Ver ticket de soporte
                </a>
              </p>
            `,
          });

          escalatedCount++;
          console.log(
            `✅ [CRON] Escalada solicitud ${request._id} → Ticket ${(ticket as any).id}`
          );
        } catch (error) {
          console.error(`❌ [CRON] Error escalando solicitud ${request._id}:`, error);
        }
      }

      console.log(
        `🎯 [CRON] Proceso completado: ${escalatedCount}/${expiredRequests.length} solicitudes escaladas`
      );
    } catch (error) {
      console.error('❌ [CRON] Error en job de escalación:', error);
    }
  });

  console.log('✅ [CRON] Job de escalación de solicitudes iniciado (cada 6 horas)');
}
