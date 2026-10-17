import { AsyncLocalStorage } from 'node:async_hooks';
import type { Sequelize } from 'sequelize';
import { ROL_DE_LA_APP } from './rls.cjs';

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
      await c.query(`SET ROLE ${ROL_DE_LA_APP}`);
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
