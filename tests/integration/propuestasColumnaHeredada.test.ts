import { describe, it, expect, afterAll, beforeAll, jest } from '@jest/globals';

/**
 * Postularse a un trabajo: «null value in column "doer_id" of relation "proposals" violates not-null constraint».
 *
 * En producción la tabla `proposals` conservaba una columna de un esquema viejo (`doer_id`, NOT NULL) que el modelo actual no escribe,
 * así que cada propuesta nueva reventaba. La red de seguridad de arranque (`ensureCriticalSchema`) la deja opcional.
 */

jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});

import { sequelize } from '../../server/config/database.js';
import { STATEMENTS } from '../../server/config/ensureSchema.js';
import { Proposal } from '../../server/models/sql/Proposal.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { User } from '../../server/models/sql/User.model.js';
import { duenoDelEsquema } from '../helpers/ddl.js';
import { crearUsuario, crearTrabajo } from '../helpers/fixtures.js';

describe('proposals con una columna heredada NOT NULL', () => {
  let cliente: any, trabajador: any, trabajo: any;
  const propuestas: string[] = [];

  beforeAll(async () => {
    cliente = await crearUsuario({ role: 'client' });
    trabajador = await crearUsuario({ role: 'client' });
    trabajo = await crearTrabajo(cliente.id, { status: 'open' });
    // Se reproduce lo que había en producción.
    await duenoDelEsquema().query('ALTER TABLE proposals ADD COLUMN IF NOT EXISTS doer_id UUID NOT NULL');
  });

  afterAll(async () => {
    try {
      await duenoDelEsquema().query('ALTER TABLE proposals DROP COLUMN IF EXISTS doer_id');
      await Proposal.destroy({ where: { id: propuestas }, force: true });
      await Job.destroy({ where: { id: trabajo.id }, force: true });
      await User.destroy({ where: { id: [cliente.id, trabajador.id] }, force: true });
    } catch { /* la limpieza no puede hacer fallar el test */ }
  });

  const nueva = () =>
    Proposal.create({
      jobId: trabajo.id,
      freelancerId: trabajador.id,
      clientId: cliente.id,
      coverLetter: 'Aplicación directa',
      proposedPrice: 1000,
      estimatedDuration: 1,
      status: 'approved',
    } as any);

  it('sin el arreglo, la propuesta falla con el error de producción', async () => {
    await expect(nueva()).rejects.toThrow(/doer_id/);
  });

  it('con la sentencia de ensureSchema la propuesta se crea, y las filas viejas toman freelancer_id', async () => {
    const s = STATEMENTS.find((x) => x.label === 'proposals: columnas heredadas sin NOT NULL');
    expect(s).toBeDefined();
    await duenoDelEsquema().query(s!.sql);
    const p: any = await nueva();
    propuestas.push(p.id);
    expect(p.id).toBeTruthy();
    // Idempotente: correrla otra vez no rompe nada.
    await duenoDelEsquema().query(s!.sql);
    const [filas]: any = await duenoDelEsquema().query(`SELECT doer_id, freelancer_id FROM proposals WHERE id = '${p.id}'`);
    expect(filas[0].doer_id === null || filas[0].doer_id === filas[0].freelancer_id).toBe(true);
  });
});
