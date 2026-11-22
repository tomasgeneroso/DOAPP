import { Op } from 'sequelize';
import { Conversation } from '../models/sql/Conversation.model.js';
import { ChatMessage } from '../models/sql/ChatMessage.model.js';
import { Job } from '../models/sql/Job.model.js';
import { Contract } from '../models/sql/Contract.model.js';
import { Dispute } from '../models/sql/Dispute.model.js';
import { User } from '../models/sql/User.model.js';
import { conSistema } from '../db/contextoRls.js';
import { POLITICAS } from '../../shared/constants/policies.js';

/**
 * El chat del equipo de un trabajo con varios trabajadores (pedido del dueño, 2026-11-22).
 *
 *  - SE CREA al elegir al primer trabajador (routes/proposals.ts) y sus integrantes siguen a los elegidos: el cliente y los trabajadores con un contrato vigente (no cancelado ni rechazado).
 *    Quien se suma o sale queda anotado en el chat.
 *  - TRAE LAS NOVEDADES: cada cosa que pasa en el trabajo se publica como mensaje del sistema (quién terminó, quién aceptó, que empezó, reclamos, avisos de problemas, que se completó).
 *  - SE CIERRA cuando el trabajo termina o se cancela: nadie puede escribir más y el chat avisa cuándo se borra.
 *  - SE BORRA `DIAS_PARA_DISPUTAR` días después de cerrado (el plazo para reclamar), salvo que haya un reclamo abierto de ese trabajo: ahí espera a que se resuelva.
 *
 * Todo es de mejor esfuerzo: un aviso al chat nunca frena lo que lo originó.
 */
const DIAS = POLITICAS.DIAS_PARA_DISPUTAR;
const CONTRATOS_QUE_NO_CUENTAN = ['cancelled', 'rejected'];

type ChatDelEquipo = { job: Job; chat: Conversation };

const nombreDe = (u?: { name?: string | null } | null) => (u?.name ? String(u.name).split(' ')[0] : 'Una persona');

async function chatDelTrabajo(jobId: string, { abierto = true }: { abierto?: boolean } = {}): Promise<ChatDelEquipo | null> {
  return conSistema(async () => {
    const job = await Job.findByPk(jobId);
    if (!job || !job.groupChatId) return null;
    const chat = await Conversation.findByPk(job.groupChatId);
    if (!chat) return null;
    if (abierto && (chat as any).metadata?.cerradoEl) return null;
    return { job, chat };
  });
}

async function publicar(chat: Conversation, job: Job, texto: string, accion: string): Promise<void> {
  await conSistema(async () => {
    await ChatMessage.create({
      conversationId: chat.id,
      senderId: job.clientId,
      message: texto,
      type: 'system',
      metadata: { jobId: job.id, action: accion, equipo: true },
    } as any);
    chat.lastMessage = texto.split('||').pop()?.slice(0, 200) || texto.slice(0, 200);
    chat.lastMessageAt = new Date();
    await chat.save();
  });
}

/** Una novedad del trabajo en el chat del equipo. Si el trabajo no tiene chat de equipo (un solo trabajador) o ya está cerrado, no hace nada. */
export async function avisarAlChatDelEquipo(jobId: string | null | undefined, texto: string, accion = 'novedad'): Promise<void> {
  try {
    if (!jobId) return;
    const encontrado = await chatDelTrabajo(String(jobId));
    if (!encontrado) return;
    await publicar(encontrado.chat, encontrado.job, texto, accion);
  } catch (error) {
    console.error('[chatDelEquipo] no se pudo publicar la novedad:', error);
  }
}

/** Lo mismo, a partir de un contrato: dice de quién es el trabajo («el trabajo de Ana»). */
export async function avisarContratoAlChatDelEquipo(contratoId: string | null | undefined, armar: (nombreDelTrabajador: string) => string, accion = 'novedad'): Promise<void> {
  try {
    if (!contratoId) return;
    const contrato = await conSistema(() => Contract.findByPk(String(contratoId), { attributes: ['id', 'jobId', 'doerId'], paranoid: false }));
    if (!contrato) return;
    const doer = await conSistema(() => User.findByPk(String(contrato.doerId), { attributes: ['id', 'name'] }));
    await avisarAlChatDelEquipo(String(contrato.jobId), armar(nombreDe(doer)), accion);
  } catch (error) {
    console.error('[chatDelEquipo] no se pudo publicar la novedad del contrato:', error);
  }
}

