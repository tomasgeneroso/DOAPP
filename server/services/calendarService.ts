import { User } from '../models/sql/User.model.js';
import { Contract } from '../models/sql/Contract.model.js';
import { Job } from '../models/sql/Job.model.js';
import { google } from 'googleapis';

/**
 * Servicio para sincronizar contratos con Google Calendar
 * Solo integración con Google Calendar (no Outlook u otros)
 */

interface CalendarEvent {
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
  location?: string;
  attendees?: string[];
}

interface GoogleCalendarToken {
  access_token: string;
  refresh_token?: string;
  expiry_date?: number;
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

/**
 * Agregar evento a Google Calendar del usuario
 * Requiere que el usuario haya conectado su Google Calendar (OAuth2)
 */
export async function addEventToGoogleCalendar(userId: string, event: CalendarEvent) {
  try {
    const user = await User.findByPk(userId);
    if (!user) return null;

    // Obtener tokens de Google Calendar
    const calendarTokens = (user as any).calendarTokens;
    if (!calendarTokens?.google?.access_token) {
      console.log(`📅 [GOOGLE CALENDAR] Usuario ${userId} no tiene Google Calendar conectado`);
      return null;
    }

    // TODO: Implementar integración real con Google Calendar API
    // Pasos:
    // 1. Usar tokens guardados (access_token, refresh_token)
    // 2. Refrescar token si está vencido (expiry_date)
    // 3. Llamar a google.calendar('v3').events.insert()
    // 4. Guardar event.id en contract.googleCalendarEventId

    console.log('📅 [GOOGLE CALENDAR] Evento listo para sincronizar:', {
      userId,
      eventTitle: event.title,
      startTime: event.startTime,
      endTime: event.endTime,
      attendees: event.attendees
    });

    return null;
  } catch (error) {
    console.error('Error adding event to Google Calendar:', error);
    return null;
  }
}

/**
 * Obtener URL de autorización para Google Calendar OAuth2
 */
export function getGoogleCalendarAuthUrl() {
  // Esto requeriría configuración de Google OAuth2
  // client ID, client secret, redirect URI
  return {
    url: process.env.GOOGLE_CALENDAR_AUTH_URL || '',
    scope: 'https://www.googleapis.com/auth/calendar',
    prompt: 'consent'
  };
}

/**
 * Guardar tokens de Google Calendar para usuario
 */
export async function saveGoogleCalendarTokens(userId: string, tokens: GoogleCalendarToken) {
  try {
    const user = await User.findByPk(userId);
    if (!user) return false;

    const calendarTokens = (user as any).calendarTokens || {};
    calendarTokens.google = tokens;
    (user as any).calendarTokens = calendarTokens;
    await user.save();

    console.log(`✅ [GOOGLE CALENDAR] Tokens guardados para usuario ${userId}`);
    return true;
  } catch (error) {
    console.error('Error saving Google Calendar tokens:', error);
    return false;
  }
}

/**
 * Desconectar Google Calendar del usuario
 */
export async function disconnectGoogleCalendar(userId: string) {
  try {
    const user = await User.findByPk(userId);
    if (!user) return false;

    const calendarTokens = (user as any).calendarTokens || {};
    delete calendarTokens.google;
    (user as any).calendarTokens = calendarTokens;
    await user.save();

    console.log(`🔌 [GOOGLE CALENDAR] Desconectado para usuario ${userId}`);
    return true;
  } catch (error) {
    console.error('Error disconnecting Google Calendar:', error);
    return false;
  }
}

export default {
  addContractToCalendars,
  notifyAutoSelectionIncoming,
  syncUserContractsToCalendar,
  addEventToGoogleCalendar,
  getGoogleCalendarAuthUrl,
  saveGoogleCalendarTokens,
  disconnectGoogleCalendar
};
