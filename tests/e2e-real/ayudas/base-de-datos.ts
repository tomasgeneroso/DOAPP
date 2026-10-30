import pg from 'pg';
import { NOMBRE_DE_LA_BASE, credencialesDeLaBase } from '../entorno/variables';

/**
 * Mirar (y, donde la lista de pruebas manuales lo permite, tocar) la base de las pruebas. Es la base PROPIA de las pruebas (`doapp_e2e`), nunca la de desarrollo
 * ni la de producción. Se usa para dos cosas: comprobar lo que el sistema guardó («el pago quedó completado») y preparar una situación que en la vida real
 * lleva días o una consulta puntual del dueño (como los casos P3 y W de la lista).
 */
export async function consulta<T = any>(sql: string, valores: unknown[] = []): Promise<T[]> {
  if (!/_e2e$/.test(NOMBRE_DE_LA_BASE)) throw new Error('Solo se toca una base _e2e');
  const c = credencialesDeLaBase(process.cwd());
  const cliente = new pg.Client({ host: c.host, port: Number(c.port), user: c.user, password: c.password, database: NOMBRE_DE_LA_BASE });
  await cliente.connect();
  try {
    return (await cliente.query(sql, valores as any[])).rows as T[];
  } finally {
    await cliente.end();
  }
}

/**
 * El caso P3 de la lista: «para llegar al pago hay que gastar las publicaciones gratis de la beta». En la lista se hace publicando y cancelando, o con una
 * consulta puntual sobre la cuenta de prueba; acá es esa consulta.
 */
export async function agotarLasPublicacionesGratis(correo: string): Promise<void> {
  await consulta('UPDATE users SET free_contracts_remaining = 0, pro_contracts_used_this_month = 2 WHERE lower(email) = lower($1)', [correo]);
}

/** Cuántos contratos gratis iniciales le quedan a una cuenta (lo que la persona ve bajar al publicar sin pagar). */
export async function contratosGratisQueQuedan(correo: string): Promise<number> {
  const [fila] = await consulta<{ free_contracts_remaining: number }>('SELECT free_contracts_remaining FROM users WHERE lower(email) = lower($1)', [correo]);
  return Number(fila?.free_contracts_remaining);
}
