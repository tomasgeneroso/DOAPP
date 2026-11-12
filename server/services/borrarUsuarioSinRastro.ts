import { QueryTypes, Transaction } from 'sequelize';

/**
 * Borrar una cuenta SIN dejar rastro (pedido del dueño, 2026-11-12: «eliminar este usuario desde la DB y no dejar ningún rastro»).
 *
 * Qué hace distinto de `user.destroy()`: no depende de que cada tabla tenga su `ON DELETE CASCADE`. Recorre TODAS las tablas de la base (`information_schema`)
 * y busca la cuenta de dos maneras:
 *   - REFERENCIA: una columna que guarda su id (uuid, o texto igual al id) → esas filas se borran (en `users`, las demás cuentas que la nombran —quien la
 *     refirió, una unión— solo pierden el vínculo: la fila de la otra persona NO se borra);
 *   - TEXTO: una columna de texto o JSON que nombra su id o su correo (avisos, registros de auditoría, notificaciones) → esas filas se borran solo en las
 *     tablas que son puro rastro (`TABLAS_DE_RASTRO`); en cualquier otra se avisa para mirarla a mano.
 * Todo en UNA transacción: si algo no se puede borrar (la base no deja, un vínculo con otra cosa), no se borra NADA.
 *
 * Es irreversible y borra también lo que la cuenta tenía con otras personas (contratos, mensajes): el script que la llama pide confirmación y frena si hay
 * dinero o terceros en el medio (`riesgos`).
 */

/** Tablas donde una fila que nombra a la cuenta es solo rastro, no un dato de otra persona. */
export const TABLAS_DE_RASTRO = new Set([
  'audit_logs', 'data_access_logs', 'notifications', 'login_devices', 'consent_logs', 'refresh_tokens', 'password_reset_tokens', 'action_passwords',
  'email_logs', 'campaign_recipients', 'push_subscriptions', 'user_sessions', 'security_events', 'rate_limit_logs',
]);

/**
 * Tablas donde una fila con el correo o el documento de la cuenta ES de esa misma persona (no de otra): la lista de identidades baneadas guarda el correo y el
 * DNI de quien fue baneado. Una fila ahí que coincide con la cuenta se borra con ella. OJO: quitarla deja a esa persona libre para registrarse de nuevo, por eso
 * `riesgos` lo avisa y el script pide `--forzar`.
 */
export const TABLAS_DE_IDENTIDAD_PROPIA = new Set(['banned_identities']);

/** Lo que identifica a la cuenta además de su id y su correo: el nombre de usuario, el DNI y el teléfono (sin esto «el usuario» quedaba en textos y listas). */
export interface DatosDeLaCuenta {
  username?: string | null;
  dni?: string | null;
  phone?: string | null;
}

export interface Hallazgo {
  tabla: string;
  columna: string;
  filas: number;
  /** `referencia`: la columna guarda su id. `texto`: la columna nombra su id o su correo dentro de un texto o un JSON. */
  tipo: 'referencia' | 'texto';
}

interface Columna { tabla: string; columna: string; tipo: string }

const q = (nombre: string): string => `"${nombre.replace(/"/g, '""')}"`;
const escaparLike = (s: string): string => s.replace(/[\\%_]/g, (c) => `\\${c}`);

async function columnasDeLaBase(t?: Transaction): Promise<Columna[]> {
  const { sequelize } = await import('../config/database.js');
  const filas = (await sequelize.query(
    `SELECT c.table_name AS tabla, c.column_name AS columna, c.data_type AS tipo
       FROM information_schema.columns c
       JOIN information_schema.tables tb ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name AND tb.table_type = 'BASE TABLE'
      WHERE c.table_schema = 'public' AND c.table_name <> 'SequelizeMeta'
        AND c.data_type IN ('uuid', 'character varying', 'text', 'json', 'jsonb', 'ARRAY')
      ORDER BY c.table_name, c.ordinal_position`,
    { type: QueryTypes.SELECT, transaction: t },
  )) as Columna[];
  return filas;
}

