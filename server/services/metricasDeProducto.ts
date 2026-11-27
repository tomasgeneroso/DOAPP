import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database.js';
import { diaArgentino } from './registroDeUso.js';
import { mediana, promedio, proporcion, type AdopcionDeFuncion, type Indice, type MetricasDeProducto } from '../../shared/metricas/definiciones.js';

/**
 * Índices de producto (qué es cada uno: shared/metricas/definiciones.ts). Solo devuelve TOTALES: ninguna consulta trae nombres, correos ni ids.
 * El equipo (cuentas con rol de panel) y las cuentas unidas a otra no cuentan.
 *
 * Los de uso salen del registro propio (`activity_days`), que empieza cuando se publica esta versión: hasta juntar los días necesarios dicen cuánto falta,
 * en vez de mostrar un número que parezca real. Los demás salen de lo que DOAPP ya tenía guardado.
 */

const DIA = 86_400_000;
const ESTADOS_CON_DINERO = ['completed', 'held_escrow', 'awaiting_confirmation', 'confirmed_for_payout', 'verified', 'approved'];

/** Condición «es una persona de la comunidad» sobre un alias de `users`. */
const esComunidad = (a: string) => `${a}.admin_role IS NULL AND ${a}.merged_into_id IS NULL`;

export async function metricasDeProducto(ahora: Date = new Date()): Promise<MetricasDeProducto> {
  const hoy = diaArgentino(ahora);
  const dia = (atras: number) => diaArgentino(new Date(ahora.getTime() - atras * DIA));
  const hace = (dias: number) => new Date(ahora.getTime() - dias * DIA).toISOString();
  const base = { ahora: ahora.toISOString(), hoy, d7: dia(7), d30: dia(30), d31: dia(31), d60: dia(60), t30: hace(30), t90: hace(90), estadosConDinero: ESTADOS_CON_DINERO };

  const filas = <T = any>(sql: string, extra: Record<string, unknown> = {}) =>
    sequelize.query(sql, { replacements: { ...base, ...extra }, type: QueryTypes.SELECT }) as Promise<T[]>;
  const una = async <T = any>(sql: string, extra: Record<string, unknown> = {}) => (await filas<T>(sql, extra))[0];
  const n = (v: unknown): number => Number(v ?? 0) || 0;

  // ───────── Uso ─────────
  // Las ventanas son de días COMPLETOS (hasta ayer): el día de hoy a medias bajaría los promedios.
  const usoDesde: string | null = (await una<{ desde: string | null }>(`SELECT MIN(day)::text AS desde FROM activity_days WHERE day <= :hoy`))?.desde ?? null;
  const diasCompletos = usoDesde ? Math.max(0, Math.round((Date.parse(hoy) - Date.parse(usoDesde)) / DIA)) : 0;
  const sinUso = 'El registro de uso empieza a juntar datos desde que se publica esta versión.';

  const activas = (desde: string) =>
    una<{ personas: string; visitas: string; segundos: string }>(
      `SELECT COUNT(DISTINCT a.user_id) AS personas, COALESCE(SUM(a.sessions),0) AS visitas, COALESCE(SUM(a.seconds),0) AS segundos
         FROM activity_days a JOIN users u ON u.id = a.user_id
        WHERE a.day >= :desde AND a.day < :hoy AND ${esComunidad('u')}`,
      { desde },
    );
  const [semana, mes] = await Promise.all([activas(base.d7), activas(base.d30)]);
  const usoPorDia = (
    await filas<{ dia: string; personas: string }>(
      `SELECT a.day::text AS dia, COUNT(DISTINCT a.user_id) AS personas FROM activity_days a JOIN users u ON u.id = a.user_id
        WHERE a.day >= :d30 AND a.day < :hoy AND ${esComunidad('u')} GROUP BY a.day ORDER BY a.day`,
    )
  ).map((f) => ({ dia: f.dia, personas: n(f.personas) }));
  const sumaDiaria = (desde: string) => usoPorDia.filter((f) => f.dia >= desde).reduce((s, f) => s + f.personas, 0);
  const dias7 = Math.min(7, diasCompletos);
  const dias30 = Math.min(30, diasCompletos);
  const dau: Indice = dias7 > 0 ? { valor: sumaDiaria(base.d7) / dias7, sobre: dias7 } : { valor: null, falta: sinUso };
  const personasMes = n(mes?.personas);
  const personas = (v: unknown): Indice => (diasCompletos > 0 ? { valor: n(v) } : { valor: null, falta: sinUso });
  const pegajosidad: Indice = dias30 >= 7 && personasMes > 0
    ? { valor: (sumaDiaria(base.d30) / dias30 / personasMes) * 100, sobre: personasMes }
    : { valor: null, falta: diasCompletos === 0 ? sinUso : 'Hacen falta al menos 7 días de registro.' };

  const retencion = async (dias: number): Promise<Indice> => {
    if (!usoDesde) return { valor: null, falta: sinUso };
    // Registrados desde que hay registro de uso y cuyo día N ya terminó.
    const f = await una<{ cohorte: string; volvieron: string }>(
      `WITH cohorte AS (
         SELECT u.id, ((u.created_at - INTERVAL '3 hours') AT TIME ZONE 'UTC')::date AS alta FROM users u WHERE ${esComunidad('u')}
       )
       SELECT COUNT(*) AS cohorte,
              COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM activity_days a WHERE a.user_id = c.id AND a.day = c.alta + CAST(:dias AS int))) AS volvieron
         FROM cohorte c WHERE c.alta >= CAST(:usoDesde AS date) AND c.alta + CAST(:dias AS int) < CAST(:hoy AS date)`,
      { dias, usoDesde },
    );
    return proporcion(n(f?.volvieron), n(f?.cohorte), `Todavía nadie registrado desde el ${usoDesde} llegó a su día ${dias}.`);
  };
  const [retencion1, retencion7, retencion30] = await Promise.all([retencion(1), retencion(7), retencion(30)]);

  let abandono: Indice = { valor: null, falta: diasCompletos === 0 ? sinUso : `Hacen falta 60 días de registro: van ${diasCompletos}.` };
  if (diasCompletos >= 60) {
    const f = await una<{ antes: string; perdidas: string }>(
      `WITH antes AS (SELECT DISTINCT a.user_id FROM activity_days a JOIN users u ON u.id = a.user_id WHERE a.day >= :d60 AND a.day < :d30 AND ${esComunidad('u')})
       SELECT COUNT(*) AS antes, COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM activity_days x WHERE x.user_id = antes.user_id AND x.day >= :d30 AND x.day < :hoy)) AS perdidas FROM antes`,
    );
    abandono = proporcion(n(f?.perdidas), n(f?.antes));
  }

  const plataformas = (
    await filas<{ plataforma: string; personas: string }>(
      `SELECT a.platform AS plataforma, COUNT(DISTINCT a.user_id) AS personas FROM activity_days a JOIN users u ON u.id = a.user_id
        WHERE a.day >= :d30 AND a.day <= :hoy AND ${esComunidad('u')} GROUP BY a.platform ORDER BY 2 DESC`,
    )
  ).map((f) => ({ plataforma: f.plataforma, personas: n(f.personas) }));

  const contador = async (nombre: string) => n((await una<{ total: string }>(`SELECT COALESCE(SUM(total),0) AS total FROM usage_counters WHERE name = :nombre AND day >= :d30 AND day <= :hoy`, { nombre }))?.total);
  const [descargas, aperturas] = await Promise.all([contador('apk_download'), contador('app_first_open')]);
  const primeraApertura = proporcion(aperturas, descargas, 'Todavía no hay descargas del APK contadas (30 días).');
  if (primeraApertura.valor !== null) primeraApertura.valor = Math.min(100, primeraApertura.valor);

  // ───────── Conversión ─────────
  const embudoFila = await una<Record<string, string>>(
    `WITH alta AS (SELECT u.id, u.is_verified, u.email FROM users u WHERE ${esComunidad('u')} AND u.created_at >= :t90 AND u.created_at <= :ahora),
     hechos AS (
       SELECT a.id,
         (a.is_verified AND COALESCE(a.email,'') <> '') AS confirmo,
         (EXISTS (SELECT 1 FROM jobs j WHERE j.client_id = a.id AND j.status <> 'draft') OR EXISTS (SELECT 1 FROM proposals p WHERE p.freelancer_id = a.id)) AS actuo,
         EXISTS (SELECT 1 FROM contracts c WHERE (c.client_id = a.id OR c.doer_id = a.id) AND c.status NOT IN ('cancelled','rejected')) AS contrato,
         (SELECT COUNT(*) FROM contracts c WHERE (c.client_id = a.id OR c.doer_id = a.id) AND c.status = 'completed') AS terminados
       FROM alta a)
     SELECT COUNT(*) AS registradas, COUNT(*) FILTER (WHERE confirmo) AS confirmaron, COUNT(*) FILTER (WHERE actuo) AS actuaron,
            COUNT(*) FILTER (WHERE contrato) AS con_contrato, COUNT(*) FILTER (WHERE terminados >= 1) AS terminaron, COUNT(*) FILTER (WHERE terminados >= 2) AS repitieron
       FROM hechos`,
  );
  const embudo = [
    { nombre: 'Se registraron', personas: n(embudoFila?.registradas) },
    { nombre: 'Confirmaron el correo', personas: n(embudoFila?.confirmaron) },
    { nombre: 'Publicaron o se postularon', personas: n(embudoFila?.actuaron) },
    { nombre: 'Llegaron a un contrato', personas: n(embudoFila?.con_contrato) },
    { nombre: 'Terminaron un contrato', personas: n(embudoFila?.terminaron) },
    { nombre: 'Terminaron dos o más', personas: n(embudoFila?.repitieron) },
  ];
  const conversion = proporcion(n(embudoFila?.terminaron), n(embudoFila?.registradas));

  const pro = await una<{ total: string; pro: string }>(
    `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE u.has_membership AND (u.membership_expires_at IS NULL OR u.membership_expires_at > :ahora)) AS pro
       FROM users u WHERE ${esComunidad('u')}`,
  );
  const avisos = await una<{ enviados: string; leidos: string }>(
    `SELECT COUNT(*) AS enviados, COUNT(*) FILTER (WHERE x.read) AS leidos FROM notifications x JOIN users u ON u.id = x.recipient_id
      WHERE x.created_at >= :t30 AND x.created_at <= :ahora AND ${esComunidad('u')}`,
  );

  // ───────── Adopción de funciones (30 días) ─────────
  const FUNCIONES: Array<[string, string]> = [
    ['Publicar un trabajo', `SELECT client_id AS id FROM jobs WHERE created_at >= :t30 AND created_at <= :ahora AND status <> 'draft'`],
    ['Postularse', `SELECT freelancer_id AS id FROM proposals WHERE created_at >= :t30 AND created_at <= :ahora`],
    ['Escribir en el chat', `SELECT sender_id AS id FROM chat_messages WHERE created_at >= :t30 AND created_at <= :ahora AND type <> 'system'`],
    ['Dejar una reseña', `SELECT reviewer_id AS id FROM reviews WHERE created_at >= :t30 AND created_at <= :ahora`],
    ['Publicar en el muro', `SELECT author AS id FROM posts WHERE created_at >= :t30 AND created_at <= :ahora`],
    ['Compartir un trabajo terminado', `SELECT author AS id FROM posts WHERE linked_contract IS NOT NULL AND created_at >= :t30 AND created_at <= :ahora`],
    ['Invitar con su código', `SELECT referrer_id AS id FROM referrals WHERE created_at >= :t30 AND created_at <= :ahora`],
  ];
  // La base es toda persona con alguna señal de vida en el período: entró (registro de uso) o hizo alguna de estas cosas. Así la tabla sirve desde el primer día.
  const todas = FUNCIONES.map(([, sql]) => sql).join(' UNION ');
  const baseDeAdopcion = n((await una<{ total: string }>(
    `SELECT COUNT(*) AS total FROM users u WHERE ${esComunidad('u')} AND u.id IN (
       ${todas} UNION SELECT user_id AS id FROM activity_days WHERE day >= :d30 AND day <= :hoy)`,
  ))?.total);
  const adopcion: AdopcionDeFuncion[] = await Promise.all(
    FUNCIONES.map(async ([nombre, sql]) => ({
      nombre,
      personas: n((await una<{ total: string }>(`SELECT COUNT(*) AS total FROM users u WHERE ${esComunidad('u')} AND u.id IN (${sql})`))?.total),
      base: baseDeAdopcion,
    })),
  );
  adopcion.sort((a, b) => b.personas - a.personas);

  // ───────── Salud del mercado ─────────
  const publicaciones = await filas<{ con_postulacion: boolean; con_contrato: boolean; horas: string | null }>(
    `SELECT EXISTS (SELECT 1 FROM proposals p WHERE p.job_id = j.id) AS con_postulacion,
            EXISTS (SELECT 1 FROM contracts c WHERE c.job_id = j.id AND c.status NOT IN ('cancelled','rejected')) AS con_contrato,
            (SELECT EXTRACT(EPOCH FROM (MIN(p.created_at) - COALESCE(j.reviewed_at, j.created_at))) / 3600 FROM proposals p WHERE p.job_id = j.id) AS horas
       FROM jobs j JOIN users u ON u.id = j.client_id
      WHERE ${esComunidad('u')} AND j.created_at >= :t30 AND j.created_at <= :ahora
        AND (j.status IN ('open','in_progress','completed','paused','suspended') OR (j.status = 'cancelled' AND j.reviewed_at IS NOT NULL))`,
  );
  const horas = mediana(publicaciones.filter((p) => p.horas !== null).map((p) => Math.max(0, Number(p.horas))));

  const repiten = async (columna: 'client_id' | 'doer_id'): Promise<Indice> => {
    const f = await una<{ con_uno: string; con_dos: string }>(
      `SELECT COUNT(*) AS con_uno, COUNT(*) FILTER (WHERE t.cuantos >= 2) AS con_dos FROM (
         SELECT c.${columna} AS id, COUNT(*) AS cuantos FROM contracts c JOIN users u ON u.id = c.${columna}
          WHERE c.status = 'completed' AND ${esComunidad('u')} GROUP BY c.${columna}) t`,
    );
    return proporcion(n(f?.con_dos), n(f?.con_uno));
  };
  const [clientesQueRepiten, trabajadoresQueRepiten] = await Promise.all([repiten('client_id'), repiten('doer_id')]);

  const distintos = async (sql: string) => n((await una<{ total: string }>(`SELECT COUNT(*) AS total FROM users u WHERE ${esComunidad('u')} AND u.id IN (${sql})`))?.total);
  const [trabajadoresActivos, clientesActivos] = await Promise.all([distintos(FUNCIONES[1][1]), distintos(FUNCIONES[0][1])]);

  const friccion = await una<{ total: string; cancelados: string; con_reclamo: string }>(
    `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE c.status IN ('cancelled','rejected')) AS cancelados,
            COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM disputes d WHERE d.contract_id = c.id)) AS con_reclamo
       FROM contracts c WHERE c.created_at >= :t90 AND c.created_at <= :ahora`,
  );
  const resenas = await una<{ cantidad: string; suma: string; contestaron: string; si: string }>(
    `SELECT COUNT(*) AS cantidad, COALESCE(SUM(rating),0) AS suma, COUNT(recommends_app) AS contestaron, COUNT(*) FILTER (WHERE recommends_app) AS si
       FROM reviews WHERE created_at >= :t90 AND created_at <= :ahora`,
  );

  // ───────── Dinero (30 días, en pesos) ─────────
  const volumen = n((await una<{ total: string }>(
    `SELECT COALESCE(SUM(c.price),0) AS total FROM contracts c WHERE c.status = 'completed'
        AND COALESCE(c.actual_end_date, c.updated_at) >= :t30 AND COALESCE(c.actual_end_date, c.updated_at) <= :ahora`,
  ))?.total);
  const plata = await una<{ comisiones: string; membresias: string; pagadores: string }>(
    `SELECT
       COALESCE(SUM(CASE WHEN p.payment_type <> 'membership' THEN p.platform_fee ELSE 0 END),0) AS comisiones,
       COALESCE(SUM(CASE WHEN p.payment_type = 'membership' THEN COALESCE((p.metadata->>'neto')::numeric, p.amount) ELSE 0 END),0) AS membresias,
       COUNT(DISTINCT p.payer_id) FILTER (WHERE p.payment_type = 'membership' OR COALESCE(p.platform_fee,0) > 0) AS pagadores
     FROM payments p
     WHERE p.status IN (:estadosConDinero) AND COALESCE(p.currency,'ARS') = 'ARS' AND p.created_at >= :t30 AND p.created_at <= :ahora`,
  );
  const comisiones = n(plata?.comisiones);
  const ingresos = comisiones + n(plata?.membresias);
  const pagadores = n(plata?.pagadores);
  const arpu: Indice = personasMes > 0 ? { valor: ingresos / personasMes, sobre: personasMes } : { valor: null, falta: sinUso };
  const ltv: Indice = arpu.valor !== null && abandono.valor !== null && abandono.valor > 0
    ? { valor: arpu.valor / (abandono.valor / 100), sobre: abandono.sobre }
    : { valor: null, falta: abandono.valor === 0 ? 'Con abandono 0 el cálculo no tiene techo: todavía es muy pronto.' : 'Necesita el abandono mensual (60 días de registro).' };

  return {
    calculadasEl: ahora.toISOString(),
    usoDesde,
    indices: {
      dau,
      wau: personas(semana?.personas),
      mau: personas(mes?.personas),
      pegajosidad,
      duracionDeVisita: promedio(n(mes?.segundos), n(mes?.visitas), sinUso),
      visitasPorPersona: promedio(n(mes?.visitas), personasMes, sinUso),
      primeraApertura,
      retencion1,
      retencion7,
      retencion30,
      abandono,
      conversion,
      conversionPro: proporcion(n(pro?.pro), n(pro?.total)),
      avisosAbiertos: proporcion(n(avisos?.leidos), n(avisos?.enviados)),
      volumen: { valor: volumen },
      ingresos: { valor: ingresos },
      tasaDeIngreso: volumen > 0 ? { valor: (comisiones / volumen) * 100 } : { valor: null, falta: 'No hubo contratos terminados en 30 días.' },
      arpu,
      arppu: promedio(ingresos, pagadores, 'Nadie pagó comisión ni membresía en 30 días.'),
      ltv,
      conPostulaciones: proporcion(publicaciones.filter((p) => p.con_postulacion).length, publicaciones.length),
      cubiertas: proporcion(publicaciones.filter((p) => p.con_contrato).length, publicaciones.length),
      horasHastaPostulacion: horas === null ? { valor: null, falta: 'Ninguna publicación reciente recibió postulaciones.' } : { valor: horas, sobre: publicaciones.filter((p) => p.horas !== null).length },
      clientesQueRepiten,
      trabajadoresQueRepiten,
      trabajadoresPorCliente: promedio(trabajadoresActivos, clientesActivos, 'Nadie publicó en los últimos 30 días.'),
      cancelados: proporcion(n(friccion?.cancelados), n(friccion?.total)),
      conReclamo: proporcion(n(friccion?.con_reclamo), n(friccion?.total)),
      calificacion: promedio(n(resenas?.suma), n(resenas?.cantidad)),
      recomiendan: proporcion(n(resenas?.si), n(resenas?.contestaron)),
    },
    embudo,
    adopcion,
    plataformas,
    usoPorDia,
  };
}
