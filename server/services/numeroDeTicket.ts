import type { Sequelize } from 'sequelize';
import { conSistema } from '../db/contextoRls.js';

/**
 * El número de un ticket nuevo (`TK-000123`), de una secuencia de la base (`tickets_numero_seq`).
 *
 * Antes era `Ticket.count() + 1`. Con Row Level Security cada persona ve solo sus tickets, así que el conteo daba otro número según quién
 * escribía y dos personas distintas recibían el mismo (`tickets_ticket_number` única → error 500). Aunque nadie viera filas ajenas, dos pedidos
 * a la vez también contaban igual. Una secuencia no depende de qué filas ve quien pide y no repite números.
 *
 * Si la secuencia todavía no existe (una base sin la migración `20261025120000`), cae al conteo viejo, mirando todas las filas.
 */
export async function siguienteNumeroDeTicket(sequelize: Sequelize): Promise<string> {
  let n: number;
  try {
    const [filas] = (await sequelize.query(`SELECT nextval('tickets_numero_seq') AS n`)) as [Array<{ n: string | number }>, unknown];
    n = Number(filas[0].n);
  } catch (e: any) {
    if ((e?.original?.code ?? e?.parent?.code) !== '42P01') throw e; // «la relación no existe»
    const [filas] = (await conSistema(() => sequelize.query(`SELECT COUNT(*)::int AS n FROM tickets`))) as [Array<{ n: number }>, unknown];
    n = Number(filas[0].n) + 1;
  }
  return `TK-${String(n).padStart(6, '0')}`;
}