/** La condición con la que una columna nombra a la cuenta, o null si ese tipo de columna no se mira. */
function condicion(c: Columna): { sql: string; tipo: Hallazgo['tipo'] } | null {
  const col = q(c.columna);
  if (c.tipo === 'uuid') return { sql: `${col} = :id`, tipo: 'referencia' };
  if (c.tipo === 'ARRAY') return { sql: `${col}::text ILIKE :likeId ESCAPE '\\'`, tipo: 'texto' };
  if (c.tipo === 'character varying' || c.tipo === 'text') {
    // Una columna de texto que ES el id de la cuenta es una referencia (hay tablas que lo guardan como texto). Un texto que solo lo nombra, es rastro.
    return { sql: `(${col} = :idTexto)`, tipo: 'referencia' };
  }
  return { sql: `${col}::text ILIKE :likeId ESCAPE '\\'`, tipo: 'texto' };
}

function reemplazos(userId: string, email: string, datos: DatosDeLaCuenta = {}) {
  const usuario = (datos.username || '').trim().toLowerCase();
  const dni = (datos.dni || '').trim();
  const telefono = (datos.phone || '').trim();
  return {
    id: userId,
    idTexto: userId,
    likeId: `%${escaparLike(userId)}%`,
    likeCorreo: `%${escaparLike(email.toLowerCase())}%`,
    // Vacío = no se busca por eso (un valor vacío igualaría a todas las filas vacías).
    usuario: usuario || null,
    likeUsuarioEntreComillas: usuario ? `%"${escaparLike(usuario)}"%` : null,
    dni: dni || null,
    likeDniEntreComillas: dni ? `%"${escaparLike(dni)}"%` : null,
    telefono: telefono || null,
  };
}

type Reemplazos = ReturnType<typeof reemplazos>;

/**
 * Cuando una columna de texto o JSON NOMBRA a la cuenta (no la referencia): su id o su correo dentro de un texto, y su usuario, DNI o teléfono ENTEROS (igualdad
 * exacta o entre comillas en un JSON: un «juan» suelto dentro de una frase no cuenta, es otra cosa).
 */
function condicionDeTexto(c: Columna, r: Reemplazos): string {
  const col = q(c.columna);
  const esTexto = c.tipo === 'character varying' || c.tipo === 'text';
  const cast = esTexto ? col : `${col}::text`;
  const partes = [`${cast} ILIKE :likeCorreo ESCAPE '\\'`, `${cast} ILIKE :likeId ESCAPE '\\'`];
  if (r.usuario) partes.push(esTexto ? `lower(${col}) = :usuario` : `${cast} ILIKE :likeUsuarioEntreComillas ESCAPE '\\'`);
  if (r.dni) partes.push(esTexto ? `${col} = :dni` : `${cast} ILIKE :likeDniEntreComillas ESCAPE '\\'`);
  if (r.telefono && esTexto) partes.push(`${col} = :telefono`);
  return `(${partes.join(' OR ')})`;
}

/** En `users` la fila de la cuenta misma nombra su propio correo y usuario: esa no cuenta. */
const sinLaFilaPropia = (tabla: string): string => (tabla === 'users' ? ' AND "id" <> :id' : '');

/** Para mirar a mano: la consulta lista para pegar en psql, con los valores escritos (para las filas que el script no se anima a borrar solo). */
export function consultaDeRevision(h: Hallazgo, userId: string, email: string, datos: DatosDeLaCuenta = {}): string {
  const lit = (s: string): string => `'${s.replace(/'/g, "''")}'`;
  const partes = [`"${h.columna}"::text ILIKE ${lit('%' + email.toLowerCase() + '%')}`, `"${h.columna}"::text ILIKE ${lit('%' + userId + '%')}`];
  if (datos.username) partes.push(`lower("${h.columna}"::text) IN (${lit(datos.username.toLowerCase())}, ${lit('"' + datos.username.toLowerCase() + '"')})`);
  if (datos.dni) partes.push(`"${h.columna}"::text = ${lit(datos.dni)}`);
  return `SELECT * FROM "${h.tabla}" WHERE ${partes.join(' OR ')};`;
}

