import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * El caso real «try» (prod, 17/10): una publicación de $400.000 con un pago REGISTRADO por transferencia ($431.956,80), aprobado a mano por la
 * misma cuenta que pagó, sin que el dinero hubiera entrado. Se canceló y el sistema, que da por buena la aprobación de un administrador, lo devolvió
 * al saldo. (Una versión anterior de las alertas lo describía mal como «sin pago registrado»: el pago existía; lo que faltaba era que alguien
 * más comprobara el dinero.) Acá se prueba cómo lo ven el expediente y la auditoría, y cómo se corrige: ajuste del saldo + anulación del pago.
 */
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));

import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { Payment } from '../../server/models/sql/Payment.model.js';
import { Invoice } from '../../server/models/sql/Invoice.model.js';
import { AuditLog } from '../../server/models/sql/AuditLog.model.js';
import { Notification } from '../../server/models/sql/Notification.model.js';
import BalanceTransaction from '../../server/models/sql/BalanceTransaction.model.js';
import { auditarSaldos } from '../../server/services/auditoriaSaldos.js';
import { anularPagoSinDinero } from '../../server/services/anulacionDePagos.js';
import { ajustarSaldoDeUsuario } from '../../server/services/ajusteDeSaldo.js';
import { crearUsuario, crearTrabajo } from '../helpers/fixtures.js';

