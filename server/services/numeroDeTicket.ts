import type { Sequelize } from 'sequelize';
import { conSistema } from '../db/contextoRls.js';

/**
 * Los números que ve la gente (ticket `TK-000123`, cotización `COT-000045`) salen de una secuencia de la base, no de contar filas.
 *
 * Antes era `Ticket.count() + 1` (y lo mismo con las cotizaciones). Con Row Level Security cada persona ve solo sus filas, así que el conteo daba otro número
 * según quién escribía y dos personas distintas recibían el mismo (la unicidad devolvía un 500). Aunque nadie viera filas ajenas, dos pedidos a la vez también
 * contaban igual. Una secuencia no depende de qué filas ve quien pide y no repite números.
 *
 * Si la secuencia todavía no existe (una base sin la migración correspondiente), cae al conteo viejo, mirando todas las filas.
 */
async function siguienteNumero(sequelize: Sequelize, secuencia: string, prefijo: string, tabla: string): Promise<string> {
  let n: number;
  try {
    const [filas] = (await sequelize.query(`SELECT nextval('${secuencia}') AS n`)) as [Array<{ n: string | number }>, unknown];
    n = Number(filas[0].n);
  } catch (e: any) {
    if ((e?.original?.code ?? e?.parent?.code) !== '42P01') throw e; // «la relación no existe»
    const [filas] = (await conSistema(() => sequelize.query(`SELECT COUNT(*)::int AS n FROM ${tabla}`))) as [Array<{ n: number }>, unknown];
    n = Number(filas[0].n) + 1;
  }
  return `${prefijo}-${String(n).padStart(6, '0')}`;
}

/** `TK-000123`. Migración `20261025120000` y espejo en `ensureSchema`. */
export const siguienteNumeroDeTicket = (sequelize: Sequelize): Promise<string> => siguienteNumero(sequelize, 'tickets_numero_seq', 'TK', 'tickets');

/** `COT-000045`. Migración `20261026110000` y espejo en `ensureSchema`. */
export const siguienteNumeroDeCotizacion = (sequelize: Sequelize): Promise<string> => siguienteNumero(sequelize, 'quotes_numero_seq', 'COT', 'quotes');