/** Solo LEE: cuántas filas de cada tabla nombran a la cuenta. */
export async function buscarRastros(userId: string, email: string, datos: DatosDeLaCuenta = {}): Promise<Hallazgo[]> {
  const { sequelize } = await import('../config/database.js');
  const columnas = await columnasDeLaBase();
  const r = reemplazos(userId, email, datos);
  const hallazgos: Hallazgo[] = [];
  for (const c of columnas) {
    if (c.tabla === 'users' && c.columna === 'id') continue; // la fila de la cuenta se cuenta aparte
    const refs = condicion(c);
    if (refs) {
      const [fila] = (await sequelize.query(`SELECT COUNT(*)::int AS n FROM ${q(c.tabla)} WHERE ${refs.sql}`, { replacements: r, type: QueryTypes.SELECT })) as Array<{ n: number }>;
      if (fila.n > 0) hallazgos.push({ tabla: c.tabla, columna: c.columna, filas: fila.n, tipo: refs.tipo });
    }
    // El correo (y el id) dentro de textos largos y JSON: solo en columnas de texto libre, nunca en las que ya son el id.
    if (c.tipo !== 'uuid') {
      const texto = condicionDeTexto(c, r) + sinLaFilaPropia(c.tabla);
      const [fila] = (await sequelize.query(`SELECT COUNT(*)::int AS n FROM ${q(c.tabla)} WHERE ${texto}`, { replacements: r, type: QueryTypes.SELECT })) as Array<{ n: number }>;
      if (fila.n > 0 && !hallazgos.some((h) => h.tabla === c.tabla && h.columna === c.columna && h.tipo === 'referencia' && h.filas === fila.n)) {
        hallazgos.push({ tabla: c.tabla, columna: c.columna, filas: fila.n, tipo: 'texto' });
      }
    }
  }
  return hallazgos;
}

export interface ResultadoDelBorrado {
  borradas: Array<{ tabla: string; columna: string; filas: number }>;
  desvinculadas: Array<{ tabla: string; columna: string; filas: number }>;
  aRevisarAMano: Hallazgo[];
}

/** Borra la cuenta y todo lo que la nombra. Todo o nada. Lanza un error con el motivo si algo no se pudo. */
export async function borrarSinRastro(userId: string, email: string, datos: DatosDeLaCuenta = {}): Promise<ResultadoDelBorrado> {
  const { sequelize } = await import('../config/database.js');
  const columnas = await columnasDeLaBase();
  const r = reemplazos(userId, email, datos);
  const resultado: ResultadoDelBorrado = { borradas: [], desvinculadas: [], aRevisarAMano: [] };

  await sequelize.transaction(async (t) => {
    type Tarea = { tabla: string; columna: string; where: string; accion: 'borrar' | 'desvincular' };
    const tareas: Tarea[] = [];
    for (const c of columnas) {
      if (c.tabla === 'users' && c.columna === 'id') continue;
      const refs = condicion(c);
      if (refs && refs.tipo === 'referencia') {
        // Solo las tablas donde HAY filas: así un permiso que falta en una tabla que no tiene nada de la cuenta no frena el borrado.
        const [hay] = (await sequelize.query(`SELECT COUNT(*)::int AS n FROM ${q(c.tabla)} WHERE ${refs.sql}`, { replacements: r, type: QueryTypes.SELECT, transaction: t })) as Array<{ n: number }>;
        if (hay.n > 0) tareas.push({ tabla: c.tabla, columna: c.columna, where: refs.sql, accion: c.tabla === 'users' ? 'desvincular' : 'borrar' });
      }
      if (c.tipo !== 'uuid') {
        const where = condicionDeTexto(c, r) + sinLaFilaPropia(c.tabla);
        const [fila] = (await sequelize.query(`SELECT COUNT(*)::int AS n FROM ${q(c.tabla)} WHERE ${where}`, { replacements: r, type: QueryTypes.SELECT, transaction: t })) as Array<{ n: number }>;
        if (fila.n > 0) {
          if (TABLAS_DE_RASTRO.has(c.tabla) || TABLAS_DE_IDENTIDAD_PROPIA.has(c.tabla)) tareas.push({ tabla: c.tabla, columna: c.columna, where, accion: 'borrar' });
          else if (c.tabla !== 'users') resultado.aRevisarAMano.push({ tabla: c.tabla, columna: c.columna, filas: fila.n, tipo: 'texto' });
        }
      }
    }

    // Se intenta en pasadas: una fila que otra todavía necesita (clave foránea) espera a que la otra se borre. Cada intento va en su punto de guardado.
    let pendientes = [...tareas];
    let ultimoError = '';
    for (let pasada = 0; pasada < 10 && pendientes.length > 0; pasada++) {
      const quedan: Tarea[] = [];
      for (const tarea of pendientes) {
        await sequelize.query('SAVEPOINT intento', { transaction: t });
        try {
          const sql = tarea.accion === 'borrar'
            ? `DELETE FROM ${q(tarea.tabla)} WHERE ${tarea.where}`
            : `UPDATE ${q(tarea.tabla)} SET ${q(tarea.columna)} = NULL WHERE ${tarea.where}`;
          const [, meta] = (await sequelize.query(sql, { replacements: r, transaction: t })) as [unknown, any];
          await sequelize.query('RELEASE SAVEPOINT intento', { transaction: t });
          const filas = Number(meta?.rowCount ?? 0);
          if (filas > 0) (tarea.accion === 'borrar' ? resultado.borradas : resultado.desvinculadas).push({ tabla: tarea.tabla, columna: tarea.columna, filas });
        } catch (e: any) {
          await sequelize.query('ROLLBACK TO SAVEPOINT intento', { transaction: t });
          ultimoError = String(e?.message || e);
          quedan.push(tarea);
        }
      }
      if (quedan.length === pendientes.length) break; // sin avances: lo que queda no se puede borrar
      pendientes = quedan;
    }
    if (pendientes.length > 0) {
      throw new Error(`No se pudo borrar todo (no se borró NADA). Quedó trabado: ${pendientes.map((p) => `${p.tabla}.${p.columna}`).join(', ')}. Último error de la base: ${ultimoError}. Si es un permiso (el rastro de auditoría es de solo agregar para la app), corré el script con el usuario dueño de la base (postgres).`);
    }

    await sequelize.query('DELETE FROM users WHERE id = :id', { replacements: r, transaction: t });
  });

  return resultado;
}

