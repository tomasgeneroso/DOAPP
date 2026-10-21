import { AsyncLocalStorage } from 'node:async_hooks';
import type { Sequelize } from 'sequelize';
import { ROL_DE_LA_APP, TABLAS } from './rls.cjs';

/**
 * Quién está pidiendo, para que PostgreSQL decida qué filas puede ver (Row Level Security: ver `server/db/rls.cjs`).
 *
 * - Un pedido autenticado (`protect`) entra como USUARIO: la base solo le muestra sus filas de las tablas protegidas (los admins ven todo).
 * - Todo lo demás (cron, webhooks, arranque, scripts, sockets) corre como SISTEMA, que ve todo, igual que antes de RLS.
 * - Un tramo de código que, dentro de un pedido de usuario, tiene que tocar filas de OTRO (acreditarle saldo a un trabajador cuando el cliente
 *   confirma) lo declara con `conSistema(...)`: queda a la vista en el código, y es lo único que hay que revisar cuando algo «no aparece».
 *
 * Interruptor: RLS solo se aplica si `RLS_ACTIVO=true` en el entorno Y ya se llamó `activarRls()` (después de que el arranque creó el
 * esquema). Con `RLS_ACTIVO` apagado la app se comporta exactamente como antes, y apagarlo es el rollback: reiniciar con la variable en false.
 */
export interface ContextoRls {
  userId?: string;
  rol?: string;
  sistema: boolean;
}

const almacen = new AsyncLocalStorage<ContextoRls>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let aplicando = false;

export const rlsAplicandose = (): boolean => aplicando;

export const contextoActual = (): ContextoRls => almacen.getStore() ?? { sistema: true };

/** Desde acá, y hasta que termine el pedido, las consultas van como este usuario. */
export function entrarComoUsuario(userId: string, rol?: string | null): void {
  almacen.enterWith({ userId: String(userId), rol: rol ? String(rol) : '', sistema: false });
}

/** Ejecuta `fn` como SISTEMA (ve todas las filas). Para tocar datos de otro usuario desde un pedido de usuario. */
export function conSistema<T>(fn: () => T): T {
  return almacen.run({ sistema: true }, fn);
}

/** Ejecuta `fn` como un usuario concreto. Lo usan los tests; en la app lo hace `protect`. */
export function comoUsuario<T>(userId: string, rol: string | null | undefined, fn: () => T): T {
  return almacen.run({ userId: String(userId), rol: rol ? String(rol) : '', sistema: false }, fn);
}

type ConexionConContexto = { query: (q: any, v?: any) => Promise<any>; __rlsRol?: boolean; __rlsClave?: string };

/**
 * Engancha el contexto a la conexión CADA vez que sale del pool. Una conexión se reutiliza entre pedidos de distintos usuarios: si el
 * contexto se pusiera una sola vez, un pedido heredaría el del anterior. Por eso se vuelve a fijar en cada salida (una sola consulta, y
 * ninguna si es el mismo contexto que la vez anterior).
 */
export function instalarRls(sequelize: Sequelize): void {
  sequelize.addHook('afterPoolAcquire', async (conexion: unknown) => {
    if (!aplicando) return;
    const c = conexion as ConexionConContexto;
    const ctx = contextoActual();
    // Un id que no es un UUID válido nunca llega a la base: se trata como sin identidad (no ve nada).
    const userId = !ctx.sistema && ctx.userId && UUID.test(ctx.userId) ? ctx.userId : '';
    const clave = ctx.sistema ? 'S' : `U:${userId}:${ctx.rol ?? ''}`;

    if (!c.__rlsRol) {
      try {
        await c.query(`SET ROLE ${ROL_DE_LA_APP}`);
      } catch (e: any) {
        // Que el rol no exista (22023) o que este usuario no pueda tomarlo (42501) NO puede tumbar toda la app: se apaga RLS, a los gritos.
        // Cualquier otro error (conexión caída, etc.) sí se propaga.
        if (e?.code !== '22023' && e?.code !== '42501') throw e;
        aplicando = false;
        console.error(`🚨 [rls] SE APAGÓ RLS: la base no deja usar el rol ${ROL_DE_LA_APP} (${e.message}). La app sigue SIN Row Level Security hasta que se arregle el rol y se reinicie.`);
        return;
      }
      c.__rlsRol = true;
      c.__rlsClave = undefined;
    }
    if (c.__rlsClave === clave) return;
    await c.query({
      text: `SELECT set_config('app.system', $1, false), set_config('app.user_id', $2, false), set_config('app.role', $3, false)`,
      values: [ctx.sistema ? 'on' : 'off', userId, ctx.sistema ? '' : (ctx.rol ?? '')],
    });
    c.__rlsClave = clave;
  });
}

/**
 * Enciende RLS para las conexiones que se tomen de ahora en más. Se llama una vez que el arranque terminó de crear el esquema (el rol
 * `doapp_app` no tiene permiso de DDL). Las conexiones ya abiertas toman el rol la próxima vez que salgan del pool.
 */
export function activarRls(): void {
  aplicando = true;
}

export interface EstadoDeLaBase {
  /** El rol `doapp_app` existe. */
  rol: boolean;
  /** El usuario de la app puede pasar a ese rol (SET ROLE). */
  puedeTomarlo: boolean;
  /** El rol tiene permisos sobre TODAS las tablas y secuencias (si no, lo que las use falla con «permission denied»). */
  permisos: boolean;
  /** Las que no: tablas que otro usuario creó (el que corre la app no puede darles permisos) o creadas después de dar los permisos. */
  sinPermiso: string[];
  /** Las tablas de dinero que existen tienen sus políticas (4 cada una). */
  politicas: boolean;
}

