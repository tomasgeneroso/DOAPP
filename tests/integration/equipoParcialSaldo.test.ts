import { describe, it, expect, beforeAll, beforeEach, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Un trabajo PAGADO para dos lugares ($5.000) y la plata que sobra.
 *
 * El dueño eligió a UN trabajador (2.500 de los 5.000) y en «Retiros» le apareció «+ $2.500 ya están en tu cuenta pero Mercado Pago todavía no
 * liberó ese pago». Tres cosas:
 *
 *  1. Nunca se crea un pedido de retiro solo: lo que sobra queda a favor del cliente (un asiento del libro) y retirarlo es una decisión suya, desde
 *     el botón «Solicitar retiro». Acá se prueba que no aparece ninguna fila en `withdrawal_requests`.
 *  2. Mientras queden lugares sin cubrir, esa plata NO sobra todavía: es el presupuesto del segundo trabajador. Se devolvía en cada elección
 *     (comparando la cotización de ese trabajador contra el presupuesto ENTERO), así que elegir a los dos devolvía 2.500 + 2.500 por un presupuesto
 *     que ya estaba gastado en los dos contratos.
 *  3. Lo que sobra es a favor PENDIENTE hasta que la plata existe de verdad en la cuenta de la plataforma: el pago del cliente sigue en Mercado Pago
 *     unos diez días. Hasta entonces NO está en su saldo (no se usa ni se retira); al liberarse, pasa a saldo y recién ahí el cliente la tiene.
 */
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));

import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { Contract } from '../../server/models/sql/Contract.model.js';
import { Proposal } from '../../server/models/sql/Proposal.model.js';
import { Conversation } from '../../server/models/sql/Conversation.model.js';
import { ChatMessage } from '../../server/models/sql/ChatMessage.model.js';
import { Notification } from '../../server/models/sql/Notification.model.js';
import { WithdrawalRequest } from '../../server/models/sql/WithdrawalRequest.model.js';
import { Payment } from '../../server/models/sql/Payment.model.js';
import BalanceTransaction from '../../server/models/sql/BalanceTransaction.model.js';
import { crearUsuario, crearTrabajo } from '../helpers/fixtures.js';
import { devolverPresupuestoSinUsar, devolverPresupuestosSinUsar, liquidarSaldosPendientes, presupuestoSinAsignar } from '../../server/services/presupuestoDelTrabajo.js';
import { auditarSaldos } from '../../server/services/auditoriaSaldos.js';

const DIEZ_DIAS = 10 * 86_400_000;

