/**
 * Cada crédito del saldo de una persona, con el estado de AHORA del trabajo y del contrato del que viene (regla en `shared/pagos/retiroPorContrato.ts`).
 * Lo usan el saldo disponible para retirar, el pedido de retiro (que guarda de dónde sale cada peso) y la administración antes de aprobarlo o transferirlo.
 */
import { Op, QueryTypes } from 'sequelize';
import { sequelize } from '../config/database.js';
import { conSistema } from '../db/contextoRls.js';
import { conceptoDelCredito, esperaDelCredito, type ConceptoDelCredito, type EsperaDelCredito } from '../../shared/pagos/retiroPorContrato.js';

const r2 = (n: number) => Math.round(n * 100) / 100;
const RECLAMOS_ABIERTOS = ['negotiation', 'open', 'in_review', 'awaiting_info'];
const idDe = (v: unknown): string | null => (typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v) ? v : null);

export interface CreditoConEstado {
  movimientoId: string;
  monto: number;
  concepto: ConceptoDelCredito;
  creadoEl: Date;
  descripcion: string;
  disponibleDesde: string | null;
  trabajoId: string | null;
  trabajoTitulo: string | null;
  contratoId: string | null;
  /** null: ya se puede retirar. */
  espera: EsperaDelCredito | null;
}

interface Fila {
  id: string;
  type: string;
  amount: string | number;
  description: string;
  metadata: Record<string, any> | null;
  contratoId: string | null;
  creadoEl: Date;
}

/** Evalúa filas del libro contra el estado actual de sus trabajos y contratos. */
async function conEstado(filas: Fila[], ahora: Date): Promise<CreditoConEstado[]> {
  if (filas.length === 0) return [];
  const refs = filas.map((f) => {
    const m = f.metadata || {};
    return {
      contratoId: idDe(f.contratoId) ?? idDe(m.contractId) ?? (m.relatedModel === 'Contract' ? idDe(m.relatedId) : null),
      trabajoId: idDe(m.jobId) ?? (m.relatedModel === 'Job' ? idDe(m.relatedId) : null),
    };
  });
  const [{ Contract }, { Job }] = await Promise.all([import('../models/sql/Contract.model.js'), import('../models/sql/Job.model.js')]);

  const idsDeContratos = [...new Set(refs.map((r) => r.contratoId).filter((x): x is string => !!x))];
  const contratos = new Map<string, { estado: string; trabajoId: string | null }>();
  const conReclamo = new Set<string>();
  if (idsDeContratos.length) {
    const disputas = (await conSistema(() =>
      sequelize.query('SELECT contract_id AS id, bool_or(status::text IN (:estados)) AS abierta FROM disputes WHERE contract_id IN (:ids) GROUP BY contract_id', {
        replacements: { ids: idsDeContratos, estados: RECLAMOS_ABIERTOS },
        type: QueryTypes.SELECT,
      }),
    )) as Array<{ id: string; abierta: boolean }>;
    const reclamoDe = new Map(disputas.map((d) => [String(d.id), d.abierta === true]));
    for (const [id, abierta] of reclamoDe) if (abierta) conReclamo.add(id);
    for (const c of (await conSistema(() => Contract.findAll({ where: { id: { [Op.in]: idsDeContratos } } as any, attributes: ['id', 'status', 'jobId'], paranoid: false }))) as any[]) {
      let estado = String(c.status);
      if (['disputed', 'in_review'].includes(estado)) {
        // Un reclamo resuelto «sin medidas» deja el contrato marcado en disputa: mandan los reclamos. Si todos están cerrados, el contrato está cerrado (si no, la
        // plata quedaría trabada para siempre). Marcado en disputa sin ningún reclamo registrado se frena para que lo mire una persona.
        if (reclamoDe.get(String(c.id)) === false) estado = 'completed';
        else conReclamo.add(String(c.id));
      }
      contratos.set(String(c.id), { estado, trabajoId: c.jobId ? String(c.jobId) : null });
    }
  }

  const idsDeTrabajos = [...new Set([...refs.map((r) => r.trabajoId), ...[...contratos.values()].map((c) => c.trabajoId)].filter((x): x is string => !!x))];
  const trabajos = new Map<string, { estado: string; canceladoEl: Date | null; titulo: string }>();
  if (idsDeTrabajos.length) {
    for (const j of (await conSistema(() => Job.findAll({ where: { id: { [Op.in]: idsDeTrabajos } } as any, attributes: ['id', 'status', 'cancelledAt', 'title'], paranoid: false }))) as any[]) {
      trabajos.set(String(j.id), { estado: String(j.status), canceladoEl: j.cancelledAt ?? null, titulo: String(j.title || '') });
    }
  }

  return filas.map((f, i) => {
    const m = f.metadata || {};
    const concepto = conceptoDelCredito(f.type, m);
    const { contratoId, trabajoId: propio } = refs[i];
    const contrato = contratoId ? contratos.get(contratoId) ?? null : null;
    const trabajoId = propio ?? contrato?.trabajoId ?? null;
    const trabajo = trabajoId ? trabajos.get(trabajoId) ?? null : null;
    const disponibleDesde = m.disponibleDesde ? String(m.disponibleDesde) : null;
    return {
      movimientoId: String(f.id),
      monto: r2(Number(f.amount) || 0),
      concepto,
      creadoEl: new Date(f.creadoEl),
      descripcion: String(f.description || ''),
      disponibleDesde,
      trabajoId,
      trabajoTitulo: trabajo?.titulo || null,
      contratoId,
      espera: esperaDelCredito(
        {
          concepto,
          creadoEl: f.creadoEl,
          disponibleDesde,
          tieneTrabajo: !!propio,
          trabajo: propio ? trabajo : undefined,
          tieneContrato: !!contratoId,
          contrato: contratoId ? contrato : undefined,
          conReclamo: !!contratoId && conReclamo.has(contratoId),
        },
        ahora,
      ),
    };
  });
}

