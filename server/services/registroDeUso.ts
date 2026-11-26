import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database.js';
import { DIAS_QUE_SE_GUARDA_EL_USO, MINUTOS_PARA_VISITA_NUEVA, SEGUNDOS_MAXIMOS_SUMADOS } from '../../shared/metricas/definiciones.js';

/** El día en hora argentina (UTC−3, sin horario de verano). */
export const diaArgentino = (fecha: Date): string => new Date(fecha.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);

export const PLATAFORMAS = ['web', 'android', 'ios'] as const;
export type Plataforma = (typeof PLATAFORMAS)[number];

/**
 * Un latido de uso. Se resuelve en UNA sola sentencia (dos pestañas a la vez no duplican la fila ni se pisan): el primer latido del día crea la fila con una
 * visita; los siguientes suman el tiempo si llegan seguidos, y cuentan una visita nueva si pasaron más de 30 minutos.
 */
export async function anotarLatido(userId: string, plataforma: Plataforma, ahora: Date = new Date()): Promise<void> {
  await sequelize.query(
    `INSERT INTO activity_days (user_id, day, platform, sessions, seconds, first_seen_at, last_seen_at)
     VALUES (:userId, :dia, :plataforma, 1, 0, :ahora, :ahora)
     ON CONFLICT (user_id, day, platform) DO UPDATE SET
       sessions = activity_days.sessions + CASE WHEN EXTRACT(EPOCH FROM (EXCLUDED.last_seen_at - activity_days.last_seen_at)) > :silencio THEN 1 ELSE 0 END,
       seconds = activity_days.seconds + CASE WHEN EXTRACT(EPOCH FROM (EXCLUDED.last_seen_at - activity_days.last_seen_at)) BETWEEN 0 AND :tope
         THEN ROUND(EXTRACT(EPOCH FROM (EXCLUDED.last_seen_at - activity_days.last_seen_at)))::int ELSE 0 END,
       last_seen_at = GREATEST(activity_days.last_seen_at, EXCLUDED.last_seen_at)`,
    { replacements: { userId, plataforma, dia: diaArgentino(ahora), ahora: ahora.toISOString(), silencio: MINUTOS_PARA_VISITA_NUEVA * 60, tope: SEGUNDOS_MAXIMOS_SUMADOS }, type: QueryTypes.INSERT },
  );
}

export async function sumarAlContador(nombre: 'apk_download' | 'app_first_open', ahora: Date = new Date()): Promise<void> {
  await sequelize.query(
    `INSERT INTO usage_counters (day, name, total) VALUES (:dia, :nombre, 1)
     ON CONFLICT (day, name) DO UPDATE SET total = usage_counters.total + 1`,
    { replacements: { dia: diaArgentino(ahora), nombre }, type: QueryTypes.INSERT },
  );
}

/** Borra el registro de uso más viejo que lo que se guarda (13 meses). */
export async function borrarUsoViejo(ahora: Date = new Date()): Promise<void> {
  const limite = diaArgentino(new Date(ahora.getTime() - DIAS_QUE_SE_GUARDA_EL_USO * 86_400_000));
  await sequelize.query('DELETE FROM activity_days WHERE day < :limite', { replacements: { limite } });
}
