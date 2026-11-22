import { Contract } from '../models/sql/Contract.model.js';
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
  const quienesTrabajaron = new Set(
    contratos.filter((c) => c.status !== 'cancelled' && c.status !== 'rejected').map((c) => String(c.doerId)).filter((id) => id !== String(autorId)),
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
