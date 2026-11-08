import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';

/**
 * El trabajo que quedó «en curso» con el contrato ya terminado.
 *
 * Caso real (producción, 2026-11-07): un trabajo del 22/10 seguía `in_progress` con el contrato `completed`, `escrow released` y confirmado por las dos
 * partes. `completarTrabajoSiTerminaron` solo corría en el momento en que el contrato terminaba, y ese contrato terminó antes de que existiera esa
 * corrección. El barrido (`completarTrabajosYaTerminados`, en el cron del ciclo del contrato) lo cierra solo, con la misma regla.
 */
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});

import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { Contract } from '../../server/models/sql/Contract.model.js';
import { crearUsuario, crearTrabajo, crearContrato } from '../helpers/fixtures.js';
import { completarTrabajosYaTerminados } from '../../server/services/trabajoTerminado.js';

describe('completarTrabajosYaTerminados (el barrido)', () => {
  let cliente: any, a: any, b: any;
  const jobs: string[] = [];
  const contratos: string[] = [];

  const trabajo = async (status = 'in_progress') => {
    const j: any = await crearTrabajo(cliente.id, { status });
    jobs.push(j.id);
    return j;
  };
  const contrato = async (jobId: string, doerId: string, status: string) => {
    const c: any = await crearContrato({ jobId, clientId: cliente.id, doerId }, { status });
    contratos.push(c.id);
    return c;
  };
  const estado = async (id: string) => String(((await Job.findByPk(id)) as any).status);

  beforeAll(async () => {
    cliente = await crearUsuario({ role: 'client' });
    a = await crearUsuario({ role: 'doer' });
    b = await crearUsuario({ role: 'doer' });
  });

  afterAll(async () => {
    try {
      await Contract.destroy({ where: { id: contratos }, force: true });
      await Job.destroy({ where: { id: jobs }, force: true });
      await User.destroy({ where: { id: [cliente.id, a.id, b.id] }, force: true });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  it('un trabajo en curso cuyo único contrato terminó se cierra (el caso del 22/10)', async () => {
    const j = await trabajo();
    await contrato(j.id, a.id, 'completed');

    const cerrados = await completarTrabajosYaTerminados();

    expect(cerrados).toBeGreaterThanOrEqual(1);
    expect(await estado(j.id)).toBe('completed');
  });

  it('un contrato cancelado o rechazado no lo retiene: el que trabajó terminó', async () => {
    const j = await trabajo();
    await contrato(j.id, a.id, 'completed');
    await contrato(j.id, b.id, 'cancelled');

    await completarTrabajosYaTerminados();

    expect(await estado(j.id)).toBe('completed');
  });

  it('si queda un contrato sin terminar, el trabajo NO se cierra', async () => {
    const j = await trabajo();
    await contrato(j.id, a.id, 'completed');
    await contrato(j.id, b.id, 'awaiting_confirmation');

    await completarTrabajosYaTerminados();

    expect(await estado(j.id)).toBe('in_progress');
  });

  it('un trabajo en curso sin ningún contrato terminado no se toca', async () => {
    const j = await trabajo();
    await contrato(j.id, a.id, 'in_progress');
    const sinContratos = await trabajo();

    await completarTrabajosYaTerminados();

    expect(await estado(j.id)).toBe('in_progress');
    expect(await estado(sinContratos.id)).toBe('in_progress');
  });

  it('un trabajo cancelado o ya terminado no cambia, y correrlo de nuevo no hace nada (idempotente)', async () => {
    const cancelado = await trabajo('cancelled');
    await contrato(cancelado.id, a.id, 'completed');
    const j = await trabajo();
    await contrato(j.id, a.id, 'completed');

    await completarTrabajosYaTerminados();
    const segunda = await completarTrabajosYaTerminados();

    expect(await estado(cancelado.id)).toBe('cancelled');
    expect(await estado(j.id)).toBe('completed');
    expect(segunda).toBe(0);
  });
});
