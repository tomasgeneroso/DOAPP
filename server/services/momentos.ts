import { Op, QueryTypes } from 'sequelize';
import { sequelize } from '../config/database.js';
import { BalanceTransaction } from '../models/sql/BalanceTransaction.model.js';
import { Contract } from '../models/sql/Contract.model.js';
import { Job } from '../models/sql/Job.model.js';
import { Proposal } from '../models/sql/Proposal.model.js';
import { User } from '../models/sql/User.model.js';
import { Review } from '../models/sql/Review.model.js';
import { UserMoment } from '../models/sql/UserMoment.model.js';
import { cambioVigente, claveDelCambio, type CambioDePoliticas } from '../../shared/legal/cambiosDePoliticas.js';
import { CLAVE_BIENVENIDA, CLAVE_PRIMER_COBRO, DIAS_DE_CUENTA_NUEVA, MINIMO_PARA_DECIR_CUANTOS, type ResumenAnual } from '../../shared/momentos/momentos.js';
import { esRubroValido, etiquetaDeRubro } from '../../shared/perfiles/zonaDeTrabajo.js';

export interface PrimerCobro {
  contractId: string;
  jobId: string | null;
  titulo: string;
  /** Cómo le llegó: transferencia hecha por el equipo, o acreditado en su saldo de DOAPP. */
  via: 'transferencia' | 'saldo';
  /** Solo cuando es exacto (el movimiento del saldo). */
  monto: number | null;
}

export interface MomentosPendientes {
  cambioDePoliticas: CambioDePoliticas | null;
  primerCobro: PrimerCobro | null;
  /** «¿Venís a contratar o a trabajar?»: solo cuentas nuevas que todavía no hicieron ninguna de las dos cosas. */
  bienvenida: boolean;
}

const vio = async (userId: string, clave: string): Promise<boolean> => (await UserMoment.count({ where: { userId, momentKey: clave } })) > 0;

/**
 * El primer cobro de quien trabaja, solo con una marca inequívoca de que la plata le llegó: la transferencia que el equipo registró (`paymentProcessedAt`) o el
 * movimiento completado en su saldo. Si ya tiene dos o más trabajos cobrados no hay «primer cobro» que festejar.
 */
async function primerCobroDe(userId: string): Promise<PrimerCobro | null> {
  const transferidos = await Contract.findAll({
    where: { doerId: userId, status: 'completed', paymentStatus: 'completed', paymentProcessedAt: { [Op.ne]: null } } as any,
    attributes: ['id', 'jobId'], limit: 3,
  });
  const movimientos = await BalanceTransaction.findAll({
    where: { userId, type: 'payment', status: 'completed', relatedContractId: { [Op.ne]: null }, amount: { [Op.gt]: 0 } } as any,
    attributes: ['relatedContractId', 'amount'], limit: 20,
  });
  const alSaldo = movimientos.length
    ? await Contract.findAll({ where: { id: movimientos.map((m: any) => m.relatedContractId), doerId: userId } as any, attributes: ['id', 'jobId'] })
    : [];
  const todos = new Map<string, { jobId: string | null; via: PrimerCobro['via'] }>();
  for (const c of alSaldo as any[]) todos.set(String(c.id), { jobId: c.jobId ? String(c.jobId) : null, via: 'saldo' });
  for (const c of transferidos as any[]) todos.set(String(c.id), { jobId: c.jobId ? String(c.jobId) : null, via: 'transferencia' });
  if (todos.size !== 1) return null;
  const [contractId, dato] = [...todos.entries()][0];
  const trabajo: any = dato.jobId ? await Job.findByPk(dato.jobId, { attributes: ['title'] }) : null;
  const monto = dato.via === 'saldo'
    ? movimientos.filter((m: any) => String(m.relatedContractId) === contractId).reduce((s: number, m: any) => s + Number(m.amount), 0)
    : null;
  return { contractId, jobId: dato.jobId, titulo: String(trabajo?.title || 'Tu trabajo'), via: dato.via, monto };
}

