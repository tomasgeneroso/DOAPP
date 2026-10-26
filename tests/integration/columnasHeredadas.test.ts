import { describe, it, expect, afterAll } from '@jest/globals';
import type { Transaction } from 'sequelize';

/**
 * Escribir una reseña después del trabajo fallaba en producción con «null value in column "reviewee_id" of relation "reviews" violates not-null constraint».
 *
 * Producción no hace `sync()`: la tabla `reviews` se creó con un modelo viejo que tenía `reviewee_id` y la conserva, `NOT NULL`, aunque el modelo actual escribe
 * `reviewed_id`. Cada reseña nueva revienta. Lo mismo le pasó a `proposals.doer_id` (postularse). `relajarColumnasHeredadas` (ensureSchema) le quita el `NOT NULL`
 * a toda columna que el modelo no escribe, no tiene valor por defecto y no es una identidad; corre al arrancar.
 */
import { sequelize } from '../../server/config/database.js';
import { relajarColumnasHeredadas } from '../../server/config/ensureSchema.js';
import { Review } from '../../server/models/sql/Review.model.js';
import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { Contract } from '../../server/models/sql/Contract.model.js';
import { crearUsuario, crearTrabajo, crearContrato } from '../helpers/fixtures.js';

/**
 * Las pruebas corren como el rol de la app (RLS), que no es dueño de las tablas y no puede cambiar el esquema; en producción el arranque lo hace antes de
 * tomar ese rol. Acá se vuelve al usuario de la conexión mientras dura `fn` y después se retoma el rol.
 */
const comoDueno = async <T>(fn: (t: Transaction) => Promise<T>): Promise<T> =>
  sequelize.transaction(async (t) => {
    const [[{ rol }]] = (await sequelize.query('SELECT current_user AS rol', { transaction: t })) as [Array<{ rol: string }>, unknown];
    await sequelize.query('RESET ROLE', { transaction: t });
    try {
      return await fn(t);
    } finally {
      if (rol === 'doapp_app') await sequelize.query('SET ROLE doapp_app', { transaction: t });
    }
  });

const ddl = (sql: string) => comoDueno((t) => sequelize.query(sql, { transaction: t }));

const esNotNull = async (tabla: string, columna: string) => {
  const [filas] = (await sequelize.query(
    "SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = :tabla AND column_name = :columna",
    { replacements: { tabla, columna } },
  )) as [Array<{ is_nullable: string }>, unknown];
  return filas[0]?.is_nullable === 'NO';
};

describe('columnas heredadas de un esquema viejo', () => {
  const ids: { users: string[]; jobs: string[]; contracts: string[] } = { users: [], jobs: [], contracts: [] };

  afterAll(async () => {
    try {
      await Review.destroy({ where: { contractId: ids.contracts }, force: true } as any);
      await ddl('ALTER TABLE reviews DROP COLUMN IF EXISTS reviewee_id');
      await Contract.destroy({ where: { id: ids.contracts }, force: true });
      await Job.destroy({ where: { id: ids.jobs }, force: true });
      await User.destroy({ where: { id: ids.users }, force: true });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  it('una reseña se puede escribir aunque la tabla conserve `reviewee_id NOT NULL` del modelo viejo', async () => {
    // La tabla de producción: el modelo viejo exigía reviewee_id y nadie lo escribe más.
    await ddl("ALTER TABLE reviews ADD COLUMN IF NOT EXISTS reviewee_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'");
    await ddl('ALTER TABLE reviews ALTER COLUMN reviewee_id DROP DEFAULT');
    expect(await esNotNull('reviews', 'reviewee_id')).toBe(true);

    const cliente: any = await crearUsuario({ role: 'client', dniVerified: true });
    const trabajador: any = await crearUsuario({ role: 'doer', dniVerified: true });
    ids.users.push(cliente.id, trabajador.id);
    const trabajo: any = await crearTrabajo(cliente.id, { status: 'completed', price: 10000 });
    ids.jobs.push(trabajo.id);
    const contrato: any = await crearContrato({ jobId: trabajo.id, clientId: cliente.id, doerId: trabajador.id }, { status: 'completed', price: 10000 });
    ids.contracts.push(contrato.id);
    const datos = { contractId: contrato.id, reviewerId: cliente.id, reviewedId: trabajador.id, reviewedRole: 'doer', rating: 5, comment: 'Excelente trabajo, muy prolijo' } as any;

    // Antes del arreglo: el alta revienta con el mismo error que vio el dueño.
    await expect(Review.create(datos)).rejects.toThrow(/reviewee_id/);

    const relajadas = await comoDueno((t) => relajarColumnasHeredadas(sequelize as any, t));
    expect(relajadas).toContain('reviews.reviewee_id');
    expect(await esNotNull('reviews', 'reviewee_id')).toBe(false);

    // Después: la reseña se escribe.
    const r: any = await Review.create(datos);
    expect(String(r.reviewedId)).toBe(String(trabajador.id));
  });

  it('no toca las columnas que el modelo SÍ escribe (siguen siendo obligatorias)', async () => {
    await comoDueno((t) => relajarColumnasHeredadas(sequelize as any, t));
    expect(await esNotNull('reviews', 'reviewer_id')).toBe(true);
    expect(await esNotNull('reviews', 'reviewed_id')).toBe(true);
    expect(await esNotNull('users', 'email')).toBe(true);
    expect(await esNotNull('contracts', 'client_id')).toBe(true);
  });

  it('correrlo de nuevo no relaja nada más (es idempotente)', async () => {
    await comoDueno((t) => relajarColumnasHeredadas(sequelize as any, t));
    expect(await comoDueno((t) => relajarColumnasHeredadas(sequelize as any, t))).toEqual([]);
  });
});
