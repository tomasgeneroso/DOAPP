import { describe, it, expect, beforeAll, beforeEach, afterAll, jest } from '@jest/globals';
import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { Payment } from '../../server/models/sql/Payment.model.js';
import { Notification } from '../../server/models/sql/Notification.model.js';
import { BalanceTransaction } from '../../server/models/sql/BalanceTransaction.model.js';
import { crearUsuario } from '../helpers/fixtures.js';

/**
 * Cancelar una publicación pagada mueve plata: acreditar saldo o devolver por Mercado Pago. Antes de moverla se comprueba el pago que la
 * justifica (confirmado solo o por un admin, del cliente, de esa publicación, con monto, moneda y fecha que cierren, y —si sale por Mercado
 * Pago— confirmado por Mercado Pago en ese momento). Estos tests lo prueban contra una base real; Mercado Pago se simula.
 */
const mp = { getPayment: jest.fn<(...args: any[]) => Promise<any>>(), refundPayment: jest.fn<(...args: any[]) => Promise<any>>() };
jest.mock('../../server/services/mercadopago.js', () => ({ __esModule: true, default: mp }));

describe('cancelación: comprobaciones antes de mover el dinero', () => {
  let cliente: any;
  let admin: any;
  let liquidar: any;
  const creados = { jobs: [] as string[], pagos: [] as string[] };

  beforeAll(async () => {
    ({ liquidarCancelacionDePublicacion: liquidar } = await import('../../server/services/jobCancellation.js'));
    cliente = await crearUsuario({ role: 'client' });
    admin = await crearUsuario({ role: 'admin' });
  });

  beforeEach(() => {
    mp.getPayment.mockReset();
    mp.refundPayment.mockReset();
  });

  afterAll(async () => {
    try {
      await Notification.destroy({ where: { recipientId: [cliente.id, admin.id] } as any });
      await BalanceTransaction.destroy({ where: { userId: [cliente.id, admin.id] } as any });
      await Job.destroy({ where: { id: creados.jobs } as any });
      await Payment.destroy({ where: { id: creados.pagos } as any });
      await User.destroy({ where: { id: [cliente.id, admin.id] } as any, force: true });
    } catch {
      /* el próximo DROP SCHEMA lo limpia */
    }
  });

  const saldo = async () => Number(((await User.findByPk(cliente.id, { attributes: ['balanceArs'] })) as any).balanceArs) || 0;

  /** Una publicación de 36.000 pagada con un pago real (42.511,27). `pago` pisa lo que haga falta del pago. */
  async function publicacion(pago: Record<string, unknown> = {}, job: Record<string, unknown> = {}) {
    const p: any = await Payment.create({
      payerId: cliente.id,
      recipientId: cliente.id,
      amount: 42511.27,
      amountArs: 42511.27,
      currency: 'ARS',
      status: 'held_escrow',
      paymentType: 'job_publication',
      paymentMethod: 'mercadopago',
      platformFee: 3600,
      processingCharge: 1781.22,
      mercadopagoStatus: 'approved',
      ...pago,
    } as any);
    creados.pagos.push(p.id);
    const j: any = await Job.create({
      title: 'Arreglo de canilla',
      summary: 'Canilla que gotea en la cocina',
      description: 'Canilla que gotea en la cocina, hay que cambiar el cuerito o la canilla entera segun se vea',
      price: 36000,
      clientId: cliente.id,
      status: 'open',
      category: 'Reparaciones',
      tags: [],
      location: 'Almagro',
      remoteOk: false,
      startDate: new Date(Date.now() + 5 * 86_400_000),
      endDateFlexible: false,
      allowCounterOffers: true,
      singleDelivery: true,
      urgency: 'medium',
      experienceLevel: 'intermediate',
      permanentlyCancelled: false,
      publicationPaid: true,
      publicationPaymentId: p.id,
      selectedWorkers: [],
      ...job,
    } as any);
    creados.jobs.push(j.id);
    return { pago: p, job: j };
  }

  const cancelar = (job: any, salida: 'saldo' | 'devolucion' = 'saldo') =>
    liquidar(job, { aprobada: true, horasHastaInicio: 120, actor: { id: String(cliente.id), tipo: 'cliente' }, motivo: 'prueba', salida });

  const avisosAAdmin = (codigo: string) =>
    Notification.findAll({ where: { recipientId: admin.id, category: 'admin', actionUrl: `/admin/guia-de-errores#${codigo}` } as any });

  it('un pago confirmado a mano por un administrador acredita el saldo, y deja anotado qué se comprobó', async () => {
    const { job, pago } = await publicacion({ mercadopagoStatus: null, approvedBy: String(admin.id), approvedAt: new Date() });
    const antes = await saldo();
    const r = await cancelar(job);
    expect(r.plataMovida).toBe(true);
    expect(r.problemas).toEqual([]);
    expect(await saldo()).toBeCloseTo(antes + 40356, 0);
    const asiento: any = await BalanceTransaction.findOne({ where: { userId: cliente.id, type: 'refund' } as any, order: [['createdAt', 'DESC']] });
    expect(asiento.metadata.pagoId).toBe(pago.id);
    const confirmado = asiento.metadata.comprobaciones.find((c: any) => c.id === 'pago_confirmado');
    expect(confirmado.ok).toBe(true);
    expect(confirmado.encontrado).toMatch(/administrador/);
  });

  it('un pago que NADIE confirmó no acredita nada: el cliente no recibe saldo, queda avisado el admin con el código y el enlace a la guía', async () => {
    const { job } = await publicacion({ status: 'pending_verification', mercadopagoStatus: null });
    const antes = await saldo();
    const r = await cancelar(job);
    expect(r.plataMovida).toBe(false);
    expect(r.problemas.map((p: any) => p.codigo)).toContain('PAGO-SIN-CONFIRMAR');
    expect(await saldo()).toBe(antes);
    const avisos = await avisosAAdmin('PAGO-SIN-CONFIRMAR');
    expect(avisos.length).toBeGreaterThan(0);
    expect((avisos[0] as any).message).toMatch(/esperaba .*encontré|nadie lo confirmó/);
  });

  it('el pago de OTRO usuario no se acredita al cliente que cancela', async () => {
    const otro = await crearUsuario({ role: 'client' });
    try {
      const { job } = await publicacion({ payerId: otro.id });
      const antes = await saldo();
      const r = await cancelar(job);
      expect(r.plataMovida).toBe(false);
      expect(r.controles.find((c: any) => c.id === 'pago_del_cliente').ok).toBe(false);
      expect(await saldo()).toBe(antes);
    } finally {
      await User.destroy({ where: { id: otro.id } as any, force: true }).catch(() => {});
    }
  });

  it('pidió devolución al medio de pago pero el pago se confirmó a mano y no tiene número de operación: queda como saldo, informativo, sin alarmar a nadie', async () => {
    const { job } = await publicacion({ mercadopagoStatus: null, approvedBy: String(admin.id), approvedAt: new Date() });
    const antes = await saldo();
    const r = await cancelar(job, 'devolucion');
    expect(r.salida).toBe('saldo');
    expect(r.plataMovida).toBe(true);
    expect(r.problemas.map((p: any) => p.codigo)).toEqual(['DEV-SIN-ID-DE-PAGO']);
    expect(await saldo()).toBeCloseTo(antes + 40356, 0);
    expect(mp.refundPayment).not.toHaveBeenCalled();
    expect((await avisosAAdmin('DEV-SIN-ID-DE-PAGO')).length).toBe(0); // gravedad baja: el dinero se movió bien
  });

  it('devolución por Mercado Pago con todo en orden: se consulta a Mercado Pago, sale por ahí, se anota en el pago y el saldo no se toca', async () => {
    const { job, pago } = await publicacion({ mercadopagoPaymentId: `mp-${Date.now()}-a`, createdAt: new Date(Date.now() - 86_400_000) });
    mp.getPayment.mockResolvedValue({ status: 'approved', transaction_amount: 42511.27, currency_id: 'ARS', transaction_amount_refunded: 0 });
    mp.refundPayment.mockResolvedValue({ refundId: 'r-1', status: 'approved' });
    const antes = await saldo();
    const r = await cancelar(job, 'devolucion');
    expect(mp.getPayment).toHaveBeenCalledWith(pago.mercadopagoPaymentId, 'mercadopago');
    expect(mp.refundPayment).toHaveBeenCalledTimes(1);
    expect(mp.refundPayment.mock.calls[0][0]).toBe(pago.mercadopagoPaymentId);
    expect(r.salida).toBe('devolucion');
    expect(r.plataMovida).toBe(true);
    expect(r.problemas).toEqual([]);
    expect(await saldo()).toBe(antes);
    const actualizado: any = await Payment.findByPk(pago.id);
    expect(Number(actualizado.refundedAmount)).toBeCloseTo(r.devueltoPorMp, 2);
    expect(actualizado.status).toBe('refunded');
  });

  it('si Mercado Pago dice otro importe, NO devuelve por ahí: el dinero queda como saldo y se avisa al admin con lo esperado y lo encontrado', async () => {
    const { job } = await publicacion({ mercadopagoPaymentId: `mp-${Date.now()}-b` });
    mp.getPayment.mockResolvedValue({ status: 'approved', transaction_amount: 100, currency_id: 'ARS', transaction_amount_refunded: 0 });
    const antes = await saldo();
    const r = await cancelar(job, 'devolucion');
    expect(mp.refundPayment).not.toHaveBeenCalled();
    expect(r.salida).toBe('saldo');
    expect(r.plataMovida).toBe(true);
    expect(await saldo()).toBeCloseTo(antes + 40356, 0);
    const p = r.problemas.find((x: any) => x.codigo === 'DEV-CONTROL-FALLIDO');
    expect(p).toBeTruthy();
    expect(p.detalle).toMatch(/Mercado Pago confirma el pago ahora mismo: esperaba approved, \$42\.511,27/);
    expect((await avisosAAdmin('DEV-CONTROL-FALLIDO')).length).toBeGreaterThan(0);
  });

  it('si Mercado Pago rechaza la devolución, el cliente igual recupera su dinero como saldo', async () => {
    const { job } = await publicacion({ mercadopagoPaymentId: `mp-${Date.now()}-c` });
    mp.getPayment.mockResolvedValue({ status: 'approved', transaction_amount: 42511.27, currency_id: 'ARS', transaction_amount_refunded: 0 });
    mp.refundPayment.mockRejectedValue(new Error('No se pudo procesar la devolución: payment too old'));
    const antes = await saldo();
    const r = await cancelar(job, 'devolucion');
    expect(r.salida).toBe('saldo');
    expect(r.plataMovida).toBe(true);
    expect(await saldo()).toBeCloseTo(antes + 40356, 0);
    const p = r.problemas.find((x: any) => x.codigo === 'DEV-MP-RECHAZADA');
    expect(p.detalle).toMatch(/payment too old/);
  });

  it('un cliente con 3 devoluciones en 30 días pasa a revisión: el dinero queda como saldo y se avisa', async () => {
    for (let i = 0; i < 3; i++) {
      const { pago } = await publicacion({ status: 'refunded', refundedAmount: 1000, refundedAt: new Date(), mercadopagoPaymentId: `mp-${Date.now()}-r${i}` });
      expect(pago.id).toBeTruthy();
    }
    const { job } = await publicacion({ mercadopagoPaymentId: `mp-${Date.now()}-d` });
    mp.getPayment.mockResolvedValue({ status: 'approved', transaction_amount: 42511.27, currency_id: 'ARS', transaction_amount_refunded: 0 });
    const r = await cancelar(job, 'devolucion');
    expect(mp.refundPayment).not.toHaveBeenCalled();
    expect(r.problemas.map((p: any) => p.codigo)).toContain('DEV-CONTROL-FALLIDO');
    expect(r.controles.find((c: any) => c.id === 'ritmo_de_devoluciones').ok).toBe(false);
  });
});

