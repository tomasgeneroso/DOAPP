import { Op } from 'sequelize';
import { AuditLog } from '../models/sql/AuditLog.model.js';
import { User } from '../models/sql/User.model.js';
import { Notification } from '../models/sql/Notification.model.js';
import { DONDE_ES_ADMIN } from '../utils/admins.js';
import { logEvento } from '../utils/auditLog.js';

/**
 * Cuentas cuyo DNI, leído por Didit del documento, ya lo usa OTRA cuenta.
 *
 * `aplicarIdentidadDeDidit` no toca nada en ese caso (falla cerrada) y deja el evento `KYC_DNI_EN_USO`. Un evento en el registro de
 * auditoría no lo mira nadie: acá se vuelve una lista de trabajo (Administración → Identidad a revisar) con quién es la cuenta, cuál
 * es la otra, y un «revisado» que queda anotado (quién, cuándo y qué se resolvió). No hay tabla nueva: la fuente son los mismos
 * eventos de auditoría, así que no hay nada que migrar ni que se pueda desincronizar.
 */
export const ACCION_CONFLICTO_DE_DNI = 'KYC_DNI_EN_USO';
export const ACCION_CONFLICTO_REVISADO = 'KYC_DNI_EN_USO_REVISADO';

export interface ConflictoDeDni {
  userId: string;
  nombre: string;
  email: string;
  dniDeLaCuenta: string | null;
  dniDeDidit: string | null;
  dniVerificado: boolean;
  otraCuenta: { id: string; nombre: string; email: string; dniVerificado: boolean } | null;
  /** La otra cuenta todavía tiene ese DNI (si ya no lo tiene, el choque se resolvió solo). */
  otraSigueConEseDni: boolean;
  detectadoEl: string;
  estado: 'pendiente' | 'revisado';
  revisadoEl?: string;
  revisadoPor?: string | null;
  nota?: string | null;
}

const meta = (ev: any): Record<string, any> => (ev && typeof ev.metadata === 'object' && ev.metadata ? ev.metadata : {});

/** ¿Ya hay un aviso de ESTE choque (misma cuenta, mismo DNI)? Se consulta antes de volver a registrarlo: el estado de Didit se pregunta seguido. */
export async function yaSeRegistroElConflicto(userId: string, dniDeDidit: string): Promise<boolean> {
  const previos = await AuditLog.findAll({ where: { action: ACCION_CONFLICTO_DE_DNI, targetId: String(userId) }, order: [['createdAt', 'DESC']], limit: 50 });
  return previos.some((p: any) => String(meta(p).dniDeDidit) === String(dniDeDidit));
}

/** Aviso a administración (campana de la app). No lanza: un fallo al avisar no puede frenar lo que Didit ya resolvió. */
export async function avisarConflictoDeDni(userId: string, nombre: string): Promise<void> {
  try {
    const admins = await User.findAll({ where: { ...DONDE_ES_ADMIN }, attributes: ['id'] });
    for (const a of admins) {
      await Notification.create({
        recipientId: a.id,
        type: 'warning',
        category: 'admin',
        title: 'DNI repetido detectado por Didit',
        message: `${nombre || 'Una cuenta'} verificó su identidad con un DNI que ya usa otra cuenta. No se cambió nada: hay que revisarlo.`,
        relatedModel: 'User',
        relatedId: String(userId),
        actionText: 'Revisar',
        actionUrl: '/admin/identidad-a-revisar',
        sentVia: ['in_app'],
      } as any);
    }
  } catch (e: any) {
    console.error('No se pudo avisar el DNI repetido a administración:', e?.message);
  }
}