describe('trabajo pagado para dos lugares: lo que sobra recién se devuelve cuando se sabe cuántos lugares se usan', () => {
  let app: Express;
  let cliente: any, a: any, b: any, admin: any;
  const clientes: string[] = [];
  const jobs: string[] = [];
  const pagos: string[] = [];
  const token = (u: any) => jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret');
  const con = (u: any) => ({ Authorization: `Bearer ${token(u)}` });
  let dia = 30;

  /**
   * Un trabajo de $5.000 para dos lugares, pagado, con una postulación de cada trabajador. El pago de la publicación existe: por defecto lo aprobó
   * Mercado Pago hoy (se libera en diez días); `pagoAprobadoHace` lo mueve hacia atrás (si ya pasaron más de diez días, ya está liberado).
   */
  const armar = async (precios: [number, number] = [2500, 2500], pagoAprobadoHace = 0) => {
    const pago: any = await Payment.create({
      payerId: cliente.id, amount: 5000, amountArs: 5000, currency: 'ARS', status: 'completed', paymentType: 'job_publication', paymentMethod: 'mercadopago',
      platformFee: 0, platformFeePercentage: 0, approvedAt: new Date(Date.now() - pagoAprobadoHace * 86_400_000),
    } as any);
    pagos.push(pago.id);
    const t: any = await crearTrabajo(cliente.id, {
      status: 'open', price: 5000, maxWorkers: 2, publicationPaid: true, publicationPaidAt: new Date(), pricingMode: 'fixed', publicationPaymentId: pago.id,
      startDate: new Date(Date.now() + (dia += 3) * 86_400_000),
    });
    jobs.push(t.id);
    const propuesta = (u: any, precio: number) =>
      Proposal.create({ jobId: t.id, freelancerId: u.id, clientId: cliente.id, coverLetter: 'Me sumo al equipo', proposedPrice: precio, estimatedDuration: 3, status: 'pending' } as any) as Promise<any>;
    return { trabajo: t, pago, pa: await propuesta(a, precios[0]), pb: await propuesta(b, precios[1]) };
  };
  const aprobar = (propuesta: any) => request(app).put(`/api/proposals/${propuesta.id}/approve`).set(con(cliente)).send({});
  /** Aprueba y exige que salga bien, mostrando el motivo si no. */
  const aprobarBien = async (propuesta: any) => {
    const r = await aprobar(propuesta);
    expect(r.status === 200 ? 'ok' : `${r.status}: ${r.body.message}`).toBe('ok');
    return r;
  };
  const empezarConLosElegidos = (trabajo: any) => request(app).post(`/api/jobs/${trabajo.id}/start-with-current`).set(con(cliente)).send({});
  const miSaldo = async () => (await request(app).get('/api/balance').set(con(cliente))).body;
  const saldo = async () => Number(((await User.findByPk(cliente.id, { attributes: ['balanceArs'] })) as any).balanceArs) || 0;
  const asientos = async () => (await BalanceTransaction.findAll({ where: { userId: cliente.id } as any, order: [['createdAt', 'ASC']] })) as any[];
  const delTrabajo = async (trabajo: any) => (await asientos()).filter((m) => m.metadata?.jobId === String(trabajo.id));
  const retiros = () => WithdrawalRequest.count({ where: { userId: cliente.id } as any });
  const despuesDeLaLiberacion = () => new Date(Date.now() + 11 * 86_400_000);
  const devueltoDeMas = async (trabajo: any) => (await auditarSaldos()).hallazgos.filter((h) => h.invariante === 8 && h.jobId === String(trabajo.id));
  const avisosAlAdmin = (titulo: string) => Notification.count({ where: { recipientId: admin.id, title: titulo } as any });

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/proposals', (await import('../../server/routes/proposals.js')).default);
    app.use('/api/jobs', (await import('../../server/routes/jobs.js')).default);
    app.use('/api/balance', (await import('../../server/routes/balance.js')).default);
    a = await crearUsuario({ role: 'doer', dniVerified: true });
    b = await crearUsuario({ role: 'doer', dniVerified: true });
    admin = await crearUsuario({ role: 'admin', adminRole: 'admin' });
  });

  // Un cliente nuevo por test: el saldo de uno no se mezcla con el del otro.
  beforeEach(async () => {
    cliente = await crearUsuario({ role: 'client', dniVerified: true });
    clientes.push(cliente.id);
  });

  afterAll(async () => {
    try {
      const ids = [...clientes, a.id, b.id, admin.id];
      const conv: any[] = await Conversation.findAll({ where: { jobId: jobs }, attributes: ['id'] });
      await ChatMessage.destroy({ where: { conversationId: conv.map((c) => c.id) } });
      await Conversation.destroy({ where: { jobId: jobs } });
      await Notification.destroy({ where: { recipientId: ids } });
      await Contract.destroy({ where: { jobId: jobs }, force: true });
      await Proposal.destroy({ where: { jobId: jobs }, force: true });
      await WithdrawalRequest.destroy({ where: { userId: ids } as any });
      await BalanceTransaction.destroy({ where: { userId: ids }, force: true } as any);
      await Job.destroy({ where: { id: jobs }, force: true });
      await Payment.destroy({ where: { id: pagos }, force: true } as any);
      await User.destroy({ where: { id: ids }, force: true });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  /* ---------------- cuándo se devuelve ---------------- */

  it('elegir al primero de dos lugares NO deja nada a favor: los otros 2.500 son el presupuesto del segundo', async () => {
    const { trabajo, pa } = await armar();

    const r = await aprobar(pa);

    expect([r.status, r.body.message]).toEqual([200, expect.any(String)]);
    expect(await saldo()).toBe(0);
    expect(await asientos()).toHaveLength(0);
    expect(Number(((await Job.findByPk(trabajo.id)) as any).remainingBudget)).toBe(2500);
  });

  it('elegir a los dos con 2.500 + 2.500 no devuelve nada: el presupuesto se usó entero', async () => {
    const { pa, pb } = await armar();

    await aprobarBien(pa);
    await aprobarBien(pb);

    expect(await saldo()).toBe(0);
    expect(await asientos()).toHaveLength(0);
  });

  it('no se puede elegir trabajador en un trabajo que ya empezó, terminó, se pausó o se canceló', async () => {
    const { trabajo, pa, pb } = await armar();
    await aprobarBien(pa);

    for (const [estado, texto] of [['in_progress', 'ya empezó'], ['completed', 'ya terminó'], ['paused', 'pausado'], ['cancelled', 'cancelado']] as const) {
      await Job.update({ status: estado } as any, { where: { id: trabajo.id } });
      const r = await aprobar(pb);
      expect([estado, r.status, r.body.code]).toEqual([estado, 409, 'TRABAJO_NO_ABIERTO']);
      expect(r.body.message).toContain(texto);
    }
    expect(await Contract.count({ where: { jobId: trabajo.id } as any })).toBe(1);
    expect(await asientos()).toHaveLength(0);
  });

  it('elegir al segundo con una cotización que no entra en lo que queda (3.000 de 2.500) pide pagar la diferencia y no contrata', async () => {
    const { trabajo, pa, pb } = await armar([2500, 3000]);
    await aprobarBien(pa);

    const r = await aprobar(pb);

    expect([r.status, r.body.requierePago]).toEqual([402, true]);
    expect(Number(r.body.liquidacion.aPagar)).toBe(500);
    expect(await Contract.count({ where: { jobId: trabajo.id } as any })).toBe(1);
    expect(await saldo()).toBe(0);
  });

  /* ---------------- a favor PENDIENTE hasta que Mercado Pago libera el pago ---------------- */

  it('si el equipo se completa gastando menos (2.500 + 2.000), los 500 que sobraron quedan a favor PENDIENTES, una sola vez: no están en el saldo', async () => {
    const { trabajo, pa, pb } = await armar([2500, 2000]);

    await aprobarBien(pa);
    const r = await aprobarBien(pb);

    expect(await saldo()).toBe(0); // todavía no es suyo
    const devueltos = await delTrabajo(trabajo);
    expect(devueltos).toHaveLength(1);
    expect([devueltos[0].status, Number(devueltos[0].amount)]).toEqual(['pending', 500]);
    expect(devueltos[0].metadata?.pendienteDeLiquidacion).toBe(true);
    // pasa a saldo cuando Mercado Pago libera el pago original (diez días después de aprobado)
    expect(new Date(devueltos[0].metadata?.disponibleDesde).getTime()).toBeGreaterThan(Date.now() + 5 * 86_400_000);
    expect([r.body.saldoAFavor, r.body.saldoAFavorPendiente]).toEqual([500, true]);
    expect(r.body.saldoAFavorDesde).toBe(devueltos[0].metadata.disponibleDesde);
    expect(r.body.message).toContain('PENDIENTES');
    const resumen = await miSaldo();
    expect([Number(resumen.balance), resumen.aFavorPendiente]).toEqual([0, 500]);
    expect(new Date(resumen.proximaLiquidacion).getTime()).toBe(new Date(devueltos[0].metadata.disponibleDesde).getTime());
  });

  it('empezar con 1 de 2: lo que no se usó (2.500) queda a favor pendiente; pasa al saldo recién cuando se libera el pago, y una sola vez', async () => {
    const { trabajo, pa } = await armar();
    await aprobarBien(pa);
    // el trabajador elegido acepta su contrato (condición para empezar con menos)
    await Contract.update({ status: 'accepted' } as any, { where: { jobId: trabajo.id } as any });

    const r = await empezarConLosElegidos(trabajo);

    expect([r.status, r.body.message]).toEqual([200, expect.any(String)]);
    expect([r.body.saldoAFavor, r.body.saldoAFavorPendiente]).toEqual([2500, true]);
    expect(r.body.message).toContain('PENDIENTES');
    expect(await saldo()).toBe(0);
    const devueltos = await delTrabajo(trabajo);
    expect(devueltos).toHaveLength(1);
    expect([devueltos[0].status, Number(devueltos[0].amount), devueltos[0].metadata?.origen]).toEqual(['pending', 2500, 'equipo_parcial']);
    expect(await devueltoDeMas(trabajo)).toHaveLength(0); // dejar a favor lo que no se usó no es un exceso
    // no se devuelve dos veces: ni repitiendo la devolución ni con el barrido
    expect(await presupuestoSinAsignar((await Job.findByPk(trabajo.id)) as any)).toBe(0);
    expect((await devolverPresupuestoSinUsar(String(trabajo.id))).devuelto).toBe(0);
    await devolverPresupuestosSinUsar();
    expect(await delTrabajo(trabajo)).toHaveLength(1);

    // antes de la fecha no pasa nada: la plata todavía no está en la cuenta de la plataforma
    await liquidarSaldosPendientes();
    expect(await saldo()).toBe(0);
    expect((await delTrabajo(trabajo))[0].status).toBe('pending');

    // liberado el pago original: pasa a saldo, con sus saldos reales, y se le avisa
    expect(await liquidarSaldosPendientes(despuesDeLaLiberacion())).toBeGreaterThanOrEqual(1);
    expect(await saldo()).toBe(2500);
    const liquidado = (await delTrabajo(trabajo))[0];
    expect([liquidado.status, Number(liquidado.balanceBefore), Number(liquidado.balanceAfter), liquidado.metadata?.pendienteDeLiquidacion]).toEqual(['completed', 0, 2500, false]);
    expect(liquidado.metadata?.liquidadoEl).toBeTruthy();
    expect(await Notification.count({ where: { recipientId: cliente.id, title: 'Ya tenés tu saldo a favor' } as any })).toBe(1);
    const resumen = await miSaldo();
    expect([Number(resumen.balance), resumen.aFavorPendiente]).toEqual([2500, 0]);
    await liquidarSaldosPendientes(despuesDeLaLiberacion()); // y no se suma dos veces
    expect(await saldo()).toBe(2500);
    expect(await Notification.count({ where: { recipientId: cliente.id, title: 'Ya tenés tu saldo a favor' } as any })).toBe(1);
  });

  it('si el pago original ya fue liberado por Mercado Pago (hace más de diez días), lo que sobra es saldo en el momento', async () => {
    const { trabajo, pa } = await armar([2500, 2500], 12);
    await aprobarBien(pa);
    await Contract.update({ status: 'accepted' } as any, { where: { jobId: trabajo.id } as any });

    const r = await empezarConLosElegidos(trabajo);

    expect([r.body.saldoAFavor, r.body.saldoAFavorPendiente, r.body.saldoAFavorDesde]).toEqual([2500, false, null]);
    expect(await saldo()).toBe(2500);
    expect((await delTrabajo(trabajo))[0].status).toBe('completed');
    expect((await miSaldo()).aFavorPendiente).toBe(0);
  });

  it('si el pago original se devolvió antes de liberarse, el pendiente NO pasa al saldo: queda bloqueado y se avisa a administración una sola vez', async () => {
    const { trabajo, pago, pa } = await armar();
    await aprobarBien(pa);
    await Contract.update({ status: 'accepted' } as any, { where: { jobId: trabajo.id } as any });
    expect((await empezarConLosElegidos(trabajo)).status).toBe(200);
    await Payment.update({ status: 'refunded', refundedAmount: 5000 } as any, { where: { id: pago.id } });
    const antes = await avisosAlAdmin('Un saldo a favor pendiente no se pudo liquidar');

    await liquidarSaldosPendientes(despuesDeLaLiberacion());

    expect(await saldo()).toBe(0);
    const bloqueado = (await delTrabajo(trabajo))[0];
    expect([bloqueado.status, bloqueado.metadata?.bloqueada?.motivo]).toEqual(['pending', 'el pago original está refunded']);
    expect(await avisosAlAdmin('Un saldo a favor pendiente no se pudo liquidar')).toBe(antes + 1);
    await liquidarSaldosPendientes(despuesDeLaLiberacion());
    expect(await avisosAlAdmin('Un saldo a favor pendiente no se pudo liquidar')).toBe(antes + 1); // no se repite en cada barrido
    expect(await saldo()).toBe(0);
  });

  it('la auditoría no marca como atraso a un pendiente que espera a Mercado Pago, pero sí al que pasó su fecha y no se liquidó', async () => {
    const { trabajo, pa } = await armar();
    await aprobarBien(pa);
    await Contract.update({ status: 'accepted' } as any, { where: { jobId: trabajo.id } as any });
    await empezarConLosElegidos(trabajo);
    const demorado = async () => (await auditarSaldos()).hallazgos.filter((h) => h.invariante === 2 && h.userId === String(cliente.id));
    // aunque el asiento tenga más de un día, está esperando la liberación por diseño
    await BalanceTransaction.update({ createdAt: new Date(Date.now() - 3 * 86_400_000) } as any, { where: { userId: cliente.id }, silent: true } as any);
    expect(await demorado()).toHaveLength(0);

    // su fecha pasó hace tres días y nadie lo liquidó: eso sí es un problema
    const [fila] = await delTrabajo(trabajo);
    await BalanceTransaction.update({ metadata: { ...fila.metadata, disponibleDesde: new Date(Date.now() - 3 * 86_400_000).toISOString() } } as any, { where: { id: fila.id } });

    const marcas = await demorado();
    expect(marcas).toHaveLength(1);
    expect(marcas[0].detalle).toContain('tenía que pasar a saldo');
  });

  it('un trabajo que arrancó con 1 de 2 por otro camino (la fecha de inicio): el barrido deja el sobrante a favor pendiente, una sola vez', async () => {
    const { trabajo, pa } = await armar();
    await aprobarBien(pa);
    expect(await asientos()).toHaveLength(0);
    await Job.update({ status: 'in_progress' } as any, { where: { id: trabajo.id } });

    expect(await devolverPresupuestosSinUsar()).toBeGreaterThanOrEqual(1);
    expect(await saldo()).toBe(0);
    expect((await miSaldo()).aFavorPendiente).toBe(2500);
    expect(await devolverPresupuestosSinUsar()).toBe(0); // repetirlo no lo duplica
    expect((await miSaldo()).aFavorPendiente).toBe(2500);
    expect(await retiros()).toBe(0);
  });

  /* ---------------- lo que dejaba la versión anterior ---------------- */

  it('un trabajo que ya devolvió 2.500 al elegir al primero (como hacía antes) no devuelve de nuevo y le pide pagar al segundo', async () => {
    const { trabajo, pa, pb } = await armar();
    await aprobarBien(pa);
    const { acreditarSaldo } = await import('../../server/services/quotePayment.js');
    // lo que dejaba la versión anterior: el crédito «cotizacion_menor» de la elección del primero
    await acreditarSaldo(String(cliente.id), 2500, 'Diferencia a favor (versión anterior)', {
      relatedModel: 'Job', relatedId: trabajo.id, metadata: { origen: 'cotizacion_menor', jobId: String(trabajo.id), disponibleDesde: new Date().toISOString() },
    });

    const r = await aprobar(pb);

    expect([r.status, r.body.requierePago]).toEqual([402, true]); // esos 2.500 ya no respaldan al segundo
    expect((await devolverPresupuestoSinUsar(String(trabajo.id))).devuelto).toBe(0);
    expect(await saldo()).toBe(2500);
  });

  it('la auditoría marca lo que dejaba la versión anterior: un crédito por cada intento fallido de elegir al segundo', async () => {
    const { trabajo, pa } = await armar();
    await aprobarBien(pa);
    const { acreditarSaldo } = await import('../../server/services/quotePayment.js');
    // la versión anterior acreditaba 2.500 en la elección del primero y otros 2.500 en cada intento (fallido) con el segundo: 3 intentos
    for (let i = 0; i < 4; i++) {
      await acreditarSaldo(String(cliente.id), 2500, 'Diferencia a favor (versión anterior)', {
        relatedModel: 'Job', relatedId: trabajo.id, metadata: { origen: 'cotizacion_menor', jobId: String(trabajo.id), disponibleDesde: new Date().toISOString() },
      });
    }

    const marcas = await devueltoDeMas(trabajo);

    // pagado 5.000, contratado 2.500 (sobraban 2.500) y se devolvieron 10.000: 7.500 de más
    expect(marcas).toHaveLength(1);
    expect(marcas[0].monto).toBe(7500);
    expect(marcas[0].gravedad).toBe('alta');
    expect(marcas[0].userId).toBe(String(cliente.id));
  });

  it('una baja de precio acreditada después de devolver el sobrante no se confunde con un exceso', async () => {
    const { trabajo, pa } = await armar();
    await aprobarBien(pa);
    await Job.update({ status: 'in_progress' } as any, { where: { id: trabajo.id } });
    await devolverPresupuestosSinUsar(); // quedan a favor 2.500 (pendientes)
    const { acreditarSaldo } = await import('../../server/services/quotePayment.js');
    // el dueño baja el presupuesto de 5.000 a 3.500: la baja baja `job.price` y acredita 1.500 con motivo «price_decrease»
    await Job.update({ price: 3500 } as any, { where: { id: trabajo.id } });
    await acreditarSaldo(String(cliente.id), 1500, 'Saldo a favor por reducción de presupuesto', {
      relatedModel: 'Job', relatedId: trabajo.id,
      metadata: { origen: 'cotizacion_menor', reason: 'price_decrease', jobId: String(trabajo.id), oldPrice: 5000, newPrice: 3500, disponibleDesde: new Date().toISOString() },
    });

    expect(await devueltoDeMas(trabajo)).toHaveLength(0);
  });

  /* ---------------- el retiro es del cliente ---------------- */

  it('nunca se crea un pedido de retiro solo: la plata queda a favor y el cliente decide cuándo retirarla', async () => {
    const antesDeRetiros = await retiros();
    const { trabajo, pa } = await armar();
    expect((await aprobar(pa)).status).toBe(200);
    await Contract.update({ status: 'accepted' } as any, { where: { jobId: trabajo.id } as any });
    expect((await empezarConLosElegidos(trabajo)).status).toBe(200);
    await liquidarSaldosPendientes(despuesDeLaLiberacion());

    expect(await retiros()).toBe(antesDeRetiros);
    expect(await saldo()).toBe(2500); // la plata sí está, en el saldo, esperando que el cliente pida el retiro
  });
});