/** Los integrantes del chat siguen a los elegidos: cliente + trabajadores con un contrato vigente. Anota quién se suma o sale. */
export async function sincronizarChatDelEquipo(jobId: string): Promise<void> {
  try {
    const encontrado = await chatDelTrabajo(jobId);
    if (!encontrado) return;
    const { job, chat } = encontrado;
    const contratos = await conSistema(() => Contract.findAll({ where: { jobId, status: { [Op.notIn]: CONTRATOS_QUE_NO_CUENTAN } } as any, attributes: ['doerId'] }));
    const trabajadores = [...new Set(contratos.map((c) => String(c.doerId)))];
    const deberianEstar = [String(job.clientId), ...trabajadores];
    const estan = (chat.participants || []).map(String);
    const nuevos = deberianEstar.filter((id) => !estan.includes(id));
    const salieron = estan.filter((id) => !deberianEstar.includes(id));
    if (nuevos.length === 0 && salieron.length === 0) return;

    chat.participants = deberianEstar;
    chat.changed('participants', true);
    await conSistema(() => chat.save());
    const usuarios = await conSistema(() => User.findAll({ where: { id: { [Op.in]: [...nuevos, ...salieron] } } as any, attributes: ['id', 'name'] }));
    const nombre = (id: string) => nombreDe(usuarios.find((u) => String(u.id) === id));
    for (const id of nuevos) await publicar(chat, job, `👤 ${nombre(id)} se sumó al equipo (${trabajadores.length} de ${job.maxWorkers || trabajadores.length}).`, 'equipo_suma');
    for (const id of salieron) await publicar(chat, job, `👋 ${nombre(id)} salió del equipo (${trabajadores.length} de ${job.maxWorkers || trabajadores.length}).`, 'equipo_sale');
  } catch (error) {
    console.error('[chatDelEquipo] no se pudo sincronizar a los integrantes:', error);
  }
}

/** El trabajo terminó o se canceló: el chat se cierra y avisa cuándo se borra. Se puede llamar muchas veces (no repite). */
export async function cerrarChatDelEquipo(jobId: string, motivo: 'completado' | 'cancelado'): Promise<void> {
  try {
    const encontrado = await chatDelTrabajo(jobId);
    if (!encontrado) return;
    const { job, chat } = encontrado;
    const ahora = new Date();
    const borrarDesde = new Date(ahora.getTime() + DIAS * 86_400_000);
    await publicar(
      chat,
      job,
      `🔒 ${motivo === 'completado' ? 'El trabajo terminó' : 'El trabajo se canceló'}: este chat se cierra y no se puede escribir más. Se borra el ${borrarDesde.toLocaleDateString('es-AR')} (${DIAS} días, el plazo para reclamar); si hay un reclamo abierto, se borra recién cuando se resuelva.`,
      'chat_cerrado',
    );
    await conSistema(async () => {
      chat.metadata = { ...((chat as any).metadata || {}), cerradoEl: ahora.toISOString(), borrarDesde: borrarDesde.toISOString(), motivoDelCierre: motivo };
      chat.changed('metadata', true);
      await chat.save();
    });
  } catch (error) {
    console.error('[chatDelEquipo] no se pudo cerrar el chat:', error);
  }
}

/** ¿Este chat está cerrado? Lo usa el envío de mensajes (REST y socket). */
export const chatDelEquipoCerrado = (conversacion: { metadata?: any } | null | undefined): boolean => Boolean(conversacion?.metadata?.cerradoEl);

/**
 * Barrido: sincroniza a los integrantes, cierra los chats de trabajos ya terminados o cancelados (por si el cierre no llegó) y borra los que cumplieron el plazo,
 * salvo que el trabajo tenga un reclamo abierto. Devuelve cuántos cerró y cuántos borró.
 */
export async function barrerChatsDelEquipo(ahora = new Date()): Promise<{ cerrados: number; borrados: number }> {
  let cerrados = 0;
  let borrados = 0;
  const trabajos = await conSistema(() =>
    Job.findAll({ where: { groupChatId: { [Op.ne]: null } } as any, attributes: ['id', 'status', 'groupChatId'], limit: 500 }),
  );
  for (const t of trabajos) {
    try {
      const chat = await conSistema(() => Conversation.findByPk(String(t.groupChatId)));
      if (!chat) continue;
      const cerrado = chatDelEquipoCerrado(chat as any);
      if (!cerrado && ['completed', 'cancelled'].includes(String(t.status))) {
        await cerrarChatDelEquipo(String(t.id), t.status === 'completed' ? 'completado' : 'cancelado');
        cerrados++;
        continue;
      }
      if (!cerrado) {
        await sincronizarChatDelEquipo(String(t.id));
        continue;
      }
      const borrarDesde = new Date(String((chat as any).metadata?.borrarDesde || ''));
      if (Number.isNaN(borrarDesde.getTime()) || borrarDesde > ahora) continue;
      // Un reclamo abierto del trabajo detiene el borrado: el chat puede ser parte de lo que se mira.
      const contratos = await conSistema(() => Contract.findAll({ where: { jobId: t.id } as any, attributes: ['id'], paranoid: false }));
      const abiertos = contratos.length
        ? await conSistema(() => Dispute.count({ where: { contractId: { [Op.in]: contratos.map((c) => String(c.id)) }, status: { [Op.in]: ['negotiation', 'open', 'in_review', 'awaiting_info'] } } as any }))
        : 0;
      if (abiertos > 0) continue;
      await conSistema(async () => {
        await ChatMessage.destroy({ where: { conversationId: chat.id } as any });
        await chat.destroy();
        await Job.update({ groupChatId: null } as any, { where: { id: t.id } as any });
      });
      borrados++;
    } catch (error) {
      console.error(`[chatDelEquipo] barrido del trabajo ${t.id}:`, error);
    }
  }
  return { cerrados, borrados };
}
