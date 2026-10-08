import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * PUT /api/jobs/:id — el dueño edita el contenido de su trabajo, nada más.
 *
 * Lo que había: el cuerpo del pedido se copiaba entero a la actualización (`{ ...req.body }`), así que el
 * dueño podía escribir cualquier columna: `status: 'open'` para publicar sin pagar ni pasar la revisión de
 * un admin, `publicationPaid`, `publicationPaymentId`, `clientId`, `doerId`, `permanentlyCancelled: false`
 * para "resucitar" un trabajo dado de baja, los campos de revisión...
 */

jest.mock('../../server/index.js', () => ({
  __esModule: true,
  socketService: new Proxy({}, { get: () => () => undefined }),
}));
jest.mock('../../server/services/email.js', () => ({
  __esModule: true,
  default: new Proxy({}, { get: () => async () => true }),
}));

import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { crearUsuario, crearTrabajo } from '../helpers/fixtures.js';

describe('PUT /api/jobs/:id: sólo se edita el contenido', () => {
  let app: Express;
  let dueno: any, otro: any;
  const jobs: string[] = [];
  const token = (u: any) => jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret');
  const editar = (id: string, body: Record<string, unknown>, quien = dueno) =>
    request(app).put(`/api/jobs/${id}`).set({ Authorization: `Bearer ${token(quien)}` }).send({ endDateFlexible: true, ...body });
  const leer = async (id: string) => (await Job.findByPk(id)) as any;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    const rutas = await import('../../server/routes/jobs.js');
    app.use('/api/jobs', rutas.default);
    dueno = await crearUsuario({ role: 'client' });
    otro = await crearUsuario({ role: 'client' });
  });

  afterAll(async () => {
    try {
      await Job.destroy({ where: { id: jobs }, force: true });
      await User.destroy({ where: { id: [dueno.id, otro.id] }, force: true });
    } catch { /* la limpieza no puede hacer fallar el test */ }
  });

  // Cada trabajo empieza otro día: editar uno revisa que no se superponga con los demás del mismo dueño.
  let dia = 10;
  const trabajo = async (over: Record<string, unknown> = {}) => {
    const t = await crearTrabajo(dueno.id, { status: 'pending_payment', publicationPaid: false, startDate: new Date(Date.now() + (dia += 3) * 86_400_000), ...over });
    jobs.push(t.id);
    return t;
  };

  it('edita los campos de contenido', async () => {
    const t = await trabajo({ status: 'open' });
    const r = await editar(t.id, { title: 'Arreglo de canilla de cocina', description: 'Pierde agua por la base, hay que cambiar la cuerita y el cuerpo.' });
    expect(r.status).toBe(200);
    const j = await leer(t.id);
    expect(j.title).toBe('Arreglo de canilla de cocina');
    expect(j.description).toContain('cuerita');
  });

  it("NO puede publicarse a sí mismo: 'status' del cuerpo se ignora", async () => {
    const t = await trabajo({ status: 'pending_payment' });
    const r = await editar(t.id, { title: 'Título nuevo y válido', status: 'open' });
    expect(r.status).toBe(200);
    expect((await leer(t.id)).status).toBe('pending_payment');
  });

  it("tampoco 'pending_approval' -> 'open' (saltearse la revisión del admin)", async () => {
    const t = await trabajo({ status: 'pending_approval' });
    await editar(t.id, { status: 'open' });
    expect((await leer(t.id)).status).toBe('pending_approval');
  });

  it('no puede marcar la publicación como pagada ni apuntar a un pago ajeno', async () => {
    const t = await trabajo();
    await editar(t.id, { publicationPaid: true, publicationPaidAt: new Date().toISOString(), publicationPaymentId: '11111111-1111-1111-1111-111111111111' });
    const j = await leer(t.id);
    expect(j.publicationPaid).toBeFalsy();
    expect(j.publicationPaymentId).toBeFalsy();
  });

  it('no puede cederle el trabajo a otro ni asignarse un trabajador', async () => {
    const t = await trabajo();
    await editar(t.id, { clientId: otro.id, doerId: otro.id, selectedWorkers: [otro.id] });
    const j = await leer(t.id);
    expect(String(j.clientId)).toBe(String(dueno.id));
    expect(j.doerId ?? null).toBeNull();
    expect(j.selectedWorkers ?? []).toEqual([]);
  });

  it('no puede resucitar un trabajo dado de baja ni borrar el motivo de un rechazo', async () => {
    const t = await trabajo({ status: 'cancelled', permanentlyCancelled: true });
    const r = await editar(t.id, { permanentlyCancelled: false, status: 'open' });
    expect(r.status).toBe(403); // sigue cancelado definitivamente
    const j = await leer(t.id);
    expect(j.permanentlyCancelled).toBe(true);
    expect(j.status).toBe('cancelled');
  });

  it('no puede tocar los campos de revisión ni de precio pendiente', async () => {
    const t = await trabajo({ status: 'rejected' });
    await editar(t.id, { reviewedBy: dueno.id, rejectedReason: 'Revisado y aprobado', pendingNewPrice: 1, pendingPaymentAmount: 0, maxWorkers: 50, originalPrice: 1 });
    const j = await leer(t.id);
    expect(j.reviewedBy ?? null).toBeNull(); // la edición de un rechazado lo manda a revisión y limpia estos campos
    expect(j.rejectedReason ?? null).toBeNull();
    expect(j.pendingNewPrice ?? null).toBeNull();
    expect(Number(j.maxWorkers || 1)).toBe(1);
  });

  it('un trabajo rechazado, editado por su dueño, vuelve a revisión (no se publica)', async () => {
    const t = await trabajo({ status: 'rejected' });
    const r = await editar(t.id, { title: 'Corregido según lo pedido' });
    expect(r.status).toBe(200);
    expect(r.body.requiresApproval).toBe(true);
    expect((await leer(t.id)).status).toBe('pending_approval');
  });

  it('otro usuario no puede editar el trabajo', async () => {
    const t = await trabajo({ status: 'open' });
    const r = await editar(t.id, { title: 'Intento ajeno' }, otro);
    expect(r.status).toBe(403);
    expect((await leer(t.id)).title).not.toBe('Intento ajeno');
  });
});