describe('un pago por transferencia aprobado por quien pagó', () => {
  let app: Express;
  let admin: any, dueno: any;
  let pago: any, trabajo: any;
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const saldo = async () => Number(((await User.findByPk(dueno.id, { attributes: ['balanceArs'] })) as any).balanceArs) || 0;
  const expediente = async () => (await request(app).get(`/api/admin/jobs/${trabajo.id}/expediente`).set(con(admin))).body.data;
  const hallazgos = async (inv: number) => (await auditarSaldos()).hallazgos.filter((h) => h.invariante === inv && h.jobId === String(trabajo.id));

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/admin/jobs', (await import('../../server/routes/admin/jobs.js')).default);
    admin = await crearUsuario({ role: 'admin', adminRole: 'admin' });
    dueno = await crearUsuario({ role: 'client', dniVerified: true });

    pago = await Payment.create({
      payerId: dueno.id, recipientId: dueno.id, amount: 431956.8, amountArs: 431956.8, currency: 'ARS', status: 'completed', paymentType: 'job_publication',
      paymentMethod: 'bank_transfer', platformFee: 31956.8, approvedBy: dueno.id, approvedAt: new Date(),
    } as any);
    trabajo = await crearTrabajo(dueno.id, {
      title: 'try', status: 'cancelled', price: 400000, publicationPaid: false, publicationPaymentId: pago.id, publicationCredit: 431956.8,
      cancelledById: dueno.id, cancelledByRole: 'owner', cancelledAt: new Date(), cancellationReason: 'xxxxxxxxxxxx',
    });
    await Invoice.create({ invoiceNumber: `DOAPP-TEST-${Date.now()}`, type: 'client_payment', userId: dueno.id, paymentId: pago.id, amount: 431956.8, total: 431956.8, status: 'generated' } as any);
    // la aprobación quedó anotada sobre el PAGO (no sobre la publicación)
    await AuditLog.create({
      performedBy: dueno.id, action: 'payment.approve', category: 'payment', severity: 'high', description: `Aprobó/verificó el pago ${pago.id} (nuevo estado: completed)`,
      targetModel: 'Payment', targetId: pago.id, ip: '127.0.0.1', userAgent: 'test', passwordVerified: false, twoFactorVerified: false,
    } as any);

    // la devolución que hizo el sistema al cancelar (el asiento viejo no anota el pago)
    const { acreditarSaldo } = await import('../../server/services/quotePayment.js');
    await acreditarSaldo(String(dueno.id), 431956.8, 'Saldo a favor por cancelación de "try"', {
      relatedModel: 'Job', relatedId: trabajo.id, tipo: 'refund',
      metadata: { origen: 'cancelacion', reason: 'job_cancelled_sin_trabajador', jobId: String(trabajo.id), jobPrice: 400000, actor: { id: String(dueno.id), tipo: 'cliente' }, disponibleDesde: new Date().toISOString() },
    });
  });

  afterAll(async () => {
    try {
      await AuditLog.destroy({ where: { targetId: [pago.id] } as any });
      await AuditLog.destroy({ where: { action: 'BALANCE_ADJUSTED_MANUALLY' } as any });
      await Invoice.destroy({ where: { paymentId: pago.id } as any, force: true } as any);
      await Notification.destroy({ where: { recipientId: [admin.id, dueno.id] } });
      await BalanceTransaction.destroy({ where: { userId: dueno.id }, force: true } as any);
      await Job.destroy({ where: { id: trabajo.id }, force: true });
      await Payment.destroy({ where: { id: pago.id }, force: true } as any);
      await User.destroy({ where: { id: [admin.id, dueno.id] }, force: true });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  it('el expediente NO dice «sin pago»: muestra el pago, y avisa que lo aprobó la misma cuenta que pagó', async () => {
    const e = await expediente();
    expect(e.pago.monto).toBe(431956.8);
    expect(e.pago.medio).toBe('bank_transfer');
    expect(e.pago.pagador.email).toBe(dueno.email);
    expect(e.pago.aprobadoPor.email).toBe(dueno.email);
    expect(e.pago.aprobadoPorElPagador).toBe(true);
    expect(e.pago.esManual).toBe(true);

    expect(e.alertas.some((a: any) => /nunca se cobró/.test(a.titulo))).toBe(false);
    const aviso = e.alertas.find((a: any) => /misma persona que pagó/.test(a.titulo));
    expect(aviso.nivel).toBe('media');
    expect(aviso.queHacer).toMatch(/anularPago/);
    expect(e.alertas.some((a: any) => /no anota de qué pago salió/.test(a.titulo))).toBe(true);

    // la devolución no se marca «sin pago detrás»: la publicación sí tiene un pago registrado
    expect(e.movimientos.find((m: any) => m.tipo === 'refund').sinPago).toBe(false);
    // y quién aprobó el pago aparece en la auditoría (se anota sobre el pago, no sobre la publicación)
    expect(e.auditoria.some((a: any) => a.accion === 'payment.approve' && a.sobre === 'Pago' && a.quien)).toBe(true);
  });

  it('la auditoría lo marca en el invariante 7 (pago aprobado por quien pagó) y NO en el 6 (la publicación sí tiene pago)', async () => {
    expect((await hallazgos(7)).length).toBe(1);
    expect((await hallazgos(7))[0].gravedad).toBe('media');
    expect((await hallazgos(6)).filter((h) => /Devolución sin pago/.test(h.titulo))).toEqual([]);
  });

  it('corrección: descontar el saldo (baja también el saldo vinculado) y anular el pago; después ya no hay nada que marcar', async () => {
    // vista previa: no cambia nada
    const vista = await ajustarSaldoDeUsuario({ email: dueno.email, monto: -431956.8, motivo: 'Pago de prueba aprobado sin dinero real', publicacion: String(trabajo.id), aplicar: false }, () => {});
    expect(vista.aplicado).toBe(false);
    expect(await saldo()).toBe(431956.8);

    const ajustesAntes = await AuditLog.count({ where: { action: 'BALANCE_ADJUSTED_MANUALLY' } as any });
    const hecho = await ajustarSaldoDeUsuario({ email: dueno.email, monto: -431956.8, motivo: 'Pago de prueba aprobado sin dinero real', publicacion: String(trabajo.id), aplicar: true }, () => {});
    expect(hecho.aplicado).toBe(true);
    expect(await saldo()).toBe(0);
    expect(Number(((await Job.findByPk(trabajo.id)) as any).publicationCredit)).toBe(0); // el vínculo bajó con el saldo
    expect(await AuditLog.count({ where: { action: 'BALANCE_ADJUSTED_MANUALLY' } as any })).toBe(ajustesAntes + 1); // el ajuste queda en el registro de movimientos de dinero

    // anular el pago: primero la vista previa
    const previa = await anularPagoSinDinero(String(pago.id), 'Transferencia de prueba aprobada sin dinero real', { aplicar: false }, () => {});
    expect(previa.anulado).toBe(false);
    expect(previa.facturas.length).toBe(1);
    expect(previa.faltaDescontar).toBe(0); // ya se descontó con el ajuste
    expect(((await Payment.findByPk(pago.id)) as any).status).toBe('completed');

    const anulado = await anularPagoSinDinero(String(pago.id), 'Transferencia de prueba aprobada sin dinero real', { aplicar: true }, () => {});
    expect(anulado.anulado).toBe(true);
    expect(((await Payment.findByPk(pago.id)) as any).status).toBe('cancelled');
    expect(((await Invoice.findOne({ where: { paymentId: pago.id } as any })) as any).status).toBe('void');
    expect(await AuditLog.count({ where: { action: 'PAYMENT_VOIDED', targetId: pago.id } as any })).toBe(1);

    // el expediente y la auditoría lo reflejan
    const e = await expediente();
    expect(e.alertas.some((a: any) => /misma persona que pagó/.test(a.titulo))).toBe(false);
    expect(e.alertas.some((a: any) => /anulado/.test(a.titulo))).toBe(true);
    expect(await hallazgos(7)).toEqual([]);
  });

  it('un pago ya anulado no se anula de nuevo; uno confirmado por una pasarela no se anula (se reembolsa)', async () => {
    await expect(anularPagoSinDinero(String(pago.id), 'Intento repetido de anular', { aplicar: true }, () => {})).rejects.toThrow(/ya está cancelled/);

    const conMp: any = await Payment.create({
      payerId: dueno.id, recipientId: dueno.id, amount: 5000, amountArs: 5000, currency: 'ARS', status: 'held_escrow', paymentType: 'job_publication',
      paymentMethod: 'mercadopago', platformFee: 0, mercadopagoStatus: 'approved', mercadopagoPaymentId: 'MP-1',
    } as any);
    await expect(anularPagoSinDinero(String(conMp.id), 'No debería poder anularse', { aplicar: true }, () => {})).rejects.toThrow(/pasarela/);
    expect(((await Payment.findByPk(conMp.id)) as any).status).toBe('held_escrow');
    await Payment.destroy({ where: { id: conMp.id }, force: true } as any);
  });

  it('si todavía falta descontar saldo, la anulación lo avisa (no lo toca)', async () => {
    const otro: any = await Payment.create({
      payerId: dueno.id, recipientId: dueno.id, amount: 1000, amountArs: 1000, currency: 'ARS', status: 'completed', paymentType: 'job_publication',
      paymentMethod: 'bank_transfer', platformFee: 0, approvedBy: dueno.id, approvedAt: new Date(),
    } as any);
    const t2 = await crearTrabajo(dueno.id, { title: 'otro', status: 'cancelled', price: 1000, publicationPaymentId: otro.id });
    const { acreditarSaldo } = await import('../../server/services/quotePayment.js');
    await acreditarSaldo(String(dueno.id), 1000, 'Saldo a favor', { relatedModel: 'Job', relatedId: t2.id, tipo: 'refund', metadata: { origen: 'cancelacion', reason: 'job_cancelled_sin_trabajador', jobId: String(t2.id), disponibleDesde: new Date().toISOString() } });
    const r = await anularPagoSinDinero(String(otro.id), 'Prueba de aviso por saldo sin descontar', { aplicar: false }, () => {});
    expect(r.faltaDescontar).toBe(1000);
    await BalanceTransaction.destroy({ where: { userId: dueno.id }, force: true } as any);
    await User.update({ balanceArs: 0 } as any, { where: { id: dueno.id } });
    await Job.destroy({ where: { id: t2.id }, force: true });
    await Payment.destroy({ where: { id: otro.id }, force: true } as any);
  });
});
