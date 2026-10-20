import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * POST /api/contracts/:jobId/cancel-worker-selection
 *
 * Lo que había: la ruta dejaba `job.doerId` en null y DESPUÉS pedía `job.doerId.toString()` para avisarle al trabajador. Siempre fallaba: la
 * selección ya estaba cancelada y guardada, pero el cliente recibía un 500 y el trabajador nunca se enteraba. Los tipos estrictos lo
 * mostraban («job.doerId is possibly undefined»), pero el chequeo del CI no los miraba.
 */

const avisos: Array<{ para: string; evento: string; datos: any }> = [];
jest.mock('../../server/index.js', () => ({
  __esModule: true,
  socketService: new Proxy(
    {},
    {
      get: (_t, nombre) => (...args: any[]) => {
        if (nombre === 'notifyUser') avisos.push({ para: String(args[0]), evento: String(args[1]), datos: args[2] });
      },
    },
  ),
}));
jest.mock('../../server/services/email.js', () => ({
  __esModule: true,
  default: new Proxy({}, { get: () => async () => true }),
}));

import { Job } from '../../server/models/sql/Job.model.js';
import { Contract } from '../../server/models/sql/Contract.model.js';
import { User } from '../../server/models/sql/User.model.js';
import { crearUsuario, crearTrabajo, crearContrato } from '../helpers/fixtures.js';

describe('cancelar la selección de un trabajador', () => {
  let app: Express;
  let cliente: any, trabajador: any, otro: any;
  const trabajos: string[] = [];
  const contratos: string[] = [];
  const sesion = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const dia = (n: number) => new Date(Date.now() + n * 86_400_000);

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/contracts', (await import('../../server/routes/contracts.js')).default);
    cliente = await crearUsuario({ role: 'client', dniVerified: true });
    trabajador = await crearUsuario({ role: 'doer', dniVerified: true });
    otro = await crearUsuario({ role: 'client' });
  });

  afterAll(async () => {
    try {
      await Contract.destroy({ where: { id: contratos }, force: true });
      await Job.destroy({ where: { id: trabajos }, force: true });
      await User.destroy({ where: { id: [cliente.id, trabajador.id, otro.id] }, force: true });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  const armar = async (diasHastaElInicio: number) => {
    const trabajo = await crearTrabajo(cliente.id, { status: 'in_progress', doerId: trabajador.id, startDate: dia(diasHastaElInicio), endDate: dia(diasHastaElInicio + 3) });
    trabajos.push(trabajo.id);
    const contrato = await crearContrato({ jobId: trabajo.id, clientId: cliente.id, doerId: trabajador.id }, { status: 'accepted' });
    contratos.push(contrato.id);
    return { trabajo, contrato };
  };

  it('con tiempo de sobra: cancela, responde 200 y le avisa al trabajador que se sacó (antes: 500 y nadie avisado)', async () => {
    const { trabajo, contrato } = await armar(10);
    avisos.length = 0;
    const r = await request(app).post(`/api/contracts/${trabajo.id}/cancel-worker-selection`).set(sesion(cliente));
    expect([r.status, r.body.message]).toEqual([200, 'Selección del worker cancelada']);

    const t: any = await Job.findByPk(trabajo.id);
    expect(t.status).toBe('open');
    expect(t.doerId).toBeNull();
    expect(((await Contract.findByPk(contrato.id)) as any).status).toBe('cancelled');

    const aviso = avisos.find((a) => a.evento === 'worker_selection_cancelled');
    expect(aviso?.para).toBe(trabajador.id);
    expect(aviso?.datos.jobId).toBe(trabajo.id);
  });

  it('a menos de 48 horas del inicio no deja cancelar y no cambia nada', async () => {
    const { trabajo } = await armar(1);
    avisos.length = 0;
    const r = await request(app).post(`/api/contracts/${trabajo.id}/cancel-worker-selection`).set(sesion(cliente));
    expect(r.status).toBe(400);
    expect(r.body.message).toContain('No puedes cancelar la selección');
    expect(((await Job.findByPk(trabajo.id)) as any).doerId).toBe(trabajador.id);
    expect(avisos).toHaveLength(0);
  });

  it('otra persona no puede cancelar la selección de un trabajo ajeno', async () => {
    const { trabajo } = await armar(10);
    const r = await request(app).post(`/api/contracts/${trabajo.id}/cancel-worker-selection`).set(sesion(otro));
    expect(r.status).toBe(403);
    expect(((await Job.findByPk(trabajo.id)) as any).doerId).toBe(trabajador.id);
  });
});