export async function listarConflictosDeDni(opciones: { incluirRevisados?: boolean } = {}): Promise<ConflictoDeDni[]> {
  const eventos = await AuditLog.findAll({ where: { action: ACCION_CONFLICTO_DE_DNI, targetId: { [Op.ne]: null } }, order: [['createdAt', 'DESC']], limit: 1000 });

  // El más reciente de cada cuenta.
  const ultimoPorCuenta = new Map<string, any>();
  for (const ev of eventos as any[]) if (!ultimoPorCuenta.has(String(ev.targetId))) ultimoPorCuenta.set(String(ev.targetId), ev);
  if (ultimoPorCuenta.size === 0) return [];

  const ids = [...ultimoPorCuenta.keys()];
  const revisiones = await AuditLog.findAll({ where: { action: ACCION_CONFLICTO_REVISADO, targetId: { [Op.in]: ids } }, order: [['createdAt', 'DESC']] });
  const ultimaRevision = new Map<string, any>();
  for (const r of revisiones as any[]) if (!ultimaRevision.has(String(r.targetId))) ultimaRevision.set(String(r.targetId), r);

  const usuarios = await User.findAll({ where: { id: { [Op.in]: ids } }, attributes: ['id', 'name', 'email', 'dni', 'dniVerified'] });
  const porId = new Map<string, any>((usuarios as any[]).map((u) => [String(u.id), u]));

  const idsAjenos = [...ultimoPorCuenta.values()].map((e) => meta(e).otraCuenta).filter(Boolean).map(String);
  const ajenos = idsAjenos.length ? await User.findAll({ where: { id: { [Op.in]: idsAjenos } }, attributes: ['id', 'name', 'email', 'dni', 'dniVerified'] }) : [];
  const ajenoPorId = new Map<string, any>((ajenos as any[]).map((u) => [String(u.id), u]));

  const salida: ConflictoDeDni[] = [];
  for (const [userId, ev] of ultimoPorCuenta) {
    const u = porId.get(userId);
    if (!u) continue;
    const m = meta(ev);
    const dniDeDidit = m.dniDeDidit ? String(m.dniDeDidit) : null;
    // Si la cuenta ya tiene ese DNI (alguien lo corrigió), no hay nada que revisar.
    if (dniDeDidit && String(u.dni || '') === dniDeDidit) continue;
    const rev = ultimaRevision.get(userId);
    const revisado = !!rev && new Date(rev.createdAt).getTime() >= new Date(ev.createdAt).getTime();
    if (revisado && !opciones.incluirRevisados) continue;
    const otra = m.otraCuenta ? ajenoPorId.get(String(m.otraCuenta)) : null;
    salida.push({
      userId,
      nombre: u.name,
      email: u.email,
      dniDeLaCuenta: u.dni ? String(u.dni) : null,
      dniDeDidit,
      dniVerificado: !!u.dniVerified,
      otraCuenta: otra ? { id: String(otra.id), nombre: otra.name, email: otra.email, dniVerificado: !!otra.dniVerified } : m.otraCuenta ? { id: String(m.otraCuenta), nombre: '(cuenta borrada)', email: '', dniVerificado: false } : null,
      otraSigueConEseDni: !!otra && !!dniDeDidit && String(otra.dni || '') === dniDeDidit,
      detectadoEl: new Date(ev.createdAt).toISOString(),
      estado: revisado ? 'revisado' : 'pendiente',
      revisadoEl: revisado ? new Date(rev.createdAt).toISOString() : undefined,
      revisadoPor: revisado ? (rev.performedBy ? String(rev.performedBy) : null) : undefined,
      nota: revisado ? meta(rev).nota ?? null : undefined,
    });
  }
  // Primero lo pendiente, y dentro de cada grupo lo más nuevo arriba.
  salida.sort((a, b) => (a.estado === b.estado ? b.detectadoEl.localeCompare(a.detectadoEl) : a.estado === 'pendiente' ? -1 : 1));
  return salida;
}

export async function contarConflictosDeDni(): Promise<number> {
  return (await listarConflictosDeDni()).length;
}

export class ErrorDeRevision extends Error {
  constructor(message: string, public estado: number) {
    super(message);
  }
}

/** Una persona de administración da por revisado el choque. La nota es obligatoria: queda escrito qué se resolvió y por qué. */
export async function marcarConflictoRevisado(userId: string, adminId: string, nota: unknown): Promise<void> {
  const texto = typeof nota === 'string' ? nota.trim() : '';
  if (texto.length < 10) throw new ErrorDeRevision('Escribí qué se resolvió (al menos 10 caracteres): queda en el registro.', 400);
  if (texto.length > 1000) throw new ErrorDeRevision('La nota es demasiado larga (máximo 1000 caracteres).', 400);

  const pendiente = (await listarConflictosDeDni()).find((c) => c.userId === String(userId));
  if (!pendiente) throw new ErrorDeRevision('Esa cuenta no tiene un DNI repetido pendiente de revisión.', 404);

  await logEvento({
    action: ACCION_CONFLICTO_REVISADO,
    actor: `user:${adminId}`,
    performedBy: adminId,
    category: 'user',
    severity: 'medium',
    description: `Un administrador revisó el DNI repetido de la cuenta ${userId}.`,
    targetModel: 'User',
    targetId: String(userId),
    metadata: { nota: texto, dniDeDidit: pendiente.dniDeDidit, otraCuenta: pendiente.otraCuenta?.id ?? null },
  });
}
