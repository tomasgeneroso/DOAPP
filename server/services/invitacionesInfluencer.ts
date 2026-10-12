import crypto from 'crypto';
import { sequelize } from '../config/database.js';
import { config } from '../config/env.js';
import { InfluencerInvite } from '../models/sql/InfluencerInvite.model.js';
import { User } from '../models/sql/User.model.js';
import { POLITICAS } from '../../shared/constants/policies.js';
import { logEvento } from '../utils/auditLog.js';

/**
 * Invitaciones de creadores de contenido (influencers). T&C 7.11.
 *
 * Cada creador recibe un lote de POLITICAS.INVITACIONES_POR_INFLUENCER (5) invitaciones. Cada una es un enlace de UN solo
 * uso: quien la canjea —al registrarse o desde su cuenta— no paga la comisión de la Plataforma por sus contratos como
 * Cliente durante POLITICAS.INVITACION_DIAS_SIN_COMISION (365) días corridos desde el canje.
 *
 * Reglas, todas "lo que falte o venga raro es un no":
 *  - Un solo uso: el canje corre en una transacción con la fila bloqueada, así que dos personas canjeando el mismo
 *    enlace a la vez no pueden ganar las dos.
 *  - Una invitación por cuenta (`users.influencer_invite_id`), y no se acumula con el plan familia.
 *  - Una invitación dada de baja, vencida o ya canjeada no se canjea.
 *  - El código es largo y al azar (criptográfico): no se puede adivinar.
 *
 * Lo que NO exime: el costo de procesamiento del pago ni los impuestos (T&C 7.10 y 7.11).
 */

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin I, O, 0, 1
const LARGO_DEL_CODIGO = 12;
export const PREFIJO_DEL_CODIGO = 'INF-';
const FORMATO_DEL_CODIGO = new RegExp(`^${PREFIJO_DEL_CODIGO}[A-HJ-NP-Z2-9]{${LARGO_DEL_CODIGO}}$`);
export const MAXIMO_DE_INVITACIONES_POR_LOTE = 20;

export function generarCodigoDeInvitacion(): string {
  let c = '';
  for (let i = 0; i < LARGO_DEL_CODIGO; i++) c += ALFABETO[crypto.randomInt(ALFABETO.length)];
  return `${PREFIJO_DEL_CODIGO}${c}`;
}

/** El código como lo escribió o pegó la persona → el código canónico, o null si no tiene la forma de un código. */
export function normalizarCodigoDeInvitacion(entrada: unknown): string | null {
  const c = String(entrada ?? '').trim().toUpperCase();
  return FORMATO_DEL_CODIGO.test(c) ? c : null;
}

export function enlaceDeInvitacion(codigo: string): string {
  const base = String(process.env.CLIENT_URL || config.clientUrl || 'https://doapparg.com').replace(/\/+$/, '');
  return `${base}/invitacion/${codigo}`;
}

/**
 * Hasta cuándo dura el beneficio de quien canjea. Un solo lugar: si algún día el año tiene que empezar al cierre de la
 * beta en vez de al canje, se cambia acá.
 */
export function calcularFinDelBeneficio(canjeadaEl: Date, dias: number): Date {
  return new Date(canjeadaEl.getTime() + dias * 24 * 60 * 60 * 1000);
}

export type EstadoDeInvitacion = 'valida' | 'inexistente' | 'canjeada' | 'dada_de_baja' | 'vencida';

export function estadoDeLaInvitacion(inv: Pick<InfluencerInvite, 'isActive' | 'redeemedById' | 'expiresAt'> | null | undefined, ahora: Date = new Date()): EstadoDeInvitacion {
  if (!inv) return 'inexistente';
  if (inv.redeemedById) return 'canjeada';
  if (!inv.isActive) return 'dada_de_baja';
  if (inv.expiresAt && ahora > new Date(inv.expiresAt)) return 'vencida';
  return 'valida';
}

const MENSAJES: Record<EstadoDeInvitacion, string> = {
  valida: 'Invitación válida',
  inexistente: 'Esta invitación no existe. Revisá el enlace.',
  canjeada: 'Esta invitación ya fue usada.',
  dada_de_baja: 'Esta invitación ya no está disponible.',
  vencida: 'Esta invitación venció.',
};

export interface ConsultaDeInvitacion {
  valida: boolean;
  estado: EstadoDeInvitacion;
  mensaje: string;
  dias?: number;
  influencer?: string;
}