async function correspondeLaBienvenida(userId: string, ahora: Date): Promise<boolean> {
  const u: any = await User.findByPk(userId, { attributes: ['role', 'createdAt', 'adminRole'] });
  if (!u || u.adminRole || u.role !== 'client') return false;
  if (ahora.getTime() - new Date(u.createdAt).getTime() > DIAS_DE_CUENTA_NUEVA * 86_400_000) return false;
  const [publicados, postulaciones] = await Promise.all([Job.count({ where: { clientId: userId } }), Proposal.count({ where: { freelancerId: userId } })]);
  return publicados === 0 && postulaciones === 0;
}

export async function momentosPendientes(userId: string, ahora: Date = new Date()): Promise<MomentosPendientes> {
  const cambio = cambioVigente();
  const [vioElCambio, vioElCobro, vioLaBienvenida] = await Promise.all([vio(userId, claveDelCambio(cambio.version)), vio(userId, CLAVE_PRIMER_COBRO), vio(userId, CLAVE_BIENVENIDA)]);
  return {
    cambioDePoliticas: vioElCambio ? null : cambio,
    primerCobro: vioElCobro ? null : await primerCobroDe(userId),
    bienvenida: vioLaBienvenida ? false : await correspondeLaBienvenida(userId, ahora),
  };
}

/** Marca un cartel o tarjeta como visto. Repetirlo no cambia la fecha de la primera vez. */
export async function marcarVisto(userId: string, clave: string, ahora: Date = new Date()): Promise<void> {
  await UserMoment.bulkCreate([{ userId, momentKey: clave, seenAt: ahora }] as any, { ignoreDuplicates: true });
}

/** El nombre de un rubro, venga guardado como id o ya como nombre. */
const nombreDelRubro = (c: string): string => (esRubroValido(c) ? etiquetaDeRubro(c) : c);

/** El año de quien trabaja: solo lo suyo, sin clientes, montos ni direcciones. */
export async function resumenAnual(userId: string, ahora: Date = new Date()): Promise<ResumenAnual> {
  const desde = new Date(ahora.getTime() - 365 * 86_400_000);
  const filas = (await sequelize.query(
    `SELECT j.category AS rubro, COUNT(*) AS cantidad FROM contracts c JOIN jobs j ON j.id = c.job_id
      WHERE c.doer_id = :userId AND c.status = 'completed' AND COALESCE(c.actual_end_date, c.updated_at) BETWEEN :desde AND :ahora
      GROUP BY j.category ORDER BY COUNT(*) DESC, j.category`,
    { replacements: { userId, desde: desde.toISOString(), ahora: ahora.toISOString() }, type: QueryTypes.SELECT },
  )) as Array<{ rubro: string; cantidad: string }>;
  const resenas: any[] = await Review.findAll({ where: { reviewedId: userId, isVisible: true, createdAt: { [Op.between]: [desde, ahora] } } as any, attributes: ['rating'] });
  return {
    desde: desde.toISOString(),
    hasta: ahora.toISOString(),
    trabajosTerminados: filas.reduce((s, f) => s + Number(f.cantidad), 0),
    rubros: filas.map((f) => ({ rubro: nombreDelRubro(f.rubro), cantidad: Number(f.cantidad) })),
    resenas: resenas.length,
    calificacionMedia: resenas.length ? resenas.reduce((s, r) => s + Number(r.rating), 0) / resenas.length : null,
  };
}

/**
 * Cuántas personas ofrecen un rubro (quienes lo eligieron expresamente). Solo el total, y solo desde el mínimo: por debajo se devuelve 0 para no señalar a nadie.
 * No dice «cerca»: todavía no se cruza con las zonas.
 */
export async function personasQueOfrecen(rubro: string): Promise<number> {
  const fila = (await sequelize.query(
    `SELECT COUNT(*) AS total FROM users u WHERE u.role IN ('doer','both') AND u.admin_role IS NULL AND u.merged_into_id IS NULL AND u.is_banned = false AND :rubro = ANY(u.work_categories)`,
    { replacements: { rubro }, type: QueryTypes.SELECT },
  )) as Array<{ total: string }>;
  const total = Number(fila[0]?.total || 0);
  return total >= MINIMO_PARA_DECIR_CUANTOS ? total : 0;
}
