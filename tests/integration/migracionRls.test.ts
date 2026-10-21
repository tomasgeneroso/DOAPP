import { describe, it, expect, afterAll } from '@jest/globals';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../server/config/database.js';
import { duenoDelEsquema } from '../helpers/ddl.js';
import { comoUsuario, conSistema, activarRlsSiLaBaseEstaLista, estadoDeLaBase } from '../../server/db/contextoRls.js';
import { BalanceTransaction } from '../../server/models/sql/BalanceTransaction.model.js';
import { User } from '../../server/models/sql/User.model.js';
import { crearUsuario } from '../helpers/fixtures.js';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const migracion = require('../../migrations/20261017100000-rls-tablas-de-dinero.cjs');

/**
 * La migración REAL de RLS (la que corre el deploy): se puede aplicar dos veces, se puede deshacer, y deshecha la app vuelve a ver todo.
 * Se corre con el dueño de la base (como el deploy), no con el rol restringido de la app.
 */
describe('migración de RLS: up idempotente, down y vuelta a aplicar', () => {
  let A: any, B: any;
  const qi = () => duenoDelEsquema().getQueryInterface();
  const politicas = async () =>
    (await duenoDelEsquema().query(`SELECT count(*)::int AS n FROM pg_policies WHERE tablename IN ('balance_transactions','withdrawal_requests','payments')`, { type: QueryTypes.SELECT })) as any[];
  const activas = async () =>
    (await duenoDelEsquema().query(`SELECT count(*)::int AS n FROM pg_class WHERE relname IN ('balance_transactions','withdrawal_requests','payments') AND relrowsecurity`, { type: QueryTypes.SELECT })) as any[];
  const veAjenos = () => comoUsuario(A.id, 'user', () => BalanceTransaction.count({ where: { userId: B.id } as any }));

  afterAll(async () => {
    try {
      await migracion.up(qi()); // el resto de los tests del archivo siguiente asumen RLS aplicada
      await conSistema(async () => {
        await BalanceTransaction.destroy({ where: { userId: [A.id, B.id] } as any });
        await User.destroy({ where: { id: [A.id, B.id] } as any, force: true });
      });
    } catch {
      /* el próximo DROP SCHEMA lo limpia */
    }
  });

  it('aplicada dos veces queda igual: 12 políticas (4 por tabla) y RLS en las 3 tablas', async () => {
    A = await crearUsuario({ balanceArs: 100 });
    B = await crearUsuario({ balanceArs: 200 });
    await migracion.up(qi());
    await migracion.up(qi());
    expect((await politicas())[0].n).toBe(12);
    expect((await activas())[0].n).toBe(3);
    expect(await veAjenos()).toBe(0); // A no ve el libro de B
  });

  it('deshecha (down), la base deja de filtrar: las políticas desaparecen y A ve todo', async () => {
    await migracion.down(qi());
    expect((await politicas())[0].n).toBe(0);
    expect((await activas())[0].n).toBe(0);
    expect(await veAjenos()).toBeGreaterThan(0);
  });

  it('y se puede volver a aplicar: vuelve a filtrar', async () => {
    await migracion.up(qi());
    expect((await politicas())[0].n).toBe(12);
    expect(await veAjenos()).toBe(0);
  });

  it('base copiada con el historial de migraciones pero SIN políticas (staging, o producción tras una migración que falló): el arranque las crea', async () => {
    await migracion.down(qi());
    expect((await estadoDeLaBase(duenoDelEsquema())).politicas).toBe(false);
    expect(await activarRlsSiLaBaseEstaLista(duenoDelEsquema())).toBe(true);
    expect((await politicas())[0].n).toBe(12);
    expect(await estadoDeLaBase(duenoDelEsquema())).toEqual({ rol: true, puedeTomarlo: true, permisos: true, sinPermiso: [], politicas: true });
    expect(await veAjenos()).toBe(0);
  });

  it('una tabla a la que el rol de la app NO tiene permisos (la creó otro usuario) se detecta por su nombre: antes RLS se activaba igual y esa tabla daba «permission denied»', async () => {
    const dueno = duenoDelEsquema();
    await dueno.query('DROP TABLE IF EXISTS zz_tabla_sin_permiso');
    await dueno.query('CREATE TABLE zz_tabla_sin_permiso (id int)');
    await dueno.query('REVOKE ALL ON zz_tabla_sin_permiso FROM doapp_app');
    try {
      const e = await estadoDeLaBase(dueno);
      expect(e.permisos).toBe(false);
      expect(e.sinPermiso).toContain('zz_tabla_sin_permiso');
      // y activarRlsSiLaBaseEstaLista lo arregla si puede (el dueño de la tabla puede dar permisos)
      await dueno.query('GRANT SELECT, INSERT, UPDATE, DELETE ON zz_tabla_sin_permiso TO doapp_app');
      expect((await estadoDeLaBase(dueno)).sinPermiso).not.toContain('zz_tabla_sin_permiso');
    } finally {
      await dueno.query('DROP TABLE IF EXISTS zz_tabla_sin_permiso');
    }
  });

  it('con la base REAL y un rol que no existe (staging antes de crear doapp_app) la comprobación no revienta: dice que falta el rol', async () => {
    const e = await estadoDeLaBase(duenoDelEsquema(), 'doapp_rol_que_no_existe');
    expect(e).toMatchObject({ rol: false, puedeTomarlo: false, permisos: false });
  });

  it('si el usuario de la base no puede crear roles o las tablas no son suyas, la migración NO falla (no puede frenar un deploy)', async () => {
    const roto: any = {
      sequelize: { query: async () => { throw new Error('permission denied to create role'); } },
    };
    await expect(migracion.up(roto)).resolves.toBeUndefined();
    void sequelize;
  });
});
