import { QueryTypes } from 'sequelize';
import { sequelize } from '../../server/config/database.js';
import { conSistema } from '../../server/db/contextoRls.js';

/**
 * Para los tests de Row Level Security: filas por SQL con valores de relleno para todo lo obligatorio, así una sola función sirve a cualquier tabla y el
 * test no depende de cómo cada modelo arma su fila (depende solo de lo que dicen las políticas).
 */
export const lit = (v: string) => `'${v.replace(/'/g, "''")}'`;
export const filas = <T extends object = any>(sql: string, replacements?: Record<string, unknown>) => sequelize.query<T>(sql, { type: QueryTypes.SELECT, replacements });

interface Col { column_name: string; udt_name: string; data_type: string; character_maximum_length: number | null }

async function relleno(c: Col): Promise<string> {
  const u = c.udt_name;
  const largo = Math.min(c.character_maximum_length ?? 30, 30);
  if (u === 'uuid') return `md5(random()::text || clock_timestamp()::text)::uuid`;
  if (['text', 'varchar', 'bpchar'].includes(u)) return `substr(md5(random()::text || clock_timestamp()::text), 1, ${largo})`;
  if (['int2', 'int4', 'int8', 'numeric', 'float4', 'float8'].includes(u)) return '0';
  if (u === 'bool') return 'false';
  if (u === 'timestamptz' || u === 'timestamp') return 'now()';
  if (u === 'date') return 'current_date';
  if (u === 'jsonb' || u === 'json') return `'{}'::${u}`;
  if (u === 'bytea') return `'\\x00'::bytea`;
  if (u === 'inet') return `'127.0.0.1'::inet`;
  if (u.startsWith('_')) return `'{}'`;
  if (c.data_type === 'USER-DEFINED') {
    const [e] = await filas<{ enumlabel: string }>(`SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = :u ORDER BY e.enumsortorder LIMIT 1`, { u });
    return `${lit(e.enumlabel)}::"${u}"`;
  }
  throw new Error(`sin valor de relleno para ${c.column_name} (${u})`);
}

/** Inserta una fila con todo lo obligatorio relleno; `over` pisa columnas con expresiones SQL. Devuelve la fila insertada. */
export async function insertar(tabla: string, over: Record<string, string>, comoApp = false): Promise<any> {
  const hacer = async () => {
    const cols = await filas<Col>(
      `SELECT column_name, udt_name, data_type, character_maximum_length FROM information_schema.columns WHERE table_schema = 'public' AND table_name = :t AND is_nullable = 'NO' AND column_default IS NULL`,
      { t: tabla },
    );
    const valores: Record<string, string> = {};
    for (const c of cols) valores[c.column_name] = await relleno(c);
    Object.assign(valores, over);
    const nombres = Object.keys(valores).map((c) => `"${c}"`).join(', ');
    try {
      const [fila] = await filas(`INSERT INTO "${tabla}" (${nombres}) VALUES (${Object.values(valores).join(', ')}) RETURNING *`);
      return fila;
    } catch (e: any) {
      const p = e?.parent ?? e?.original;
      throw new Error(`${tabla}: ${p?.message ?? e?.message}${p?.code ? ` [${p.code}]` : ''}`);
    }
  };
  return comoApp ? hacer() : conSistema(hacer);
}
