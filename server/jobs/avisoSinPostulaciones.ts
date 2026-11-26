import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database.js';
import { Notification } from '../models/sql/Notification.model.js';
import { conSistema } from '../db/contextoRls.js';
import { DIAS_ENTRE_AVISOS_A_LA_MISMA_PERSONA, HORAS_SIN_POSTULACIONES_PARA_AVISAR, claveDelAvisoSinPostulaciones } from '../../shared/momentos/momentos.js';

/**
 * Aviso con contexto (plan «Momentos DOAPP», prueba 2): una publicación abierta que lleva un día sin postulaciones recibe UN aviso con ideas concretas.
 * Topes: una vez por publicación y como mucho uno por persona cada 7 días. No molesta a quien apagó los avisos de sus trabajos, ni al equipo, ni si la fecha
 * de inicio ya pasó.
 */
export async function avisarPublicacionesSinPostulaciones(ahora: Date = new Date()): Promise<number> {
  return conSistema(async () => {
    const candidatas = (await sequelize.query(
      `SELECT DISTINCT ON (j.client_id) j.id, j.title, j.client_id AS cliente
         FROM jobs j JOIN users u ON u.id = j.client_id
        WHERE j.status = 'open' AND COALESCE(j.reviewed_at, j.created_at) <= :limite AND j.start_date > :ahora
          AND u.admin_role IS NULL AND u.merged_into_id IS NULL AND u.is_banned = false
          AND COALESCE(u.notification_preferences->>'jobUpdate', 'true') <> 'false'
          AND NOT EXISTS (SELECT 1 FROM proposals p WHERE p.job_id = j.id)
          AND NOT EXISTS (SELECT 1 FROM user_moments m WHERE m.user_id = j.client_id AND m.moment_key = 'sin_postulaciones:' || j.id::text)
          AND NOT EXISTS (SELECT 1 FROM user_moments m WHERE m.user_id = j.client_id AND m.moment_key LIKE 'sin\\_postulaciones:%' AND m.seen_at > :hace)
        ORDER BY j.client_id, j.start_date ASC
        LIMIT 200`,
      {
        replacements: {
          ahora: ahora.toISOString(),
          limite: new Date(ahora.getTime() - HORAS_SIN_POSTULACIONES_PARA_AVISAR * 3_600_000).toISOString(),
          hace: new Date(ahora.getTime() - DIAS_ENTRE_AVISOS_A_LA_MISMA_PERSONA * 86_400_000).toISOString(),
        },
        type: QueryTypes.SELECT,
      },
    )) as Array<{ id: string; title: string; cliente: string }>;

    let enviados = 0;
    for (const j of candidatas) {
      // Primero se reserva la marca: si dos corridas coinciden, solo una inserta y solo esa avisa.
      const reservada = (await sequelize.query(
        'INSERT INTO user_moments (user_id, moment_key, seen_at) VALUES (:cliente, :clave, :ahora) ON CONFLICT DO NOTHING RETURNING moment_key',
        { replacements: { cliente: j.cliente, clave: claveDelAvisoSinPostulaciones(j.id), ahora: ahora.toISOString() }, type: QueryTypes.SELECT },
      )) as unknown[];
      if (reservada.length === 0) continue;
      try {
        await Notification.create({
          recipientId: j.cliente,
          type: 'info',
          category: 'jobs',
          title: 'Tu publicación puede recibir más respuestas',
          message: `«${j.title}» espera su primera postulación. Sumar fotos, contar más detalles o revisar el precio ayuda a que te escriban.`,
          relatedModel: 'Job',
          relatedId: j.id,
          actionUrl: `/jobs/${j.id}`,
          sentVia: ['in_app'],
          data: { jobId: j.id },
        } as any);
        enviados++;
      } catch (e: any) {
        console.error('Aviso de publicación sin postulaciones:', e?.message);
      }
    }
    return enviados;
  });
}

export function startAvisoSinPostulacionesJob(): void {
  const correr = () => { void avisarPublicacionesSinPostulaciones().catch((e) => console.error('Aviso sin postulaciones:', e?.message)); };
  setInterval(correr, 60 * 60 * 1000);
}