/** Cosas que hacen peligroso borrar: dinero, o contratos con otras personas. Solo LEE; si una tabla no existe, esa parte se saltea. */
export async function riesgos(userId: string, email?: string): Promise<string[]> {
  const { sequelize } = await import('../config/database.js');
  const motivos: string[] = [];
  const contar = async (sql: string): Promise<number> => {
    try {
      const [f] = (await sequelize.query(sql, { replacements: { id: userId, email: (email || '').toLowerCase() }, type: QueryTypes.SELECT })) as Array<{ n: number }>;
      return f?.n ?? 0;
    } catch {
      return 0;
    }
  };
  const conTerceros = await contar(`SELECT COUNT(*)::int AS n FROM contracts WHERE (client_id = :id AND doer_id <> :id) OR (doer_id = :id AND client_id <> :id)`);
  if (conTerceros > 0) motivos.push(`${conTerceros} contrato(s) con OTRAS personas: se borrarían también de sus cuentas.`);
  const pagos = await contar(`SELECT COUNT(*)::int AS n FROM payments WHERE (payer_id = :id OR recipient_id = :id) AND status IN ('completed','held_escrow','refunded')`);
  if (pagos > 0) motivos.push(`${pagos} pago(s) con dinero real o ya devuelto: son registros contables.`);
  const saldo = await contar(`SELECT (COALESCE(balance_ars, 0) <> 0)::int AS n FROM users WHERE id = :id`);
  if (saldo > 0) motivos.push('La cuenta tiene saldo distinto de cero.');
  const retiros = await contar(`SELECT COUNT(*)::int AS n FROM withdrawal_requests WHERE user_id = :id`);
  if (retiros > 0) motivos.push(`${retiros} pedido(s) de retiro.`);
  if (email) {
    const baneada = await contar(`SELECT COUNT(*)::int AS n FROM banned_identities WHERE lower(email) = :email OR user_id = :id`);
    if (baneada > 0) motivos.push(`${baneada} registro(s) en la lista de identidades baneadas: al borrarlos esta persona podría volver a registrarse.`);
  }
  return motivos;
}