/** Lo que se le cuenta a quien abre el enlace (público): si sirve, de quién es y cuántos días da. Nada más. */
export async function consultarInvitacion(entrada: unknown): Promise<ConsultaDeInvitacion> {
  const codigo = normalizarCodigoDeInvitacion(entrada);
  if (!codigo) return { valida: false, estado: 'inexistente', mensaje: MENSAJES.inexistente };
  const inv = await InfluencerInvite.findOne({ where: { code: codigo } });
  const estado = estadoDeLaInvitacion(inv);
  if (estado !== 'valida') return { valida: false, estado, mensaje: MENSAJES[estado] };
  return { valida: true, estado, mensaje: MENSAJES.valida, dias: inv!.freeDays, influencer: inv!.influencerName };
}

export interface LoteCreado {
  batchId: string;
  invitaciones: Array<{ id: string; code: string; enlace: string }>;
}

export async function crearLoteDeInvitaciones(datos: {
  nombre: string;
  usuario?: string | null;
  cantidad?: number;
  creadoPorId: string;
  notas?: string | null;
  venceEl?: Date | null;
}): Promise<LoteCreado> {
  const nombre = String(datos.nombre || '').trim().slice(0, 120);
  if (!nombre) throw new Error('Falta el nombre del creador');
  const cantidad = Math.floor(Number(datos.cantidad ?? POLITICAS.INVITACIONES_POR_INFLUENCER));
  if (!Number.isFinite(cantidad) || cantidad < 1 || cantidad > MAXIMO_DE_INVITACIONES_POR_LOTE) {
    throw new Error(`La cantidad tiene que estar entre 1 y ${MAXIMO_DE_INVITACIONES_POR_LOTE}`);
  }
  const batchId = crypto.randomUUID();
  const filas: InfluencerInvite[] = [];
  for (let i = 0; i < cantidad; i++) {
    // Un choque de código (probabilidad despreciable con 32^12) se reintenta con otro.
    for (let intento = 0; intento < 5; intento++) {
      try {
        filas.push(
          await InfluencerInvite.create({
            code: generarCodigoDeInvitacion(),
            batchId,
            influencerName: nombre,
            influencerHandle: datos.usuario ? String(datos.usuario).trim().slice(0, 160) : null,
            freeDays: POLITICAS.INVITACION_DIAS_SIN_COMISION,
            expiresAt: datos.venceEl ?? null,
            createdById: datos.creadoPorId,
            notes: datos.notas ?? null,
          } as any),
        );
        break;
      } catch (error: any) {
        if (intento === 4 || error?.name !== 'SequelizeUniqueConstraintError') throw error;
      }
    }
  }
  await logEvento({
    action: 'INFLUENCER_INVITES_CREATED',
    actor: `user:${datos.creadoPorId}`,
    category: 'system',
    severity: 'low',
    description: `Se emitieron ${filas.length} invitaciones para ${nombre}`,
    performedBy: datos.creadoPorId,
    targetModel: 'InfluencerInvite',
    targetId: batchId,
    targetIdentifier: nombre,
    metadata: { cantidad: filas.length, dias: POLITICAS.INVITACION_DIAS_SIN_COMISION },
  });
  return { batchId, invitaciones: filas.map((f) => ({ id: f.id, code: f.code, enlace: enlaceDeInvitacion(f.code) })) };
}

export type ResultadoDelCanje =
  | { ok: true; hasta: Date; dias: number }
  | { ok: false; motivo: EstadoDeInvitacion | 'ya_canjeo_una' | 'ya_sin_comision' | 'usuario_inexistente'; mensaje: string };

/**
 * Canjea una invitación para una cuenta. Todo o nada: transacción con la invitación y la cuenta bloqueadas.
 * Si algo no cierra, devuelve el motivo y NO gasta la invitación.
 */
