import { Op } from 'sequelize';
import { Contract } from '../models/sql/Contract.model.js';
import { Job } from '../models/sql/Job.model.js';
import { User } from '../models/sql/User.model.js';
import { Notification } from '../models/sql/Notification.model.js';
import { conSistema } from '../db/contextoRls.js';

/**
 * Etiquetar a los trabajadores en la publicación de un trabajo terminado (pedido del dueño, 2026-11-22).
 *  - Solo se etiqueta a quien trabajó en ESE trabajo (tiene un contrato en él) y no a uno mismo.
 *  - Cada persona decide en Configuración si la pueden etiquetar (`notificationPreferences.canBeTagged`; sin valor = sí). Quien lo apagó no se etiqueta
 *    y, si lo apaga después, deja de verse en las publicaciones donde ya estaba.
 *  - Quien publica tiene que ser parte del trabajo (cliente o trabajador de alguno de sus contratos).
 */
export const puedeSerEtiquetado = (preferencias?: { canBeTagged?: boolean } | null): boolean => preferencias?.canBeTagged !== false;

/** Una lista de ids que llega como arreglo o como texto JSON (los formularios con archivos mandan texto). */
export function leerIds(valor: unknown): string[] {
  let lista: unknown = valor;
  if (typeof valor === 'string') {
    try {
      lista = JSON.parse(valor);
    } catch {
      lista = valor.split(',');
    }
  }
  if (!Array.isArray(lista)) return [];
  const limpios = lista.map((v) => String(v ?? '').trim()).filter((v) => /^[0-9a-f-]{36}$/i.test(v));
  return Array.from(new Set(limpios)).slice(0, 20);
}

export type ResultadoDeEtiquetas =
  | { ok: true; contratoId?: string; etiquetados: string[]; noPermiten: string[]; ajenos: string[] }
  | { ok: false; estado: number; mensaje: string };

/** Comprueba que quien publica sea parte del trabajo y arma quién queda etiquetado (y por qué alguien no). */
export async function resolverEtiquetas(autorId: string, trabajoId: string, pedidos: string[]): Promise<ResultadoDeEtiquetas> {
  const contratos = await conSistema(() =>
    Contract.findAll({ where: { jobId: trabajoId }, attributes: ['id', 'clientId', 'doerId', 'status'] }),
  );
  const mios = contratos.filter((c) => String(c.clientId) === String(autorId) || String(c.doerId) === String(autorId));
  if (mios.length === 0) return { ok: false, estado: 403, mensaje: 'Solo se puede compartir un trabajo en el que participaste.' };

  const contratoId = (mios.find((c) => c.status === 'completed') ?? mios[0]).id;
  // Los participantes del trabajo: quienes trabajaron y quien contrató (un trabajador que comparte el trabajo puede etiquetar a sus compañeros y a quien lo contrató).
  const quienesTrabajaron = new Set(
    contratos.filter((c) => c.status !== 'cancelled' && c.status !== 'rejected').flatMap((c) => [String(c.doerId), String(c.clientId)]).filter((id) => id !== String(autorId)),
  );

  const ajenos = pedidos.filter((id) => !quienesTrabajaron.has(id));
  const candidatos = pedidos.filter((id) => quienesTrabajaron.has(id));
  const personas = candidatos.length
    ? await conSistema(() => User.findAll({ where: { id: candidatos }, attributes: ['id', 'notificationPreferences'] }))
    : [];
  const permiten = new Set(personas.filter((u) => puedeSerEtiquetado(u.notificationPreferences)).map((u) => String(u.id)));
  return {
    ok: true,
    contratoId,
    etiquetados: candidatos.filter((id) => permiten.has(id)),
    noPermiten: candidatos.filter((id) => !permiten.has(id)),
    ajenos,
  };
}

export type CandidatosDeEtiqueta =
  | { ok: true; contratoId?: string; personas: Array<{ id: string; name: string; avatar?: string | null; permite: boolean }> }
  | { ok: false; estado: number; mensaje: string };

