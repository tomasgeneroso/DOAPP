import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * El expediente de una publicación en el panel de administración: quién la creó/revisó/canceló, el pago que la respalda, los movimientos de
 * saldo que generó (con quién los hizo), una cronología y alertas de lo que no cierra (caso «try» de $400.000 devuelto sin cobro).
 */
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));

import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { Payment } from '../../server/models/sql/Payment.model.js';
import { Notification } from '../../server/models/sql/Notification.model.js';
import BalanceTransaction from '../../server/models/sql/BalanceTransaction.model.js';
import { alertasDeLaPublicacion } from '../../server/services/expedienteDePublicacion.js';
import { crearUsuario, crearTrabajo } from '../helpers/fixtures.js';

describe('expediente de una publicación (admin)', () => {
  let app: Express;
  let admin: any, dueno: any, comun: any;
  const jobs: string[] = [];
  const pagos: string[] = [];
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/admin/jobs', (await import('../../server/routes/admin/jobs.js')).default);
    admin = await crearUsuario({ role: 'admin', adminRole: 'admin' });
    dueno = await crearUsuario({ role: 'client', dniVerified: true });
    comun = await crearUsuario({ role: 'client' });
  });

  afterAll(async () => {
    try {
      await Notification.destroy({ where: { recipientId: [admin.id, dueno.id] } });
      await BalanceTransaction.destroy({ where: { userId: dueno.id }, force: true } as any);
      await Job.destroy({ where: { id: jobs }, force: true });
      await Payment.destroy({ where: { id: pagos }, force: true } as any);
      await User.destroy({ where: { id: [admin.id, dueno.id, comun.id] }, force: true });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  it('una devolución de una publicación sin pago se marca como alerta ALTA, con quién la canceló y la cronología en orden', async () => {
    const { acreditarSaldo } = await import('../../server/services/quotePayment.js');
    const t = await crearTrabajo(dueno.id, {
      title: 'try', status: 'cancelled', price: 400000, publicationPaid: true, publicationPaymentId: null,
      cancelledById: dueno.id, cancelledByRole: 'owner', cancelledAt: new Date(), cancellationReason: 'Lo cancelé yo',
    });
    jobs.push(t.id);
    await acreditarSaldo(String(dueno.id), 431956.8, 'Saldo a favor por cancelación de "try"', {
      relatedModel: 'Job', relatedId: t.id, tipo: 'refund',
      metadata: { origen: 'cancelacion', reason: 'job_cancelled_sin_trabajador', jobId: String(t.id), jobPrice: 400000, actor: { id: String(dueno.id), tipo: 'cliente' }, disponibleDesde: new Date().toISOString() },
    });

    const r = await request(app).get(`/api/admin/jobs/${t.id}/expediente`).set(con(admin));
    expect(r.status).toBe(200);
    const e = r.body.data;

    expect(e.publicacion.titulo).toBe('try');
    expect(e.publicacion.canceladaPor.email).toBe(dueno.email);
    expect(e.publicacion.canceladaComo).toBe('owner');
    expect(e.pago).toBeNull();

    // la alerta que importa
    const alta = e.alertas.find((a: any) => a.nivel === 'alta');
    expect(alta.titulo).toMatch(/nunca se cobró/);
    expect(alta.detalle).toContain('431.956,80');
    expect(alta.queHacer).toMatch(/ajustarSaldo/);

    // el movimiento dice quién lo hizo y que no tiene pago detrás
    const m = e.movimientos.find((x: any) => x.tipo === 'refund');
    expect(m.sinPago).toBe(true);
    expect(m.hechoPor.tipo).toBe('cliente');
    expect(m.hechoPor.persona.email).toBe(dueno.email);
    expect(m.usuario.email).toBe(dueno.email);

    // cronología ordenada, con la publicación, la devolución y la cancelación
    const fechas = e.linea.map((x: any) => x.fecha);
    expect([...fechas].sort()).toEqual(fechas);
    expect(e.linea.map((x: any) => x.titulo).join('|')).toMatch(/Publicación creada.*|Cancelada/);
    expect(e.linea.some((x: any) => /Devolución \(sin pago detrás\)/.test(x.titulo))).toBe(true);
  });

  it('con un pago real detrás no hay alerta alta; aparecen el pago y quién lo confirmó', async () => {
    const { acreditarSaldo } = await import('../../server/services/quotePayment.js');
    const p: any = await Payment.create({
      payerId: dueno.id, recipientId: dueno.id, amount: 5000, amountArs: 5000, currency: 'ARS', status: 'held_escrow', paymentType: 'job_publication',
      paymentMethod: 'mercadopago', platformFee: 0, mercadopagoStatus: 'approved', mercadopagoPaymentId: 'MP-123',
    } as any);
    pagos.push(p.id);
    const t = await crearTrabajo(dueno.id, { title: 'con pago', status: 'cancelled', price: 5000, publicationPaid: true, publicationPaymentId: p.id });
    jobs.push(t.id);
    await acreditarSaldo(String(dueno.id), 5000, 'Saldo a favor', { relatedModel: 'Job', relatedId: t.id, tipo: 'refund', metadata: { origen: 'cancelacion', reason: 'job_cancelled_sin_trabajador', jobId: String(t.id), pagoId: String(p.id), actor: { id: String(dueno.id), tipo: 'cliente' } } });

    const e = (await request(app).get(`/api/admin/jobs/${t.id}/expediente`).set(con(admin))).body.data;
    expect(e.alertas.filter((a: any) => a.nivel === 'alta')).toEqual([]);
    expect(e.pago.monto).toBe(5000);
    expect(e.pago.confirmadoPor).toMatch(/Mercado Pago/);
    expect(e.pago.mercadoPago.id).toBe('MP-123');
  });

  it('después de descontarlo con un ajuste manual atado a la publicación, la alerta pasa a ser un dato («ya se corrigió») y el ajuste figura en el expediente', async () => {
    const { acreditarSaldo, debitarSaldo } = await import('../../server/services/quotePayment.js');
    const t = await crearTrabajo(dueno.id, { title: 'corregida', status: 'cancelled', price: 3000, publicationPaid: true, publicationPaymentId: null, cancelledById: dueno.id, cancelledByRole: 'owner' });
    jobs.push(t.id);
    await acreditarSaldo(String(dueno.id), 3000, 'Saldo a favor', { relatedModel: 'Job', relatedId: t.id, tipo: 'refund', metadata: { origen: 'cancelacion', reason: 'job_cancelled_sin_trabajador', jobId: String(t.id), actor: { id: String(dueno.id), tipo: 'cliente' }, disponibleDesde: new Date().toISOString() } });
    expect(((await request(app).get(`/api/admin/jobs/${t.id}/expediente`).set(con(admin))).body.data.alertas[0]).nivel).toBe('alta');

    await debitarSaldo(String(dueno.id), 3000, 'Ajuste manual: devolución sin cobro', { tipo: 'adjustment', metadata: { origen: 'ajuste_manual', motivo: 'sin cobro', corrigeLaPublicacion: String(t.id) } });
    const e = (await request(app).get(`/api/admin/jobs/${t.id}/expediente`).set(con(admin))).body.data;
    expect(e.alertas.filter((a: any) => a.nivel === 'alta')).toEqual([]);
    expect(e.alertas.some((a: any) => /ya se corrigió/.test(a.titulo))).toBe(true);
    expect(e.movimientos.some((m: any) => m.origen === 'ajuste_manual' && m.monto === -3000)).toBe(true);
    expect(e.linea.some((x: any) => /Ajuste manual/.test(x.titulo))).toBe(true);
  });

  it('solo administradores; uno inexistente es 404; un id inválido es 400', async () => {
    expect((await request(app).get(`/api/admin/jobs/${jobs[0]}/expediente`).set(con(comun))).status).toBeGreaterThanOrEqual(401);
    expect((await request(app).get('/api/admin/jobs/00000000-0000-4000-8000-000000000000/expediente').set(con(admin))).status).toBe(404);
    expect((await request(app).get('/api/admin/jobs/no-es-un-id/expediente').set(con(admin))).status).toBe(400);
  });

  it('las alertas por sí solas: devolver más de lo pagado, doble devolución y pago sin confirmar', () => {
    const base = {
      estado: 'cancelled', precio: 5000, figuraPagada: true, pagoId: 'p1', pagadaConSaldo: false, creditoVinculado: 0, pausadaPorAdmin: false, reprogramada: false, duenoNombre: 'Ana',
      pago: { monto: 5000, moneda: 'ARS', estado: 'held_escrow' },
    };
    expect(alertasDeLaPublicacion({ ...base, devoluciones: [{ monto: 5000, pagoId: 'p1' }] })).toEqual([]);
    const demas = alertasDeLaPublicacion({ ...base, devoluciones: [{ monto: 5000, pagoId: 'p1' }, { monto: 5000, pagoId: 'p1' }] });
    expect(demas.map((a) => a.titulo)).toEqual(expect.arrayContaining(['Se devolvió más de lo que se pagó', 'El mismo pago se devolvió más de una vez']));
    expect(demas.every((a) => a.nivel === 'alta')).toBe(true);
    const sinConfirmar = alertasDeLaPublicacion({ ...base, pago: { monto: 5000, moneda: 'ARS', estado: 'pending_verification' }, devoluciones: [] });
    expect(sinConfirmar[0].titulo).toMatch(/pending_verification/);
    // pagada con saldo: la devolución sin pago anotado es legítima
    expect(alertasDeLaPublicacion({ ...base, pagoId: null, pago: null, pagadaConSaldo: true, devoluciones: [{ monto: 5000, pagoId: null }] })).toEqual([]);
  });
});