export async function canjearInvitacion(usuarioId: string, entrada: unknown): Promise<ResultadoDelCanje> {
  const codigo = normalizarCodigoDeInvitacion(entrada);
  if (!codigo) return { ok: false, motivo: 'inexistente', mensaje: MENSAJES.inexistente };

  const t = await sequelize.transaction();
  try {
    const inv = await InfluencerInvite.findOne({ where: { code: codigo }, transaction: t, lock: t.LOCK.UPDATE });
    const estado = estadoDeLaInvitacion(inv);
    if (estado !== 'valida') {
      await t.rollback();
      return { ok: false, motivo: estado, mensaje: MENSAJES[estado] };
    }
    const user: any = await User.findByPk(usuarioId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!user) {
      await t.rollback();
      return { ok: false, motivo: 'usuario_inexistente', mensaje: 'No encontramos tu cuenta.' };
    }
    if (user.influencerInviteId) {
      await t.rollback();
      return { ok: false, motivo: 'ya_canjeo_una', mensaje: 'Tu cuenta ya canjeó una invitación: se puede una sola.' };
    }
    if (user.hasFamilyPlan === true) {
      await t.rollback();
      return { ok: false, motivo: 'ya_sin_comision', mensaje: 'Tu cuenta ya está exenta de comisión (Plan Familia): no hace falta canjear la invitación.' };
    }

    const ahora = new Date();
    const hasta = calcularFinDelBeneficio(ahora, inv!.freeDays);
    inv!.redeemedById = user.id;
    inv!.redeemedAt = ahora;
    inv!.benefitEndsAt = hasta;
    await inv!.save({ transaction: t });
    user.commissionFreeUntil = hasta;
    user.influencerInviteId = inv!.id;
    await user.save({ transaction: t, fields: ['commissionFreeUntil', 'influencerInviteId'] });
    await t.commit();

    await logEvento({
      action: 'INFLUENCER_INVITE_REDEEMED',
      actor: `user:${user.id}`,
      category: 'user',
      severity: 'low',
      description: `${user.email} canjeó la invitación de ${inv!.influencerName}: sin comisión hasta ${hasta.toISOString().slice(0, 10)}`,
      performedBy: String(user.id),
      targetModel: 'InfluencerInvite',
      targetId: String(inv!.id),
      targetIdentifier: inv!.influencerName,
      changes: [{ field: 'commissionFreeUntil', oldValue: null, newValue: hasta.toISOString() }],
      metadata: { influencer: inv!.influencerName, batchId: inv!.batchId, dias: inv!.freeDays },
    });
    return { ok: true, hasta, dias: inv!.freeDays };
  } catch (error) {
    try {
      await t.rollback();
    } catch {
      /* ya cerrada */
    }
    throw error;
  }
}

/** Da de baja una invitación que todavía no se canjeó (queda anotado quién, cuándo y por qué). */
export async function darDeBajaInvitacion(id: string, motivo: string, adminId: string): Promise<{ ok: boolean; mensaje: string }> {
  const inv = await InfluencerInvite.findByPk(id);
  if (!inv) return { ok: false, mensaje: 'Invitación no encontrada' };
  if (inv.redeemedById) return { ok: false, mensaje: 'La invitación ya fue canjeada: no se puede dar de baja' };
  if (!inv.isActive) return { ok: false, mensaje: 'La invitación ya estaba dada de baja' };
  const razon = String(motivo || '').trim();
  if (razon.length < 5) return { ok: false, mensaje: 'Indicá el motivo (al menos 5 caracteres)' };
  await inv.update({ isActive: false, deactivatedReason: razon, deactivatedAt: new Date(), deactivatedById: adminId });
  await logEvento({
    action: 'INFLUENCER_INVITE_DEACTIVATED',
    actor: `user:${adminId}`,
    category: 'system',
    severity: 'low',
    description: `Se dio de baja una invitación de ${inv.influencerName}: ${razon}`,
    performedBy: adminId,
    targetModel: 'InfluencerInvite',
    targetId: String(inv.id),
    targetIdentifier: inv.influencerName,
    changes: [{ field: 'isActive', oldValue: true, newValue: false }],
    metadata: { motivo: razon, codigo: inv.code },
  });
  return { ok: true, mensaje: 'Invitación dada de baja' };
}

export interface LoteDeInvitaciones {
  batchId: string;
  influencer: string;
  handle: string | null;
  creadoEl: Date;
  total: number;
  canjeadas: number;
  invitaciones: Array<{
    id: string;
    code: string;
    enlace: string;
    estado: EstadoDeInvitacion;
    canjeadaPor: { id: string; name: string; email: string } | null;
    canjeadaEl: Date | null;
    beneficioHasta: Date | null;
  }>;
}

/** Los lotes con el estado de cada enlace y quién lo canjeó (para el panel del owner). */
export async function listarLotes(): Promise<LoteDeInvitaciones[]> {
  const filas = await InfluencerInvite.findAll({
    include: [{ model: User, as: 'redeemedBy', attributes: ['id', 'name', 'email'] }],
    order: [['createdAt', 'DESC'], ['code', 'ASC']],
  });
  const lotes = new Map<string, LoteDeInvitaciones>();
  for (const f of filas as any[]) {
    let l = lotes.get(f.batchId);
    if (!l) {
      l = { batchId: f.batchId, influencer: f.influencerName, handle: f.influencerHandle ?? null, creadoEl: f.createdAt, total: 0, canjeadas: 0, invitaciones: [] };
      lotes.set(f.batchId, l);
    }
    l.total += 1;
    if (f.redeemedById) l.canjeadas += 1;
    l.invitaciones.push({
      id: f.id,
      code: f.code,
      enlace: enlaceDeInvitacion(f.code),
      estado: estadoDeLaInvitacion(f),
      canjeadaPor: f.redeemedBy ? { id: f.redeemedBy.id, name: f.redeemedBy.name, email: f.redeemedBy.email } : null,
      canjeadaEl: f.redeemedAt ?? null,
      beneficioHasta: f.benefitEndsAt ?? null,
    });
  }
  return [...lotes.values()];
}