const COLUMNAS = 'id, type::text AS type, amount, description, metadata, related_contract_id AS "contratoId", created_at AS "creadoEl"';

/** Los créditos que todavía figuran en el saldo (los que ya salieron en un retiro vigente no se cuentan de nuevo), del más nuevo al más viejo. */
export async function creditosDelSaldo(userId: string, opciones: { ahora?: Date; transaction?: unknown } = {}): Promise<CreditoConEstado[]> {
  const filas = (await conSistema(() =>
    sequelize.query(
      `SELECT ${COLUMNAS} FROM balance_transactions b
        WHERE b.user_id = :userId AND b.status = 'completed' AND b.amount > 0
          AND (b.type::text IN ('refund', 'payment') OR b.metadata ? 'disponibleDesde')
          AND NOT EXISTS (SELECT 1 FROM withdrawal_requests w, jsonb_array_elements(COALESCE(w.metadata->'respaldo', '[]'::jsonb)) AS r
                           WHERE w.user_id = :userId AND w.status::text NOT IN ('rejected', 'cancelled') AND r->>'movimientoId' = b.id::text)
        ORDER BY b.created_at DESC`,
      { replacements: { userId }, type: QueryTypes.SELECT, transaction: opciones.transaction as any },
    ),
  )) as Fila[];
  return sinLoYaCorregido(userId, await conEstado(filas, opciones.ahora ?? new Date()), opciones.transaction);
}

/**
 * Un crédito que después se corrigió con un asiento de ajuste (una devolución de más, una baja que se deshizo) ya no está en el saldo: se le resta lo corregido de esa
 * publicación, empezando por el más viejo. Sin esto el crédito anulado seguiría «esperando» y trabaría la misma cantidad de otra plata.
 */
async function sinLoYaCorregido(userId: string, creditos: CreditoConEstado[], transaction?: unknown): Promise<CreditoConEstado[]> {
  const correcciones = (await conSistema(() =>
    sequelize.query(
      `SELECT COALESCE(metadata->>'corrigeLaPublicacion', metadata->>'jobId') AS trabajo, SUM(-amount) AS total FROM balance_transactions
        WHERE user_id = :userId AND type = 'adjustment' AND status = 'completed' AND amount < 0
          AND (metadata ? 'corrigeLaPublicacion' OR metadata->>'origen' = 'correccion_doble_devolucion')
        GROUP BY 1`,
      { replacements: { userId }, type: QueryTypes.SELECT, transaction: transaction as any },
    ),
  )) as Array<{ trabajo: string | null; total: string | number }>;
  if (correcciones.length === 0) return creditos;
  const queda = new Map(creditos.map((c) => [c.movimientoId, c.monto]));
  for (const x of correcciones) {
    let falta = r2(Number(x.total) || 0);
    for (const c of [...creditos].reverse()) {
      if (falta <= 0) break;
      if (c.trabajoId !== x.trabajo || c.concepto === 'cobro_del_trabajo') continue;
      const toma = Math.min(falta, queda.get(c.movimientoId)!);
      queda.set(c.movimientoId, r2(queda.get(c.movimientoId)! - toma));
      falta = r2(falta - toma);
    }
  }
  return creditos.map((c) => ({ ...c, monto: queda.get(c.movimientoId)! })).filter((c) => c.monto > 0);
}

export interface RespaldoDelRetiro {
  movimientoId: string;
  concepto: ConceptoDelCredito;
  monto: number;
  trabajoId: string | null;
  contratoId: string | null;
}

/** De qué créditos sale un retiro por `monto`: solo de los que ya se pueden retirar. */
export function armarRespaldo(creditos: CreditoConEstado[], monto: number): RespaldoDelRetiro[] {
  const respaldo: RespaldoDelRetiro[] = [];
  let falta = r2(monto);
  for (const c of creditos) {
    if (falta <= 0) break;
    if (c.espera) continue;
    const toma = r2(Math.min(falta, c.monto));
    respaldo.push({ movimientoId: c.movimientoId, concepto: c.concepto, monto: toma, trabajoId: c.trabajoId, contratoId: c.contratoId });
    falta = r2(falta - toma);
  }
  return respaldo;
}

/** El respaldo guardado en un retiro, con el estado de ahora de cada parte. */
export async function respaldoConEstado(respaldo: RespaldoDelRetiro[], ahora: Date = new Date()): Promise<CreditoConEstado[]> {
  const ids = respaldo.map((r) => r.movimientoId).filter((x) => idDe(x));
  if (ids.length === 0) return [];
  const filas = (await conSistema(() =>
    sequelize.query(`SELECT ${COLUMNAS} FROM balance_transactions WHERE id IN (:ids)`, { replacements: { ids }, type: QueryTypes.SELECT }),
  )) as Fila[];
  const montoDe = new Map(respaldo.map((r) => [r.movimientoId, r.monto]));
  return (await conEstado(filas, ahora)).map((c) => ({ ...c, monto: montoDe.get(c.movimientoId) ?? c.monto }));
}
