import { Op } from 'sequelize';
import { Dispute } from '../models/sql/Dispute.model.js';
import { Contract } from '../models/sql/Contract.model.js';
import { Notification } from '../models/sql/Notification.model.js';
import { User } from '../models/sql/User.model.js';
import { logger } from '../services/logger.js';
import { POLITICAS } from '../../shared/constants/policies.js';

/**
 * El silencio pierde.
 *
 * En una disputa, la estrategia ganadora para quien tiene la plata retenida es
 * no contestar: mientras nadie decide, el dinero queda donde esta. Mercado
 * Libre lo resolvio hace veinte años con la regla mas simple posible: si una
 * parte no responde en plazo, pierde. Es lo que hace que la gente conteste.
 *
 * La regla concreta: el ultimo que hablo gana si el otro no responde en 7 dias.
 * Abrir la disputa cuenta como hablar, asi que quien la recibe tiene 7 dias
 * desde la apertura. Si responde, el reloj pasa al iniciador. Y asi hasta que
 * alguien se calla o un administrador decide.
 *
 * Vencido el plazo este cron NO mueve la plata: marca la disputa como lista,
 * deja la resolucion que corresponde segun la regla, y avisa al equipo para
 * que un administrador la accione. Ninguna transferencia ni devolucion sale
 * sin que una persona la ordene.
 *
 * A los 5 dias se avisa a quien esta en silencio. No es cortesia: una
 * resolucion automatica que llega sin aviso previo parece arbitraria, y una
 * que llega despues de dos avisos parece justa. Es la misma decision, y la
 * diferencia esta en si la persona la acepta o va al banco a desconocer el
 * cargo.
 *
 * Los mensajes de administracion no cuentan para el reloj: un admin que pide
 * informacion no esta "hablando" en nombre de ninguna de las partes.
 */

// Los numeros viven en shared/constants/policies.ts, junto con los terminos
// que los nombran. Aca solo se les da el nombre corto que usa este archivo.
export const DIAS_PARA_RESPONDER = POLITICAS.DISPUTA_DIAS_PARA_RESPONDER;
export const DIAS_PARA_AVISAR = POLITICAS.DISPUTA_DIAS_PARA_AVISAR;

interface EstadoSilencio {
  /** Quien hablo ultimo. Gana si el otro se calla. */
  ultimoEnHablar: string;
  /** Quien tiene que responder. */
  enSilencio: string;
  /** Desde cuando esta en silencio. */
  desde: Date;
  dias: number;
}

/**
 * Determina quien esta en silencio y desde cuando.
 *
 * Devuelve null si no se puede determinar -- por ejemplo, si el contrato no
 * tiene las dos partes identificadas. Ante la duda no se resuelve nada: es
 * mejor que un administrador mire que resolver mal a favor de alguien.
 */
export function estadoDeSilencio(
  dispute: { initiatedBy: string; createdAt: Date; messages?: any[] },
  clienteId: string,
  trabajadorId: string,
  ahora = new Date(),
): EstadoSilencio | null {
  if (!clienteId || !trabajadorId) return null;

  const partes = [String(clienteId), String(trabajadorId)];
  const iniciador = String(dispute.initiatedBy);
  if (!partes.includes(iniciador)) return null;

  // El ultimo mensaje de una PARTE, no de administracion.
  const mensajes = (dispute.messages || [])
    .filter((m: any) => !m.isAdmin && partes.includes(String(m.from)))
    .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const ultimo = mensajes[mensajes.length - 1];
  const ultimoEnHablar = ultimo ? String(ultimo.from) : iniciador;
  const desde = ultimo ? new Date(ultimo.createdAt) : new Date(dispute.createdAt);
  const enSilencio = partes.find((p) => p !== ultimoEnHablar)!;
  const dias = Math.floor((ahora.getTime() - desde.getTime()) / 86_400_000);

  return { ultimoEnHablar, enSilencio, desde, dias };
}

