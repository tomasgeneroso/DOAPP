import { User } from '../models/sql/User.model.js';
import { Contract } from '../models/sql/Contract.model.js';
import { Job } from '../models/sql/Job.model.js';

/**
 * Servicio para sincronizar contratos con calendarios de usuarios
 * Agrega eventos a Google Calendar, Outlook, etc. vía iCalendar/web hooks
 */

interface CalendarEvent {
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
  location?: string;
  attendees?: string[];
}

export async function addContractToCalendars(contractId: string) {
  try {
    const contract = await Contract.findByPk(contractId, {
      include: [
        { model: Job, as: 'job', attributes: ['id', 'title', 'description', 'location', 'startDate', 'endDate'] },
        { model: User, as: 'client', attributes: ['id', 'email', 'name'] },
        { model: User, as: 'doer', attributes: ['id', 'email', 'name'] }
      ]
    });

    if (!contract) {
      console.error(`Contract ${contractId} not found`);
      return;
    }

    const job = contract.job as any;
    const client = contract.client as any;
    const doer = contract.doer as any;

    // Crear evento de contrato
    const eventTitle = `Contrato: ${job.title}`;
    const eventDescription = `
Cliente: ${client.name}
Trabajador: ${doer.name}
Precio: $${contract.price.toLocaleString('es-AR')}
Estado: ${contract.status}
Descripción: ${job.description || ''}
    `.trim();

    const event: CalendarEvent = {
      title: eventTitle,
      description: eventDescription,
      startTime: new Date(job.startDate),
      endTime: new Date(job.endDate || job.startDate),
      location: job.location || 'Sin especificar',
      attendees: [client.email, doer.email]
    };

    // Aquí se integraría con Google Calendar API, Outlook, etc.
    // Por ahora, log para que se pueda implementar luego
    console.log('📅 [CALENDAR] Contrato agregado al calendario:', {
      contractId,
      event,
      clients: [client.email, doer.email]
    });

    // Guardar referencia en caso de que se quiera sincronizar después
    // contract.calendarEventId = eventId; // Si tuviera este campo
    // await contract.save();

  } catch (error) {
    console.error('Error adding contract to calendar:', error);
    // No fallar la creación del contrato por error de calendario
  }
}

/**
 * Crear evento de notificación para auto-selección inminente
 * Se envía cuando faltan 24-48 horas y hay 1 sola propuesta
 */
export async function notifyAutoSelectionIncoming(jobId: string) {
  try {
    const job = await Job.findByPk(jobId, {
      include: [{ model: User, as: 'client', attributes: ['email', 'name'] }]
    });

    if (!job) return;

    const client = job.client as any;
    const hoursUntilStart = (new Date(job.startDate).getTime() - Date.now()) / (1000 * 60 * 60);

    console.log('⏰ [AUTO-SELECT WARNING] Auto-selección inmediata:', {
      jobId,
      jobTitle: job.title,
      hoursUntilStart,
      clientEmail: client.email,
      message: `Tu trabajo "${job.title}" será asignado automáticamente en ${Math.round(hoursUntilStart)} horas si tienes 1 sola propuesta`
    });

  } catch (error) {
    console.error('Error notifying auto-selection:', error);
  }
}

/**
 * Sincronizar todos los contratos activos de un usuario a su calendario
 * Se llama cuando el usuario conecta su calendario por primera vez
 */
export async function syncUserContractsToCalendar(userId: string) {
  try {
    const contracts = await Contract.findAll({
      where: {
        $or: [
          { clientId: userId },
          { doerId: userId }
        ]
      },
      include: [
        { model: Job, as: 'job', attributes: ['id', 'title', 'startDate', 'endDate', 'location'] },
        { model: User, as: 'client', attributes: ['email', 'name'] },
        { model: User, as: 'doer', attributes: ['email', 'name'] }
      ]
    });

    console.log(`📅 [CALENDAR SYNC] Sincronizando ${contracts.length} contratos para usuario ${userId}`);

    for (const contract of contracts) {
      await addContractToCalendars(contract.id.toString());
    }

    return contracts.length;
  } catch (error) {
    console.error('Error syncing contracts to calendar:', error);
    return 0;
  }
}

export default {
  addContractToCalendars,
  notifyAutoSelectionIncoming,
  syncUserContractsToCalendar
};