/** Quiénes se pueden etiquetar en un trabajo (para mostrar la lista al editar una publicación ya hecha) y si cada uno permite las etiquetas. */
export async function candidatosDeEtiqueta(autorId: string, trabajoId: string): Promise<CandidatosDeEtiqueta> {
  const contratos = await conSistema(() => Contract.findAll({ where: { jobId: trabajoId }, attributes: ['id', 'clientId', 'doerId', 'status'] }));
  const mios = contratos.filter((c) => String(c.clientId) === String(autorId) || String(c.doerId) === String(autorId));
  if (mios.length === 0) return { ok: false, estado: 403, mensaje: 'Solo se puede etiquetar en la publicación de un trabajo en el que participaste.' };
  const contratoId = (mios.find((c) => c.status === 'completed') ?? mios[0]).id;
  const ids = Array.from(new Set(contratos.filter((c) => c.status !== 'cancelled' && c.status !== 'rejected').flatMap((c) => [String(c.doerId), String(c.clientId)]).filter((id) => id !== String(autorId))));
  const usuarios = ids.length ? await conSistema(() => User.findAll({ where: { id: ids }, attributes: ['id', 'name', 'avatar', 'notificationPreferences'] })) : [];
  return { ok: true, contratoId, personas: usuarios.map((u) => ({ id: String(u.id), name: u.name, avatar: u.avatar, permite: puedeSerEtiquetado(u.notificationPreferences) })) };
}

export interface OpinionDeTrabajo {
  contractId: string;
  workerId: string;
  name: string;
  role: 'doer' | 'client';
  rating: number;
  comment: string;
}

/**
 * Las puntuaciones que una persona dejó al terminar un trabajo (una por contrato: con dos trabajadores son dos). Salen de las reseñas reales, no de lo que mande la pantalla:
 * el portafolio no puede mostrar un puntaje que nadie dio.
 */
export async function opinionesDeMiTrabajo(autorId: string, trabajoId: string): Promise<OpinionDeTrabajo[]> {
  const contratos = await conSistema(() => Contract.findAll({ where: { jobId: trabajoId }, attributes: ['id', 'clientId', 'doerId'] }));
  const mios = contratos.filter((c) => String(c.clientId) === String(autorId) || String(c.doerId) === String(autorId));
  if (mios.length === 0) return [];
  const { Review } = await import('../models/sql/Review.model.js');
  const { POST_WORK_DRAFT } = await import('./postWorkRating.js');
  const reseñas = await conSistema(() =>
    Review.findAll({ where: { contractId: mios.map((c) => c.id), reviewerId: autorId, source: { [Op.ne]: POST_WORK_DRAFT } } as any }),
  );
  const personas = await conSistema(() => User.findAll({ where: { id: reseñas.map((r) => r.reviewedId) }, attributes: ['id', 'name'] }));
  return reseñas
    .filter((r) => Number(r.rating) > 0)
    .map((r) => {
      const c = mios.find((x) => String(x.id) === String(r.contractId))!;
      return {
        contractId: String(r.contractId),
        workerId: String(r.reviewedId),
        name: personas.find((p) => String(p.id) === String(r.reviewedId))?.name || 'Sin nombre',
        role: (String(c.doerId) === String(r.reviewedId) ? 'doer' : 'client') as 'doer' | 'client',
        rating: Number(r.rating),
        comment: String(r.comment || ''),
      };
    });
}

/** Los trabajos terminados en que participó una persona (para elegir de cuál es una publicación que quedó sin trabajo vinculado). */
export async function trabajosParaEtiquetar(autorId: string): Promise<Array<{ id: string; title: string }>> {
  const contratos = await conSistema(() =>
    Contract.findAll({ where: { status: 'completed', [Op.or]: [{ clientId: autorId }, { doerId: autorId }] } as any, attributes: ['jobId'], order: [['updatedAt', 'DESC']], limit: 30 }),
  );
  const ids = Array.from(new Set(contratos.map((c) => String(c.jobId))));
  if (!ids.length) return [];
  const trabajos = await conSistema(() => Job.findAll({ where: { id: ids }, attributes: ['id', 'title'] }));
  return ids.flatMap((id) => {
    const t = trabajos.find((j) => String(j.id) === id);
    return t ? [{ id, title: t.title }] : [];
  });
}