/**
 * Qué le falta a la base para que RLS funcione. La migración sola no alcanza: queda registrada como corrida aunque haya fallado al crear el
 * rol (el usuario de la app no puede crear roles), y una base copiada de otra (staging) trae esa marca sin las políticas. Por eso el arranque
 * mira el estado real, no el historial de migraciones.
 */
export async function estadoDeLaBase(sequelize: Sequelize, rolDeLaApp: string = ROL_DE_LA_APP): Promise<EstadoDeLaBase> {
  if (!/^[a-z_][a-z0-9_]*$/.test(rolDeLaApp)) throw new Error('nombre de rol inválido');
  const tablas = Object.keys(TABLAS)
    .map((t) => `('${t}')`)
    .join(',');
  // Las funciones de privilegios (pg_has_role, has_table_privilege) FALLAN si el rol no existe, y con un nombre escrito en la consulta
  // Postgres las evalúa antes de mirar cualquier condición. Por eso se consultan por el oid del rol, dentro de una subconsulta que no
  // devuelve nada si el rol no está.
  const [filas] = (await sequelize.query(
    `SELECT
       EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${rolDeLaApp}') AS rol,
       COALESCE((SELECT pg_has_role(current_user, r.oid, 'MEMBER') FROM pg_roles r WHERE r.rolname = '${rolDeLaApp}'), false) AS puede,
       COALESCE((
         SELECT array_agg(nombre ORDER BY nombre) FROM (
           SELECT t.tablename::text AS nombre FROM pg_tables t, pg_roles r
            WHERE r.rolname = '${rolDeLaApp}' AND t.schemaname = 'public'
              AND NOT (has_table_privilege(r.oid, format('%I.%I', t.schemaname, t.tablename)::regclass, 'SELECT')
                   AND has_table_privilege(r.oid, format('%I.%I', t.schemaname, t.tablename)::regclass, 'INSERT')
                   AND has_table_privilege(r.oid, format('%I.%I', t.schemaname, t.tablename)::regclass, 'UPDATE')
                   AND has_table_privilege(r.oid, format('%I.%I', t.schemaname, t.tablename)::regclass, 'DELETE'))
           UNION ALL
           SELECT ('secuencia ' || c.relname)::text FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace, pg_roles r
            WHERE r.rolname = '${rolDeLaApp}' AND n.nspname = 'public' AND c.relkind = 'S'
              AND NOT has_sequence_privilege(r.oid, c.oid, 'USAGE')
         ) faltantes
       ), ARRAY[]::text[]) AS sin_permiso,
       (SELECT COALESCE(bool_and(n >= 4), true)
          FROM (SELECT (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = t.tabla) AS n
                  FROM (VALUES ${tablas}) AS t(tabla)
                 WHERE to_regclass('public.' || t.tabla) IS NOT NULL) x) AS politicas`,
  )) as any[];
  const r = filas?.[0] ?? {};
  const sinPermiso: string[] = Array.isArray(r.sin_permiso) ? r.sin_permiso : [];
  return { rol: !!r.rol, puedeTomarlo: !!r.puede, permisos: !!r.rol && sinPermiso.length === 0, sinPermiso, politicas: !!r.politicas };
}

const estaListo = (e: EstadoDeLaBase) => e.rol && e.puedeTomarlo && e.permisos && e.politicas;
const queFalta = (e: EstadoDeLaBase) =>
  [!e.rol && `el rol ${ROL_DE_LA_APP} no existe`, e.rol && !e.puedeTomarlo && 'el usuario de la app no puede usar ese rol', e.rol && !e.permisos && `el rol no tiene permisos sobre: ${e.sinPermiso.slice(0, 12).join(', ')}${e.sinPermiso.length > 12 ? '…' : ''} (hay que darselos como superusuario: GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${ROL_DE_LA_APP}; GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ${ROL_DE_LA_APP};)`, !e.politicas && 'faltan las políticas de las tablas de dinero (¿el usuario de la app es su dueño?)']
    .filter(Boolean)
    .join('; ');

/**
 * Lo que se llama al arrancar con `RLS_ACTIVO=true`: enciende RLS SOLO si la base está lista (rol, permisos y políticas). Si no, intenta
 * dejarla lista una vez (es idempotente; el rol solo se puede crear si el usuario de la base tiene CREATEROLE, y las políticas si es dueño de
 * las tablas) y, si sigue sin estarlo, deja la app SIN RLS y lo dice en el registro, en vez de tumbarla. Devuelve si quedó activo.
 */
export async function activarRlsSiLaBaseEstaLista(sequelize: Sequelize): Promise<boolean> {
  try {
    let estado = await estadoDeLaBase(sequelize);
    if (!estaListo(estado)) {
      const { aplicarRls } = await import('./rls.cjs');
      await aplicarRls(async (sql: string, escalar?: boolean) => {
        if (!escalar) return sequelize.query(sql);
        const [filas] = (await sequelize.query(sql)) as any[];
        return !!(filas && filas[0] && filas[0].t);
      }).catch((e: any) => console.warn(`[rls] no se pudo dejar la base lista desde la app: ${e?.message}`));
      estado = await estadoDeLaBase(sequelize);
    }
    if (!estaListo(estado)) {
      console.error(
        `🚨 [rls] RLS_ACTIVO=true pero la base no está lista: ${queFalta(estado)}. La app arranca SIN RLS. ` +
          `Hay que darle CREATEROLE al usuario de la app (o crear el rol como superusuario) y reiniciar.`,
      );
      return false;
    }
  } catch (e: any) {
    console.error(`🚨 [rls] no se pudo comprobar el estado de la base; la app arranca SIN RLS: ${e?.message}`);
    return false;
  }
  activarRls();
  return true;
}
