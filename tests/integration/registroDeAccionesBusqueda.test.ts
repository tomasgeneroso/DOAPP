import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Registro de acciones: buscar por el id de una publicación, de una persona o de un pago (entero o un pedazo, del principio o del final) encuentra los asientos de
 * TODO lo relacionado (pedido del dueño, 2026-11-15). Base de pruebas real.
 */
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});

import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { Payment } from '../../server/models/sql/Payment.model.js';
import { AuditLog } from '../../server/models/sql/AuditLog.model.js';
import { conSistema } from '../../server/db/contextoRls.js';
import { crearUsuario, crearTrabajo } from '../helpers/fixtures.js';

describe('GET /api/admin/audit-logs?search=<id>', () => {
  let app: Express;
  let dueno: any, cliente: any, ajeno: any, trabajo: any, pago: any, otroTrabajo: any;
  const asientos: Record<string, string> = {};
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const buscar = async (q: string) => {
    const r = await request(app).get(`/api/admin/audit-logs?search=${encodeURIComponent(q)}&limit=200`).set(con(dueno));
    expect(r.status).toBe(200);
    return r.body.data as { logs: any[]; incluido: any };
  };
  const nuestros = (logs: any[]) => logs.map((l) => l.action).filter((a) => String(a).startsWith('zz_prueba_')).sort();

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/admin/audit-logs', (await import('../../server/routes/admin/auditLogs.js')).default);
    dueno = await crearUsuario({ role: 'client', adminRole: 'owner' });
    cliente = await crearUsuario({ role: 'client', dniVerified: true });
    ajeno = await crearUsuario({ role: 'client', dniVerified: true });
    trabajo = await crearTrabajo(cliente.id, { status: 'pending_payment' });
    otroTrabajo = await crearTrabajo(ajeno.id, { status: 'pending_payment' });
    pago = await Payment.create({
      payerId: cliente.id, amount: 100, amountArs: 100, currency: 'ARS', status: 'pending', paymentType: 'job_publication', paymentMethod: 'mercadopago',
      platformFee: 0, platformFeePercentage: 0, jobId: trabajo.id, metadata: { jobId: trabajo.id },
    } as any);
    const crear = async (clave: string, datos: Record<string, unknown>) => {
      const a: any = await conSistema(() => AuditLog.create({ action: `zz_prueba_${clave}`, category: 'payment', severity: 'low', description: `asiento ${clave} sin ids en el texto`, ...datos } as any));
      asientos[clave] = a.id;
    };
    // Un asiento sobre el PAGO (no dice el trabajo), uno sobre el TRABAJO (no dice el pago), uno que HIZO el cliente, uno que solo nombra el trabajo en la metadata,
    // y uno de otra persona y otro trabajo que no tiene que aparecer.
    await crear('sobre_el_pago', { targetModel: 'Payment', targetId: pago.id });
    await crear('sobre_el_trabajo', { targetModel: 'Job', targetId: trabajo.id });
    await crear('hecho_por_el_cliente', { performedBy: cliente.id, targetModel: 'Job', targetId: trabajo.id });
    await crear('solo_en_metadata', { targetModel: 'Contract', targetId: otroTrabajo.id, metadata: { jobId: trabajo.id } });
    await crear('de_otro', { targetModel: 'Job', targetId: otroTrabajo.id, performedBy: ajeno.id });
  });

  afterAll(async () => {
    try {
      await conSistema(() => AuditLog.destroy({ where: { id: Object.values(asientos) } as any }));
    } catch { /* el registro es de solo agregar: si no se puede borrar, no pasa nada */ }
    try {
      await Payment.destroy({ where: { id: pago.id }, force: true } as any);
      await Job.destroy({ where: { id: [trabajo.id, otroTrabajo.id] }, force: true });
      await User.destroy({ where: { id: [dueno.id, cliente.id, ajeno.id] }, force: true });
    } catch { /* la limpieza no puede hacer fallar el test */ }
  });

  it('por el id de la PUBLICACIÓN aparece lo del trabajo, lo del pago y lo que hizo su cliente', async () => {
    const { logs, incluido } = await buscar(trabajo.id);
    const acciones = nuestros(logs);
    expect(acciones).toEqual(expect.arrayContaining(['zz_prueba_sobre_el_pago', 'zz_prueba_sobre_el_trabajo', 'zz_prueba_hecho_por_el_cliente', 'zz_prueba_solo_en_metadata']));
    expect(acciones).not.toContain('zz_prueba_de_otro');
    expect(incluido).toMatchObject({ publicaciones: 1, pagos: 1 });
  });

  it('por un pedazo del FINAL del id del pago llega al pago, a su publicación y a lo que hizo su cliente', async () => {
    const { logs } = await buscar(String(pago.id).slice(-8));
    const acciones = nuestros(logs);
    expect(acciones).toEqual(expect.arrayContaining(['zz_prueba_sobre_el_pago', 'zz_prueba_sobre_el_trabajo']));
    expect(acciones).not.toContain('zz_prueba_de_otro');
  });

  it('por el id de la PERSONA aparece lo que hizo y lo que le pasó a sus publicaciones y pagos', async () => {
    const { logs } = await buscar(cliente.id);
    const acciones = nuestros(logs);
    expect(acciones).toEqual(expect.arrayContaining(['zz_prueba_sobre_el_pago', 'zz_prueba_sobre_el_trabajo', 'zz_prueba_hecho_por_el_cliente']));
    expect(acciones).not.toContain('zz_prueba_de_otro');
  });

  it('un pedazo del principio del id de la persona ajena trae solo lo suyo', async () => {
    const { logs } = await buscar(String(ajeno.id).slice(0, 13));
    const acciones = nuestros(logs);
    expect(acciones).toEqual(expect.arrayContaining(['zz_prueba_de_otro']));
    expect(acciones).not.toContain('zz_prueba_sobre_el_pago');
  });

  it('el texto de siempre sigue buscando por descripción y un texto raro no rompe la consulta', async () => {
    expect(nuestros((await buscar('sin ids en el texto')).logs).length).toBeGreaterThanOrEqual(5);
    const r = await request(app).get(`/api/admin/audit-logs?search=${encodeURIComponent("'; DROP TABLE audit_logs; --")}`).set(con(dueno));
    expect(r.status).toBe(200);
    expect((await buscar('%')).logs).toBeDefined();
  });
});
