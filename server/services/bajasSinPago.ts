/**
 * Busca saldo acreditado por bajar un presupuesto SIN un pago real detrás (hasta el 2026-11-27 la ruta de cambiar presupuesto no miraba si la publicación estaba pagada).
 * Solo LEE: lo que aparezca se revisa a mano y, si corresponde, se corrige con un asiento (`ajustarSaldo.ts`).
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database.js';
import { conSistema } from '../db/contextoRls.js';

export interface BajaSinPago {
  movimiento: string;
  persona: string;
  monto: number;
  fecha: Date;
  trabajo: string;
  estadoDelTrabajo: string | null;
  retirosPedidosDespues: number;
}

export const CONSULTA_DE_BAJAS_SIN_PAGO = `
SELECT bt.id AS movimiento, bt.user_id AS persona, bt.amount AS monto, bt.created_at AS fecha, bt.metadata->>'relatedId' AS trabajo, j.status::text AS "estadoDelTrabajo",
       (SELECT COALESCE(SUM(w.amount), 0) FROM withdrawal_requests w WHERE w.user_id = bt.user_id AND w.created_at >= bt.created_at AND w.status::text NOT IN ('rejected', 'cancelled')) AS "retirosPedidosDespues"
  FROM balance_transactions bt
  LEFT JOIN jobs j ON j.id::text = bt.metadata->>'relatedId'
 WHERE bt.metadata->>'relatedModel' = 'Job'
   AND bt.metadata->>'reason' = 'price_decrease'
   AND bt.status::text <> 'failed'
   AND NOT EXISTS (SELECT 1 FROM payments p WHERE (p.job_id = j.id OR p.id = j.publication_payment_id) AND p.created_at <= bt.created_at
                     AND p.status::text IN ('completed', 'approved', 'verified', 'held_escrow', 'confirmed_for_payout', 'refunded'))
   AND NOT EXISTS (SELECT 1 FROM balance_transactions d WHERE d.amount < 0 AND d.metadata->>'relatedId' = bt.metadata->>'relatedId' AND d.user_id = bt.user_id AND d.created_at <= bt.created_at)
 ORDER BY bt.created_at DESC`;

export async function bajasSinPago(): Promise<BajaSinPago[]> {
  const filas = await conSistema(() => sequelize.query(CONSULTA_DE_BAJAS_SIN_PAGO, { type: QueryTypes.SELECT }));
  return (filas as any[]).map((f) => ({ ...f, monto: Number(f.monto), retirosPedidosDespues: Number(f.retirosPedidosDespues) }));
}