/** A cada publicación le agrega `etiquetados` (id, nombre y foto), sin quienes ya no permiten que los etiqueten. Una sola consulta para todas. */
export async function presentarEtiquetados<T extends { taggedUsers?: string[] }>(publicaciones: T[]): Promise<Array<T & { etiquetados: Array<{ id: string; name: string; avatar?: string | null }> }>> {
  const ids = Array.from(new Set(publicaciones.flatMap((p) => (Array.isArray(p.taggedUsers) ? p.taggedUsers : []).map(String))));
  const personas = ids.length
    ? await conSistema(() => User.findAll({ where: { id: ids }, attributes: ['id', 'name', 'avatar', 'notificationPreferences'] }))
    : [];
  const porId = new Map(personas.filter((u) => puedeSerEtiquetado(u.notificationPreferences)).map((u) => [String(u.id), { id: String(u.id), name: u.name, avatar: u.avatar }]));
  return publicaciones.map((p) => ({
    ...p,
    etiquetados: (Array.isArray(p.taggedUsers) ? p.taggedUsers : []).map(String).flatMap((id) => (porId.has(id) ? [porId.get(id)!] : [])),
  }));
}

/** Les avisa a las personas etiquetadas (un aviso por persona). No frena la publicación si falla. */
export async function avisarEtiquetas(publicacionId: string, titulo: string, autorNombre: string, etiquetados: string[]): Promise<void> {
  for (const id of etiquetados) {
    try {
      await Notification.create({
        recipientId: id,
        type: 'info',
        category: 'user',
        title: 'Te etiquetaron en una publicación',
        message: `${autorNombre} te etiquetó en «${titulo}». Si no querés que te etiqueten, podés cambiarlo en Configuración.`,
        data: { postId: publicacionId },
        actionUrl: `/posts/${publicacionId}`,
        read: false,
      } as any);
    } catch (error) {
      console.warn('⚠️ No se pudo avisar de la etiqueta:', (error as Error).message);
    }
  }
}

export type PuntuacionVisible = { contractId: string; workerId: string; name: string; role: 'doer' | 'client'; rating: number; comment?: string };

/** Las puntuaciones elegidas para mostrar. Salen de las reseñas reales que esa persona dejó: la pantalla solo dice cuáles y si llevan el comentario. */
export async function puntuacionesElegidas(autorId: string, trabajoId: string, pedidos: unknown): Promise<PuntuacionVisible[]> {
  let lista: unknown = pedidos;
  if (typeof pedidos === 'string') {
    try { lista = JSON.parse(pedidos); } catch { return []; }
  }
  if (!Array.isArray(lista) || lista.length === 0) return [];
  const mias = await opinionesDeMiTrabajo(autorId, trabajoId);
  const salida: PuntuacionVisible[] = [];
  for (const pedido of lista.slice(0, 10) as Array<{ contractId?: string; puntaje?: boolean; comentario?: boolean }>) {
    const o = mias.find((x) => x.contractId === String(pedido?.contractId));
    if (!o || pedido?.puntaje === false || salida.some((s) => s.contractId === o.contractId)) continue;
    salida.push({ contractId: o.contractId, workerId: o.workerId, name: o.name, role: o.role, rating: o.rating, ...(pedido?.comentario === true && o.comment.trim() ? { comment: o.comment.trim().slice(0, 500) } : {}) });
  }
  return salida;
}

/**
 * Qué trabajos YA compartió esta persona, y en qué publicación: `{ idDelTrabajo: idDeLaPublicacion }`. Se mira antes de ofrecer «compartir» (para llevar a lo
 * que ya existe) y antes de crear (para que no quede dos veces). Si borra la publicación, el trabajo vuelve a figurar sin compartir.
 */
export async function trabajosYaCompartidos(autorId: string, soloEstos?: string[]): Promise<Record<string, string>> {
  const { Post } = await import('../models/sql/Post.model.js');
  const publicaciones = await Post.findAll({
    where: { author: autorId, linkedContract: { [Op.ne]: null } } as any,
    attributes: ['id', 'linkedContract', 'createdAt'],
    order: [['createdAt', 'DESC']],
    limit: 1000,
  });
  if (publicaciones.length === 0) return {};
  const contratos = await conSistema(() => Contract.findAll({ where: { id: publicaciones.map((p) => p.linkedContract as string) }, attributes: ['id', 'jobId'], paranoid: false }));
  const trabajoDe = new Map(contratos.map((c) => [String(c.id), String(c.jobId)]));
  const salida: Record<string, string> = {};
  for (const p of publicaciones) {
    const trabajo = trabajoDe.get(String(p.linkedContract));
    if (trabajo && !salida[trabajo] && (!soloEstos || soloEstos.includes(trabajo))) salida[trabajo] = String(p.id);
  }
  return salida;
}