export async function revisarSilencioEnDisputas(): Promise<{ avisadas: number; resueltas: number }> {
  // 'negotiation' queda afuera a proposito: ahi corre el reloj del reclamo
  // directo (72 h), que tiene su propio cron.
  const abiertas = await Dispute.findAll({
    where: { status: { [Op.in]: ['open', 'awaiting_info'] } },
    limit: 500,
  });

  let avisadas = 0;
  let resueltas = 0;

  for (const d of abiertas) {
    try {
      const contract = await Contract.findByPk(d.contractId);
      if (!contract) continue;

      const clienteId = String((contract as any).clientId);
      const trabajadorId = String((contract as any).doerId);
      const s = estadoDeSilencio(d as any, clienteId, trabajadorId);
      if (!s) continue;

      // Vencido el plazo, la regla ya decidió a favor de quién. Pero NO mueve
      // la plata: la deja lista para que un administrador la accione.
      //
      // El silencio sigue perdiendo -- eso es lo que hace que la gente
      // conteste -- pero una transferencia o una devolución las ordena una
      // persona, no un cron a las tres de la mañana. Si el sistema se
      // equivoca (un mensaje que no se registró, una parte que escribió por
      // otro canal), el error se atrapa antes de que el dinero se mueva.
      if (s.dias >= DIAS_PARA_RESPONDER) {
        const ganaCliente = s.ultimoEnHablar === clienteId;
        const yaMarcada = ((d as any).logs || []).some((l: any) => l.action === 'silencio_vencido');
        if (yaMarcada) continue;

        const recomendacion = ganaCliente ? 'full_refund' : 'full_release';
        const texto =
          `Pasaron ${s.dias} días sin respuesta de una de las partes (se avisó al día ${DIAS_PARA_AVISAR}). ` +
          (ganaCliente
            ? 'El trabajador no contestó: según el punto 10.10 corresponde devolverle el dinero al cliente.'
            : 'El cliente no contestó: según el punto 10.10 corresponde liberarle el pago al trabajador.');

        const logs = [...((d as any).logs || [])];
        logs.push({
          action: 'silencio_vencido',
          performedBy: null,
          actor: 'system:silencio',
          timestamp: new Date(),
          details: `${texto} Resolución recomendada: ${recomendacion}. Espera acción de un administrador.`,
        });
        await d.update({
          status: 'in_review',
          escalationReason: 'silencio_vencido',
          escalatedAt: new Date(),
          logs,
        } as any);

        const admins = await User.findAll({
          where: { role: { [Op.in]: ['admin', 'super_admin', 'owner', 'support'] } },
          attributes: ['id'],
        });
        for (const a of admins) {
          await Notification.create({
            recipientId: a.id,
            type: 'warning',
            category: 'admin',
            title: 'Disputa lista para resolver por silencio',
            message: `Disputa ${String(d.id).slice(0, 8)}: ${texto} Revisala y resolvé desde el panel.`,
            relatedModel: 'Dispute',
            relatedId: d.id,
            actionText: 'Resolver',
            sentVia: ['in_app'],
          } as any);
        }

        resueltas++;
        logger.info('disputes', `Disputa ${d.id} marcada por silencio de ${s.enSilencio} (${s.dias} dias); espera a un admin`);
        continue;
      }

      // Avisar a los 5 dias, una sola vez.
      if (s.dias >= DIAS_PARA_AVISAR) {
        const yaAvisado = ((d as any).logs || []).some(
          (l: any) => l.action === 'aviso_silencio' && String(l.details || '').includes(s.desde.toISOString()),
        );
        if (yaAvisado) continue;

        const faltan = DIAS_PARA_RESPONDER - s.dias;
        await Notification.create({
          recipientId: s.enSilencio,
          type: 'warning',
          category: 'disputes',
          title: `Tenés ${faltan} ${faltan === 1 ? 'día' : 'días'} para responder la disputa`,
          message:
            `Hace ${s.dias} días que la otra parte espera tu respuesta. Si no respondés en ` +
            `${faltan} ${faltan === 1 ? 'día' : 'días'}, la disputa se resuelve a favor de la otra parte. ` +
            'Contestá aunque sea para decir que necesitás más tiempo.',
          relatedModel: 'Dispute',
          relatedId: d.id,
          actionText: 'Responder',
          sentVia: ['in_app'],
        } as any);

        const logs = [...((d as any).logs || [])];
        logs.push({
          action: 'aviso_silencio',
          performedBy: null,
          actor: 'system:silencio',
          timestamp: new Date(),
          details: `Aviso a ${s.enSilencio} · silencio desde ${s.desde.toISOString()}`,
        });
        await d.update({ logs } as any);
        avisadas++;
      }
    } catch (e: any) {
      logger.error('disputes', `Error revisando silencio en disputa ${d.id}: ${e.message}`);
    }
  }

  return { avisadas, resueltas };
}

export function startDisputeSilenceJob(): void {
  const SEIS_HORAS = 6 * 60 * 60 * 1000;
  setInterval(() => {
    revisarSilencioEnDisputas().catch((e) =>
      logger.error('disputes', `disputeSilence: ${e.message}`),
    );
  }, SEIS_HORAS);
}
