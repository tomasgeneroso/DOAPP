import { describe, it, expect, beforeAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * El cambio de presupuesto, probado por la API y recorrido por ESTADO (reportes y reglas del dueño, 2026-11-27):
 *  - sin pagar se cambia sin mover plata; nunca se acredita plata que no entró;
 *  - publicado y sin nadie elegido: se avisa antes, se aplica y quienes estaban postulados se quitan y pueden volver a postularse;
 *  - con alguien elegido: se aplica recién cuando acepta (todas las personas elegidas) y, si sube, cuando se paga;
 *  - hay UNA sola puerta.
 */
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('node-cron', () => ({ __esModule: true, default: { schedule: () => undefined } }));
jest.mock('../../server/services/fcm.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => undefined }) }));

import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { Contract } from '../../server/models/sql/Contract.model.js';
import { Proposal } from '../../server/models/sql/Proposal.model.js';
import { Notification } from '../../server/models/sql/Notification.model.js';
import { BalanceTransaction } from '../../server/models/sql/BalanceTransaction.model.js';
import { Payment } from '../../server/models/sql/Payment.model.js';
import { conSistema } from '../../server/db/contextoRls.js';
import { bajasSinPago } from '../../server/services/bajasSinPago.js';
import { vencerPedidosDeCambio } from '../../server/services/cambioDePresupuesto.js';
import { aplicarAumentoDePrecio } from '../../server/services/aumentoDePrecio.js';
import { saldoRetirable } from '../../server/services/liberacionDeSaldo.js';
import { saldoLiberadoUsable } from '../../server/services/creditoDePublicacion.js';
import { acreditarSaldo } from '../../server/services/quotePayment.js';
import { POSTULACION_QUITADA_POR_PRESUPUESTO } from '../../shared/jobs/cambioDePresupuesto.js';
import { crearUsuario, crearTrabajo, crearContrato, pagarLaPublicacion } from '../helpers/fixtures.js';

const enDias = (n: number) => new Date(Date.now() + n * 86_400_000);
const enMinutos = (n: number) => new Date(Date.now() + n * 60_000);
const MOTIVO = 'Cambio de alcance del trabajo';

describe('cambiar el presupuesto', () => {
  let app: Express;
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/jobs', (await import('../../server/routes/jobs.js')).default);
    app.use('/api/proposals', (await import('../../server/routes/proposals.js')).default);
    app.use('/api/contracts', (await import('../../server/routes/contracts.js')).default);
  });

  /** Un cliente nuevo por caso: así el saldo y los asientos de uno no se mezclan con los de otro. */
  const armar = async (datos: Record<string, unknown> = {}, pago: Record<string, unknown> | false = {}) => {
    const cliente: any = await crearUsuario({ role: 'client' });
    const trabajo: any = await crearTrabajo(cliente.id, { price: 100000, status: 'open', publicationPaid: true, pricingMode: 'fixed', startDate: enDias(5), endDate: enDias(6), ...datos });
    if (pago !== false && trabajo.publicationPaid) await pagarLaPublicacion(trabajo, pago);
    return { cliente, trabajo };
  };
  const cambiar = (cliente: any, trabajo: any, newPrice: number, aceptaEfectos = true) =>
    request(app).patch(`/api/jobs/${trabajo.id}/budget`).set(con(cliente)).send({ newPrice, reason: MOTIVO, aceptaEfectos });
  const analizar = (cliente: any, trabajo: any, newPrice: number) => request(app).post(`/api/jobs/${trabajo.id}/budget/analisis`).set(con(cliente)).send({ newPrice });
  const responder = (u: any, trabajo: any, acepta: boolean) => request(app).post(`/api/jobs/${trabajo.id}/budget/solicitud/responder`).set(con(u)).send({ acepta });
  const pedido = (u: any, trabajo: any) => request(app).get(`/api/jobs/${trabajo.id}/budget/solicitud`).set(con(u));
  const plata = async (u: any) => ({
    saldo: Number(((await conSistema(() => User.findByPk(u.id))) as any).balanceArs || 0),
    asientos: await conSistema(() => BalanceTransaction.count({ where: { userId: u.id } as any })),
  });
  const trabajoAhora = async (t: any): Promise<any> => conSistema(() => Job.findByPk(t.id));
  const precio = async (t: any) => Number((await trabajoAhora(t)).price);
  const avisos = async (u: any): Promise<string[]> => ((await conSistema(() => Notification.findAll({ where: { recipientId: u.id } as any }))) as any[]).map((n) => n.title);
  const postular = async (trabajo: any, over: Record<string, unknown> = {}) => {
    const persona: any = await crearUsuario({ role: 'doer', dniVerified: true });
    const p: any = await conSistema(() => Proposal.create({ jobId: trabajo.id, freelancerId: persona.id, clientId: trabajo.clientId, coverLetter: 'Me interesa', proposedPrice: Number(trabajo.price), estimatedDuration: 1, status: 'pending', ...over } as any));
    return { persona, postulacion: p };
  };
  const elegir = async (cliente: any, trabajo: any, monto: number, over: Record<string, unknown> = {}) => {
    const persona: any = await crearUsuario({ role: 'doer', dniVerified: true });
    const contrato: any = await crearContrato({ jobId: trabajo.id, clientId: cliente.id, doerId: persona.id }, { status: 'accepted', price: monto, commission: 5000, totalPrice: monto + 5000, ...over });
    const t = await trabajoAhora(trabajo);
    await conSistema(() => t.update({ selectedWorkers: [...(t.selectedWorkers || []), persona.id] }));
    return { persona, contrato };
  };
  const contratoAhora = async (c: any): Promise<any> => conSistema(() => Contract.findByPk(c.id));

  describe('sin pagar, nunca se mueve plata', () => {
    it.each([['draft'], ['pending_payment']])('un trabajo en %s cambia de precio sin acreditar ni cobrar', async (status) => {
      const { cliente, trabajo } = await armar({ status, publicationPaid: false });
      expect((await cambiar(cliente, trabajo, 1000, false)).status).toBe(200);
      expect(await plata(cliente)).toEqual({ saldo: 0, asientos: 0 });
      expect(await precio(trabajo)).toBe(1000);
    });

    it('figurar «pagada» no alcanza: sin un pago confirmado detrás, la baja se frena y no cambia nada', async () => {
      const { cliente, trabajo } = await armar({}, false);
      const r = await cambiar(cliente, trabajo, 60000);
      expect([r.status, r.body.code]).toEqual([409, 'BAJA-SIN-DINERO-CONFIRMADO']);
      expect(await precio(trabajo)).toBe(100000);
      expect(await plata(cliente)).toEqual({ saldo: 0, asientos: 0 });
    });

    it('un pago que nadie confirmó tampoco alcanza', async () => {
      const { cliente, trabajo } = await armar({}, { status: 'pending' });
      expect((await cambiar(cliente, trabajo, 60000)).body.code).toBe('BAJA-SIN-DINERO-CONFIRMADO');
    });
  });

  describe('estados que esperan o frenan', () => {
    it('con una transferencia en revisión, espera a que se apruebe', async () => {
      const { cliente, trabajo } = await armar({ status: 'pending_payment', publicationPaid: false });
      await pagarLaPublicacion(trabajo, { status: 'pending_verification', approvedAt: null });
      expect((await cambiar(cliente, trabajo, 150000)).body.code).toBe('PAGO_EN_REVISION');
    });

    it('pagada y esperando aprobación de la publicación: cambia recién cuando queda publicada', async () => {
      const { cliente, trabajo } = await armar({ status: 'pending_approval' });
      expect((await cambiar(cliente, trabajo, 80000)).body.code).toBe('ESPERANDO_LA_PUBLICACION');
      await conSistema(() => Job.update({ status: 'open' } as any, { where: { id: trabajo.id } as any }));
      expect((await cambiar(cliente, trabajo, 80000)).status).toBe(200);
    });

    it.each([
      ['cancelled', 'TRABAJO_CANCELADO'],
      ['completed', 'TRABAJO_TERMINADO'],
    ])('un trabajo %s no cambia de presupuesto', async (status, codigo) => {
      const { cliente, trabajo } = await armar({ status });
      const r = await cambiar(cliente, trabajo, 1000);
      expect([r.status, r.body.code]).toEqual([409, codigo]);
      expect(await plata(cliente)).toEqual({ saldo: 0, asientos: 0 });
    });

    it.each([
      ['faltan 3 minutos', enMinutos(3)],
      ['faltan 23 horas', enMinutos(23 * 60)],
      ['ya pasó la hora', enMinutos(-30)],
    ])('sin nadie elegido, si %s para el inicio no se sube ni se baja', async (_n, startDate) => {
      const { cliente, trabajo } = await armar({ startDate, endDate: enDias(2) });
      for (const nuevo of [60000, 150000]) expect((await cambiar(cliente, trabajo, nuevo)).body.code).toBe('FALTA_POCO_PARA_EL_INICIO');
      expect(await plata(cliente)).toEqual({ saldo: 0, asientos: 0 });
    });
  });

  describe('publicado y sin nadie elegido', () => {
    it('antes de aceptar se ve lo que va a pasar, y sin aceptarlo no cambia nada', async () => {
      const { cliente, trabajo } = await armar();
      await postular(trabajo);
      const a = await analizar(cliente, trabajo, 80000);
      expect(a.status).toBe(200);
      expect(a.body.analisis).toMatchObject({ puede: true, modo: 'directo', precioActual: 100000, diferencia: -20000, aFavor: 20000, postulantesQueSeQuitan: 1, comisionYaCobrada: 5000, gastosDeTransferenciaYaCobrados: 5000 });
      const texto = a.body.efectos.join(' ');
      expect(texto).toMatch(/postul/i);
      expect(texto).toMatch(/comisión.*no se devuelve/i);
      expect(texto).toMatch(/cuando el trabajo termine/i);
      const sinAceptar = await cambiar(cliente, trabajo, 80000, false);
      expect([sinAceptar.status, sinAceptar.body.code]).toEqual([409, 'CONFIRMAR_EFECTOS']);
      expect(await precio(trabajo)).toBe(100000);
      expect(await plata(cliente)).toEqual({ saldo: 0, asientos: 0 });
    });

    it('al cambiar, las postulaciones pendientes se quitan, se avisa a cada una y pueden postularse de nuevo', async () => {
      const { cliente, trabajo } = await armar();
      const uno = await postular(trabajo);
      const dos = await postular(trabajo);
      const r = await cambiar(cliente, trabajo, 80000);
      expect([r.status, r.body.postulantesQuitados]).toEqual([200, 2]);
      for (const x of [uno, dos]) {
        const p: any = await conSistema(() => Proposal.findByPk(x.postulacion.id));
        expect([p.status, p.cancellationReason]).toEqual(['cancelled', POSTULACION_QUITADA_POR_PRESUPUESTO]);
        expect(await avisos(x.persona)).toContain('Cambió el presupuesto: postulate de nuevo');
      }
      const chequeo = await request(app).get(`/api/proposals/check/${trabajo.id}`).set(con(uno.persona));
      expect(chequeo.body).toMatchObject({ hasApplied: false, quitadaPorPresupuesto: true });
      const otraVez = await request(app).post('/api/proposals').set(con(uno.persona)).send({ job: trabajo.id, coverLetter: 'Me sigue interesando con el precio nuevo', proposedPrice: 80000, estimatedDuration: 1 });
      expect({ status: otraVez.status, message: otraVez.body.message, success: otraVez.body.success }).toMatchObject({ success: true });
      expect(((await conSistema(() => Proposal.findByPk(uno.postulacion.id))) as any).status).toBe('pending');
    });

    it('lo que queda a favor no se puede RETIRAR hasta que el trabajo termine (sí usar dentro de la app, ya liberado)', async () => {
      const { cliente, trabajo } = await armar();
      expect((await cambiar(cliente, trabajo, 80000)).status).toBe(200);
      expect((await plata(cliente)).saldo).toBe(20000);
      expect((await saldoRetirable(cliente.id, 20000)).disponible).toBe(0);
      expect(await saldoLiberadoUsable(cliente.id)).toBe(20000);
      await conSistema(() => Job.update({ status: 'completed' } as any, { where: { id: trabajo.id } as any }));
      expect((await saldoRetirable(cliente.id, 20000)).disponible).toBe(20000);
    });

    it('si la pasarela todavía no liberó el pago, queda a favor PENDIENTE: no es saldo', async () => {
      const { cliente, trabajo } = await armar({}, { paymentMethod: 'mercadopago', mercadopagoStatus: 'approved' });
      expect((await cambiar(cliente, trabajo, 80000)).status).toBe(200);
      expect((await plata(cliente)).saldo).toBe(0);
      const fila: any = await conSistema(() => BalanceTransaction.findOne({ where: { userId: cliente.id } as any }));
      expect([fila.status, Number(fila.amount)]).toEqual(['pending', 20000]);
    });

    it('dos pedidos a la vez no acreditan dos veces', async () => {
      const { cliente, trabajo } = await armar();
      await Promise.all([cambiar(cliente, trabajo, 80000), cambiar(cliente, trabajo, 80000)]);
      expect(await precio(trabajo)).toBe(80000);
      expect(await plata(cliente)).toEqual({ saldo: 20000, asientos: 1 });
    });

    it('bajar en dos pasos devuelve en total lo que bajó, nunca más de lo que entró', async () => {
      const { cliente, trabajo } = await armar();
      await cambiar(cliente, trabajo, 80000);
      await cambiar(cliente, trabajo, 50000);
      expect(await plata(cliente)).toEqual({ saldo: 50000, asientos: 2 });
    });

    it('subir sin saldo pausa la publicación hasta que se pague, y las postulaciones se quitan recién al aplicarse', async () => {
      const { cliente, trabajo } = await armar();
      const x = await postular(trabajo);
      const r = await cambiar(cliente, trabajo, 150000);
      expect([r.status, r.body.requiresPayment]).toEqual([402, true]);
      let t = await trabajoAhora(trabajo);
      expect([t.status, Number(t.pendingNewPrice), Number(t.price)]).toEqual(['paused', 150000, 100000]);
      expect(((await conSistema(() => Proposal.findByPk(x.postulacion.id))) as any).status).toBe('pending');
      const pago: any = await conSistema(() => Payment.create({ payerId: cliente.id, amount: Number(t.pendingPaymentAmount), currency: 'ARS', status: 'completed', paymentType: 'budget_increase', paymentMethod: 'mercadopago', jobId: trabajo.id } as any));
      await conSistema(() => Job.update({ publicationPaymentId: pago.id } as any, { where: { id: trabajo.id } as any }));
      expect((await conSistema(() => aplicarAumentoDePrecio(pago, 'admin', cliente.id))).aplicado).toBe(true);
      t = await trabajoAhora(trabajo);
      expect([t.status, Number(t.price)]).toEqual(['open', 150000]);
      expect(((await conSistema(() => Proposal.findByPk(x.postulacion.id))) as any).status).toBe('cancelled');
    });
  });

  describe('con alguien ya elegido', () => {
    it('sin pagar la publicación no se puede', async () => {
      const { cliente, trabajo } = await armar({ publicationPaid: false, status: 'open' });
      await elegir(cliente, trabajo, 100000);
      expect((await cambiar(cliente, trabajo, 60000)).body.code).toBe('FALTA_PAGAR_LA_PUBLICACION');
    });

    it('queda como PEDIDO: nada cambia hasta que acepte, la persona se entera y solo ve su parte', async () => {
      const { cliente, trabajo } = await armar({ startDate: enMinutos(3), endDate: enDias(1) });
      const { persona, contrato } = await elegir(cliente, trabajo, 100000);
      const r = await cambiar(cliente, trabajo, 60000);
      expect([r.status, r.body.esperandoRespuesta]).toEqual([200, true]);
      expect(await precio(trabajo)).toBe(100000);
      expect(Number((await contratoAhora(contrato)).price)).toBe(100000);
      expect(await plata(cliente)).toEqual({ saldo: 0, asientos: 0 });
      expect(await avisos(persona)).toContain('Te piden cambiar el presupuesto: respondé');
      expect((await pedido(persona, trabajo)).body.solicitud).toMatchObject({ soy: 'elegido', precioAnterior: 100000, precioNuevo: 60000 });
      expect((await pedido(cliente, trabajo)).body.solicitud.soy).toBe('cliente');
      const ajeno: any = await crearUsuario({ role: 'doer' });
      expect((await pedido(ajeno, trabajo)).body.solicitud).toBeNull();
      expect((await responder(ajeno, trabajo, true)).status).toBe(403);
      // El trabajo que ve cualquiera no cuenta quién ni por cuánto.
      const publico = await request(app).get(`/api/jobs/${trabajo.id}`);
      expect(JSON.stringify(publico.body)).not.toMatch(/budgetChangeRequest/);
      // Y no se puede apilar otro pedido.
      expect((await cambiar(cliente, trabajo, 50000)).body.code).toBe('CAMBIO_ESPERANDO_RESPUESTA');
    });

    it('si no acepta, todo sigue como estaba y quien publicó se entera', async () => {
      const { cliente, trabajo } = await armar();
      const { persona, contrato } = await elegir(cliente, trabajo, 100000);
      await cambiar(cliente, trabajo, 60000);
      expect((await responder(persona, trabajo, false)).status).toBe(200);
      expect(Number((await contratoAhora(contrato)).price)).toBe(100000);
      expect(await plata(cliente)).toEqual({ saldo: 0, asientos: 0 });
      expect(await avisos(cliente)).toContain('No aceptaron el cambio de presupuesto');
      expect((await pedido(cliente, trabajo)).body.solicitud).toBeNull();
    });

    it('al aceptar una baja cambian el contrato y el trabajo, la comisión cobrada no se toca y lo a favor es uno solo', async () => {
      const { cliente, trabajo } = await armar();
      const { persona, contrato } = await elegir(cliente, trabajo, 100000);
      await cambiar(cliente, trabajo, 60000);
      expect((await responder(persona, trabajo, true)).status).toBe(200);
      const k = await contratoAhora(contrato);
      expect([Number(k.price), Number(k.commission), Number(k.totalPrice)]).toEqual([60000, 5000, 65000]);
      expect(await precio(trabajo)).toBe(60000);
      expect(await plata(cliente)).toEqual({ saldo: 40000, asientos: 1 });
      expect((await saldoRetirable(cliente.id, 40000)).disponible).toBe(0);
      expect((await responder(persona, trabajo, true)).status).toBe(409);
      expect(await plata(cliente)).toEqual({ saldo: 40000, asientos: 1 });
    });

    it('con dos elegidos cambia recién cuando aceptan los dos, en la misma proporción, y quienes esperaban se quitan', async () => {
      const { cliente, trabajo } = await armar({ maxWorkers: 3 });
      const a = await elegir(cliente, trabajo, 40000, { allocatedAmount: 40000 });
      const b = await elegir(cliente, trabajo, 40000, { allocatedAmount: 40000 });
      const esperando = await postular(trabajo);
      await cambiar(cliente, trabajo, 50000);
      await responder(a.persona, trabajo, true);
      expect(await precio(trabajo)).toBe(100000);
      await responder(b.persona, trabajo, true);
      expect(await precio(trabajo)).toBe(50000);
      expect([Number((await contratoAhora(a.contrato)).price), Number((await contratoAhora(b.contrato)).allocatedAmount)]).toEqual([20000, 20000]);
      expect(((await conSistema(() => Proposal.findByPk(esperando.postulacion.id))) as any).status).toBe('cancelled');
      expect(await plata(cliente)).toEqual({ saldo: 50000, asientos: 1 });
    });

    it('una suba aceptada con saldo suficiente se aplica en el momento y descuenta una sola vez', async () => {
      const { cliente, trabajo } = await armar();
      const { persona, contrato } = await elegir(cliente, trabajo, 100000);
      await conSistema(() => acreditarSaldo(cliente.id, 500000, 'Saldo de la prueba', { tipo: 'bonus' }));
      await cambiar(cliente, trabajo, 120000);
      await responder(persona, trabajo, true);
      expect(Number((await contratoAhora(contrato)).price)).toBe(120000);
      expect(await precio(trabajo)).toBe(120000);
      expect((await plata(cliente)).saldo).toBeLessThanOrEqual(480000);
      expect((await plata(cliente)).asientos).toBe(2);
    });

    it('una suba aceptada sin saldo espera el pago: el trabajo en curso NO se pausa y el contrato cambia al pagarse', async () => {
      const { cliente, trabajo } = await armar({ status: 'in_progress', startDate: enMinutos(-60), endDate: enDias(2) });
      const { persona, contrato } = await elegir(cliente, trabajo, 100000, { status: 'in_progress' });
      await cambiar(cliente, trabajo, 130000);
      await responder(persona, trabajo, true);
      let t = await trabajoAhora(trabajo);
      expect([t.status, Number(t.price), Number(t.pendingNewPrice)]).toEqual(['in_progress', 100000, 130000]);
      expect(Number((await contratoAhora(contrato)).price)).toBe(100000);
      const pago: any = await conSistema(() => Payment.create({ payerId: cliente.id, amount: Number(t.pendingPaymentAmount), currency: 'ARS', status: 'completed', paymentType: 'budget_increase', paymentMethod: 'mercadopago', jobId: trabajo.id } as any));
      await conSistema(() => Job.update({ publicationPaymentId: pago.id } as any, { where: { id: trabajo.id } as any }));
      await conSistema(() => aplicarAumentoDePrecio(pago, 'admin', cliente.id));
      t = await trabajoAhora(trabajo);
      expect([t.status, Number(t.price)]).toEqual(['in_progress', 130000]);
      expect(Number((await contratoAhora(contrato)).price)).toBe(130000);
    });

    it('con varios elegidos, una suba que se paga después actualiza también el reparto guardado en el trabajo', async () => {
      const { cliente, trabajo } = await armar({ maxWorkers: 2 });
      const a = await elegir(cliente, trabajo, 50000, { allocatedAmount: 50000 });
      const b = await elegir(cliente, trabajo, 50000, { allocatedAmount: 50000 });
      const t0 = await trabajoAhora(trabajo);
      await conSistema(() => t0.update({ workerAllocations: [a, b].map((x) => ({ workerId: x.persona.id, allocatedAmount: 50000, percentage: 50, allocatedAt: new Date() })) }));
      await cambiar(cliente, trabajo, 140000);
      await responder(a.persona, trabajo, true);
      await responder(b.persona, trabajo, true);
      let t = await trabajoAhora(trabajo);
      const pago: any = await conSistema(() => Payment.create({ payerId: cliente.id, amount: Number(t.pendingPaymentAmount), currency: 'ARS', status: 'completed', paymentType: 'budget_increase', paymentMethod: 'mercadopago', jobId: trabajo.id } as any));
      await conSistema(() => Job.update({ publicationPaymentId: pago.id } as any, { where: { id: trabajo.id } as any }));
      await conSistema(() => aplicarAumentoDePrecio(pago, 'admin', cliente.id));
      t = await trabajoAhora(trabajo);
      expect([Number(t.price), t.workerAllocations.map((x: any) => Number(x.allocatedAmount))]).toEqual([140000, [70000, 70000]]);
      expect(Number((await contratoAhora(b.contrato)).price)).toBe(70000);
    });

    it.each([['awaiting_confirmation'], ['completed'], ['disputed']])('con el contrato en %s ya no se cambia', async (status) => {
      const { cliente, trabajo } = await armar();
      await elegir(cliente, trabajo, 100000, { status });
      expect((await cambiar(cliente, trabajo, 60000)).body.code).toBe('EL_TRABAJO_SE_ESTA_CERRANDO');
    });

    it('un pedido sin responder se vence solo cuando el trabajo se cierra, y ya no se puede aceptar', async () => {
      const { cliente, trabajo } = await armar();
      const { persona, contrato } = await elegir(cliente, trabajo, 100000);
      await cambiar(cliente, trabajo, 60000);
      await conSistema(() => Contract.update({ status: 'awaiting_confirmation' } as any, { where: { id: contrato.id } as any }));
      expect(await conSistema(() => vencerPedidosDeCambio())).toBeGreaterThanOrEqual(1);
      expect((await responder(persona, trabajo, true)).body.code).toBe('SIN_PEDIDO');
      expect(await plata(cliente)).toEqual({ saldo: 0, asientos: 0 });
      expect(await avisos(cliente)).toContain('El cambio de presupuesto quedó sin efecto');
    });

    it('quien publicó puede retirar el pedido', async () => {
      const { cliente, trabajo } = await armar();
      const { persona } = await elegir(cliente, trabajo, 100000);
      await cambiar(cliente, trabajo, 60000);
      expect((await request(app).delete(`/api/jobs/${trabajo.id}/budget/solicitud`).set(con(cliente))).status).toBe(200);
      expect((await responder(persona, trabajo, true)).body.code).toBe('SIN_PEDIDO');
    });

    it('tampoco se cambian las fechas desde el trabajo', async () => {
      const { cliente, trabajo } = await armar();
      await elegir(cliente, trabajo, 100000);
      const r = await request(app).put(`/api/jobs/${trabajo.id}`).set(con(cliente)).send({ startDate: enDias(8).toISOString(), endDate: enDias(9).toISOString() });
      expect([r.status, r.body.code]).toEqual([409, 'FECHAS_ACORDADAS_EN_EL_CONTRATO']);
    });
  });

  describe('una sola puerta', () => {
    it('editar una publicación pagada no cambia su precio', async () => {
      const { cliente, trabajo } = await armar();
      const r = await request(app).put(`/api/jobs/${trabajo.id}`).set(con(cliente)).send({ price: 60000, endDate: new Date(trabajo.endDate).toISOString() });
      expect([r.status, r.body.code]).toEqual([409, 'USAR_CAMBIAR_PRESUPUESTO']);
      expect(await plata(cliente)).toEqual({ saldo: 0, asientos: 0 });
    });

    it('las rutas viejas que cambiaban montos están cerradas y no mueven nada', async () => {
      const { cliente, trabajo } = await armar();
      const { contrato } = await elegir(cliente, trabajo, 100000);
      const pedidos = [
        request(app).put(`/api/contracts/${contrato.id}/modify-price`).set(con(cliente)).send({ newPrice: 100, reason: MOTIVO }),
        request(app).post(`/api/contracts/${contrato.id}/request-price-change`).set(con(cliente)).send({ newPrice: 100, reason: MOTIVO }),
        request(app).post(`/api/contracts/${contrato.id}/approve-price-change`).set(con(cliente)).send({ approved: true }),
        request(app).put(`/api/jobs/${trabajo.id}/worker-allocations`).set(con(cliente)).send({ allocations: [] }),
        request(app).delete(`/api/jobs/${trabajo.id}/workers/${contrato.doerId}`).set(con(cliente)),
        request(app).post(`/api/jobs/${trabajo.id}/accept-price-decrease`).set(con(cliente)).send({}),
      ];
      for (const r of await Promise.all(pedidos)) expect(r.status).toBe(410);
      expect(Number((await contratoAhora(contrato)).price)).toBe(100000);
      expect(await plata(cliente)).toEqual({ saldo: 0, asientos: 0 });
    });

    it('si el precio sube después de crear el pago y ese pago se paga, se publica por lo que se pagó', async () => {
      const { cliente, trabajo } = await armar({ status: 'pending_payment', publicationPaid: false });
      await pagarLaPublicacion(trabajo, { status: 'pending', paymentMethod: 'mercadopago', approvedAt: null, metadata: { precioDelTrabajo: 100000 } });
      expect((await cambiar(cliente, trabajo, 900000, false)).status).toBe(200);
      const j = await trabajoAhora(trabajo);
      j.publicationPaid = true;
      j.status = 'open';
      await conSistema(() => j.save());
      expect(await precio(trabajo)).toBe(100000);
    });
  });

  it('la revisión encuentra un saldo acreditado sin pago detrás, y no marca una baja legítima', async () => {
    const falso: any = await armar({ status: 'draft', publicationPaid: false });
    await conSistema(() => BalanceTransaction.create({ userId: falso.cliente.id, type: 'refund', amount: 99000, balanceBefore: 0, balanceAfter: 99000, status: 'completed', description: 'Saldo a favor por bajar el precio', metadata: { reason: 'price_decrease', relatedModel: 'Job', relatedId: falso.trabajo.id } } as any));
    const real: any = await armar();
    expect((await cambiar(real.cliente, real.trabajo, 80000)).status).toBe(200);
    const personas = (await bajasSinPago()).map((c) => String(c.persona));
    expect(personas).toContain(String(falso.cliente.id));
    expect(personas).not.toContain(String(real.cliente.id));
  });
});