describe('cancelación: tope de devolución al medio de pago y fecha de liberación del saldo', () => {
  let cliente: any;
  let liquidar: any;
  const creados = { jobs: [] as string[], pagos: [] as string[] };
  beforeAll(async () => {
    ({ liquidarCancelacionDePublicacion: liquidar } = await import('../../server/services/jobCancellation.js'));
    cliente = await crearUsuario({ role: 'client' });
  });
  afterAll(async () => {
    try {
      await Notification.destroy({ where: { recipientId: cliente.id } as any });
      await BalanceTransaction.destroy({ where: { userId: cliente.id } as any });
      await Job.destroy({ where: { id: creados.jobs } as any });
      await Payment.destroy({ where: { id: creados.pagos } as any });
      await User.destroy({ where: { id: cliente.id } as any, force: true });
    } catch {
      /* el próximo DROP SCHEMA lo limpia */
    }
  });
  async function publicacion(precio: number, pago: Record<string, unknown> = {}) {
    const comision = precio * 0.1;
    const iva = comision * 0.21;
    const p: any = await Payment.create({
      payerId: cliente.id, recipientId: cliente.id, amount: precio + comision + iva, amountArs: precio + comision + iva, currency: 'ARS', status: 'held_escrow',
      paymentType: 'job_publication', paymentMethod: 'mercadopago', platformFee: comision, processingCharge: 0, mercadopagoStatus: 'approved',
      mercadopagoPaymentId: `mp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ...pago,
    } as any);
    creados.pagos.push(p.id);
    const j: any = await Job.create({
      title: 'Obra grande', summary: 'Una obra grande para probar el tope de devolución', description: 'Una obra grande para probar el tope de devolución al medio de pago y la fecha de liberación',
      price: precio, clientId: cliente.id, status: 'open', category: 'Reparaciones', tags: [], location: 'Almagro', remoteOk: false, startDate: new Date(Date.now() + 5 * 86_400_000),
      endDateFlexible: false, allowCounterOffers: true, singleDelivery: true, urgency: 'medium', experienceLevel: 'intermediate', permanentlyCancelled: false,
      publicationPaid: true, publicationPaymentId: p.id, selectedWorkers: [],
    } as any);
    creados.jobs.push(j.id);
    return { pago: p, job: j };
  }
  const cancelar = (job: any, salida: 'saldo' | 'devolucion') =>
    liquidar(job, { aprobada: true, horasHastaInicio: 120, actor: { id: String(cliente.id), tipo: 'cliente' }, motivo: 'prueba', salida });

  it('una devolución al medio de pago por MÁS de $200.000 no sale sola: el dinero queda como saldo (no sale de la plataforma) y se avisa', async () => {
    const { job } = await publicacion(250_000);
    mp.getPayment.mockResolvedValue({ status: 'approved', transaction_amount: 250_000 * 1.1 * 1.0 + 250_000 * 0.1 * 0.21, currency_id: 'ARS', transaction_amount_refunded: 0 });
    const r = await cancelar(job, 'devolucion');
    expect(mp.refundPayment).not.toHaveBeenCalled();
    expect(r.salida).toBe('saldo');
    expect(r.plataMovida).toBe(true);
    const falla = r.controles.find((c: any) => c.id === 'monto_no_pide_al_dueno');
    expect(falla.ok).toBe(false);
    expect(r.problemas.map((p: any) => p.codigo)).toContain('DEV-CONTROL-FALLIDO');
  });

  it('hasta $200.000 sí sale por Mercado Pago', async () => {
    mp.refundPayment.mockReset();
    mp.refundPayment.mockResolvedValue({ refundId: 'r-ok', status: 'approved' });
    const { job, pago } = await publicacion(100_000);
    mp.getPayment.mockResolvedValue({ status: 'approved', transaction_amount: Number(pago.amount), currency_id: 'ARS', transaction_amount_refunded: 0 });
    const r = await cancelar(job, 'devolucion');
    expect(mp.refundPayment).toHaveBeenCalledTimes(1);
    expect(r.salida).toBe('devolucion');
  });

  it('el saldo a favor se suma YA pero lleva la fecha en que Mercado Pago libera el pago original: no se puede retirar antes', async () => {
    const libera = new Date(Date.now() + 6 * 86_400_000);
    const { job } = await publicacion(10_000, { moneyReleaseDate: libera });
    await cancelar(job, 'saldo');
    const asiento: any = await BalanceTransaction.findOne({ where: { userId: cliente.id, type: 'refund' } as any, order: [['createdAt', 'DESC']] });
    expect(Number(asiento.amount)).toBeGreaterThan(0);
    expect(new Date(asiento.metadata.disponibleDesde).getTime()).toBe(libera.getTime());
    const { saldoRetirable } = await import('../../server/services/liberacionDeSaldo.js');
    const saldo = Number(((await User.findByPk(cliente.id)) as any).balanceArs);
    const r = await saldoRetirable(String(cliente.id), saldo);
    expect(r.enLiberacion).toBeGreaterThan(0);
    expect(r.proximaLiberacion?.getTime()).toBe(libera.getTime());
  });

  it('si Mercado Pago ya liberó ese pago, el asiento no lleva espera', async () => {
    const { job } = await publicacion(10_000, { moneyReleaseDate: new Date(Date.now() - 86_400_000) });
    await cancelar(job, 'saldo');
    const asiento: any = await BalanceTransaction.findOne({ where: { userId: cliente.id, type: 'refund' } as any, order: [['createdAt', 'DESC']] });
    expect(asiento.metadata.disponibleDesde).toBeUndefined();
  });
});

describe('saldo contra libro: antes de mover el saldo de un usuario', () => {
  it('acreditar sobre un saldo que no cierra NO se frena (el cliente recupera su plata) pero avisa a administración; retirar SÍ se frena', async () => {
    const { acreditarSaldo, debitarSaldo } = await import('../../server/services/quotePayment.js');
    const { ErrorDeDinero } = await import('../../server/services/controlesDeDinero.js');
    const admin: any = await crearUsuario({ role: 'admin' });
    const u: any = await crearUsuario({ balanceArs: 1000 }); // con su asiento de 1000
    try {
      await u.update({ balanceArs: 1500 }); // alguien lo tocó sin asiento

      await acreditarSaldo(String(u.id), 200, 'prueba');
      expect(Number(((await User.findByPk(u.id)) as any).balanceArs)).toBe(1700);
      const avisos = await Notification.findAll({ where: { recipientId: admin.id, actionUrl: '/admin/guia-de-errores#SALDO-NO-CIERRA-LIBRO' } as any });
      expect(avisos.length).toBeGreaterThan(0);
      expect((avisos[0] as any).message).toMatch(/saldo \$1\.500, suma de movimientos \$1\.000, diferencia \$500/);

      // Un pago dentro de la app tampoco se frena...
      await debitarSaldo(String(u.id), 100, 'pago con saldo');
      // ...pero sacar plata de la plataforma sí.
      await expect(debitarSaldo(String(u.id), 100, 'retiro', { tipo: 'withdrawal' })).rejects.toBeInstanceOf(ErrorDeDinero);
      await expect(debitarSaldo(String(u.id), 100, 'retiro', { tipo: 'withdrawal' })).rejects.toMatchObject({ codigo: 'SALDO-NO-CIERRA-LIBRO' });
    } finally {
      await Notification.destroy({ where: { recipientId: admin.id } as any }).catch(() => {});
      await BalanceTransaction.destroy({ where: { userId: u.id } as any }).catch(() => {});
      await User.destroy({ where: { id: [u.id, admin.id] } as any, force: true }).catch(() => {});
    }
  });
});
