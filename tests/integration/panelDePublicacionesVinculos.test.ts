import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * El panel de publicaciones: buscar con CUALQUIER id vinculado y ver estado final, contrato y pago (regla del dueño, 2026-11-09).
 *
 * «Desde el panel de publicación podría buscar la publicación o el pago con cualquiera de los ID vinculados, del trabajador, cliente, pago, contrato, publicación,
 * retiro, etc.; para esto la vinculación de todo debe ser perfecta.» Se arma UNA publicación con todo lo que le cuelga y se busca por cada id: entero, el principio
 * y el final (las pantallas muestran unos ids con los primeros 8 caracteres y otros con los últimos 8).
 *
 * Base de pruebas real; nada sale a la red.
 */
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));

import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { Contract } from '../../server/models/sql/Contract.model.js';
import { Payment } from '../../server/models/sql/Payment.model.js';
import { Proposal } from '../../server/models/sql/Proposal.model.js';
import { WithdrawalRequest } from '../../server/models/sql/WithdrawalRequest.model.js';
import { BalanceTransaction } from '../../server/models/sql/BalanceTransaction.model.js';
import { Dispute } from '../../server/models/sql/Dispute.model.js';
import { conSistema } from '../../server/db/contextoRls.js';
import { crearUsuario, crearTrabajo, crearContrato, crearDisputa } from '../helpers/fixtures.js';

describe('panel de publicaciones: una fila por publicación, buscable por cualquier id', () => {
  let app: Express;
  let cliente: any, trabajador: any, ajeno: any, admin: any, soporte: any;
  let trabajo: any, otroTrabajo: any, contrato: any, pagoPub: any, pagoCotizacion: any, propuesta: any, retiro: any, movimiento: any, disputa: any;
  const creados = { pagos: [] as string[], contratos: [] as string[], jobs: [] as string[], propuestas: [] as string[] };
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });

  const panel = async (q: string, quien = admin, extra = '') => {
    const r = await request(app).get(`/api/admin/jobs/panel?q=${encodeURIComponent(q)}${extra}`).set(con(quien));
    if (r.status !== 200) throw new Error(`GET /panel?q=… → ${r.status} ${JSON.stringify(r.body)}`);
    return r.body as { data: any[]; resumen: Record<string, number>; total: number; buscado: string | null };
  };
  const fila = async (q: string, quien = admin) => (await panel(q, quien)).data.find((f) => f.id === String(trabajo.id));

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/admin/jobs', (await import('../../server/routes/admin/jobs.js')).default);
    cliente = await crearUsuario({ role: 'client', name: 'Clienta Panel Única' });
    trabajador = await crearUsuario({ role: 'doer', name: 'Trabajador Panel Único' });
    ajeno = await crearUsuario({ role: 'client' });
    admin = await crearUsuario({ role: 'admin', adminRole: 'admin' });
    soporte = await crearUsuario({ role: 'admin', adminRole: 'support' });

    pagoPub = await Payment.create({
      payerId: cliente.id, amount: 11_000, amountArs: 11_000, currency: 'ARS', status: 'completed', paymentType: 'job_publication', paymentMethod: 'bank_transfer', platformFee: 0, platformFeePercentage: 0,
    } as any);
    creados.pagos.push(pagoPub.id);
    trabajo = await crearTrabajo(cliente.id, { status: 'in_progress', title: 'Pintar la fachada del panel', publicationPaid: true, publicationPaymentId: pagoPub.id, maxWorkers: 1 });
    creados.jobs.push(trabajo.id);
    otroTrabajo = await crearTrabajo(ajeno.id, { status: 'open', title: 'Otra publicación distinta' });
    creados.jobs.push(otroTrabajo.id);
    propuesta = await Proposal.create({ jobId: trabajo.id, freelancerId: trabajador.id, clientId: cliente.id, coverLetter: 'Hola', proposedPrice: 10_000, estimatedDuration: 2, status: 'approved' } as any);
    creados.propuestas.push(propuesta.id);
    contrato = await crearContrato({ jobId: trabajo.id, clientId: cliente.id, doerId: trabajador.id }, { status: 'in_progress', paymentStatus: 'escrow' });
    creados.contratos.push(contrato.id);
    // Una cotización pagada que quedó SUELTA (sin contract_id ni job_id explícito): solo recuerda su propuesta.
    pagoCotizacion = await Payment.create({
      payerId: cliente.id, amount: 5000, amountArs: 5000, currency: 'ARS', status: 'verified', paymentType: 'contract_payment', paymentMethod: 'bank_transfer', platformFee: 0, platformFeePercentage: 0,
      metadata: { tipo: 'aceptacion_cotizacion', proposalId: propuesta.id },
    } as any);
    creados.pagos.push(pagoCotizacion.id);
    retiro = await conSistema(() =>
      WithdrawalRequest.create({
        userId: trabajador.id, amount: 1500, bankingInfo: { accountHolder: 'Trabajador', bankName: 'Mercado Pago', cbu: '0'.repeat(22), accountType: 'savings' }, status: 'pending',
        balanceBeforeWithdrawal: 1500, balanceAfterWithdrawal: 0, metadata: {},
      } as any),
    );
    movimiento = await BalanceTransaction.create({
      userId: trabajador.id, type: 'payment', amount: 500, balanceBefore: 0, balanceAfter: 500, description: 'Pago por contrato', status: 'completed', relatedContractId: contrato.id,
    } as any);
    disputa = await crearDisputa({ contractId: contrato.id, initiatedBy: cliente.id, against: trabajador.id });
  });

  afterAll(async () => {
    try {
      await conSistema(async () => {
        await Dispute.destroy({ where: { id: disputa.id }, force: true } as any);
        await WithdrawalRequest.destroy({ where: { id: retiro.id }, force: true } as any);
        await BalanceTransaction.destroy({ where: { id: movimiento.id } as any });
        await Proposal.destroy({ where: { id: creados.propuestas }, force: true } as any);
        await Contract.destroy({ where: { id: creados.contratos }, force: true });
        await Job.destroy({ where: { id: creados.jobs }, force: true });
        await Payment.destroy({ where: { id: creados.pagos }, force: true } as any);
        await User.destroy({ where: { id: [cliente.id, trabajador.id, ajeno.id, admin.id, soporte.id] }, force: true });
      });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  it('cada pago sabe de qué trabajo es: el de la publicación y la cotización pagada que solo recordaba su propuesta', async () => {
    expect(String(((await Payment.findByPk(pagoPub.id)) as any).jobId)).toBe(String(trabajo.id));
    expect(String(((await Payment.findByPk(pagoCotizacion.id)) as any).jobId)).toBe(String(trabajo.id));
  });

  describe('buscar con cada id vinculado llega a la publicación (y dice por qué)', () => {
    const casos: Array<[string, () => string, RegExp]> = [
      ['el id de la publicación', () => trabajo.id, /ID de la publicación/],
      ['el id del cliente', () => cliente.id, /cliente/i],
      ['el id del trabajador', () => trabajador.id, /trabajador/i],
      ['el id del contrato', () => contrato.id, /ID del contrato/],
      ['el id del pago de la publicación', () => pagoPub.id, /pago de la publicación/],
      ['el id de la cotización pagada (sin vincular)', () => pagoCotizacion.id, /pago/i],
      ['el id de la propuesta', () => propuesta.id, /propuesta/i],
      ['el id del retiro del trabajador', () => retiro.id, /retiro/i],
      ['el id de un movimiento de saldo del contrato', () => movimiento.id, /movimiento de saldo/],
      ['el id de la disputa del contrato', () => disputa.id, /disputa/],
    ];

    for (const [nombre, id, motivo] of casos) {
      it(`${nombre}: entero`, async () => {
        const f = await fila(id());
        expect(f).toBeDefined();
        expect(f.coincide.join(' | ')).toMatch(motivo);
      });
    }

    it('un pedazo del principio y uno del FINAL del id (las pantallas muestran los últimos 8 de un contrato)', async () => {
      const id = String(contrato.id);
      expect(await fila(id.slice(0, 8))).toBeDefined();
      expect(await fila(id.slice(-8).toUpperCase())).toBeDefined();
      const pago = String(pagoPub.id);
      expect(await fila(pago.slice(0, 8))).toBeDefined();
      expect(await fila(pago.slice(-8))).toBeDefined();
    });

    it('por el título y por el nombre del cliente o del trabajador', async () => {
      expect(await fila('fachada del panel')).toBeDefined();
      expect(await fila('Clienta Panel Única')).toBeDefined();
      expect(await fila('Trabajador Panel Único')).toBeDefined();
    });

    it('un id que no es de nada no trae publicaciones, y una búsqueda muy corta tampoco', async () => {
      expect((await panel('deadbeef-0000-0000')).data).toHaveLength(0);
      expect((await panel('ab')).data).toHaveLength(0);
    });

    it('un id de OTRA persona no arrastra esta publicación', async () => {
      expect(await fila(ajeno.id)).toBeUndefined();
      expect((await panel(ajeno.id)).data.map((f) => f.id)).toContain(String(otroTrabajo.id));
    });

    it('soporte también puede buscar y ve lo mismo (la seguridad por filas no le esconde los contratos ni los pagos)', async () => {
      const f = await fila(pagoPub.id, soporte);
      expect(f).toBeDefined();
      expect(f.contrato.cantidad).toBe(1);
    });
  });

  describe('lo que dice la fila', () => {
    it('trae el estado final, el contrato y el pago, el cliente y el trabajador', async () => {
      const f = await fila(trabajo.id);
      expect(f.estadoFinal).toMatchObject({ clave: 'contrato_en_proceso', rotulo: 'Contrato en proceso' });
      expect(f.contrato).toMatchObject({ clave: 'en_proceso', rotulo: 'En proceso', cantidad: 1, contratoId: String(contrato.id) });
      expect(f.pago).toMatchObject({ clave: 'verificado', rotulo: 'Pago verificado', pagoId: String(pagoPub.id) });
      expect(f.cliente).toMatchObject({ id: String(cliente.id), nombre: 'Clienta Panel Única' });
      expect(f.trabajadores.map((t: any) => t.id)).toEqual([String(trabajador.id)]);
      expect(f.alerta).toBeNull();
    });

    it('una publicación sin pagar dice «Esperando pago»', async () => {
      const f = (await panel(otroTrabajo.id)).data.find((x) => x.id === String(otroTrabajo.id));
      expect(f.estadoFinal.clave).toBe('esperando_pago');
      expect(f.contrato.clave).toBe('sin_contrato');
      expect(f.pago.clave).toBe('sin_pagar');
    });

    it('terminada y con el pago al trabajador pendiente: «Terminada: falta pagar al trabajador»', async () => {
      await contrato.update({ status: 'completed', paymentStatus: 'pending_payout', escrowStatus: 'released' });
      await trabajo.update({ status: 'completed' });
      try {
        const f = await fila(trabajo.id);
        expect(f.estadoFinal.clave).toBe('terminada_falta_pagar');
        expect(f.pago).toMatchObject({ clave: 'falta_pagar_trabajador', detalle: 'Pago verificado' });
      } finally {
        await contrato.update({ status: 'in_progress', paymentStatus: 'escrow', escrowStatus: 'pending' });
        await trabajo.update({ status: 'in_progress' });
      }
    });

    it('el filtro por estado deja solo ese estado y el resumen cuenta todos', async () => {
      const r = await panel(cliente.id, admin, '&estado=contrato_en_proceso');
      expect(r.data.every((f) => f.estadoFinal.clave === 'contrato_en_proceso')).toBe(true);
      expect(r.resumen.contrato_en_proceso).toBeGreaterThanOrEqual(1);
      const ninguna = await panel(cliente.id, admin, '&estado=cancelada');
      expect(ninguna.data).toHaveLength(0);
    });

    it('sin búsqueda trae las publicaciones más nuevas primero', async () => {
      const r = await request(app).get('/api/admin/jobs/panel?limite=50').set(con(admin));
      expect(r.status).toBe(200);
      const fechas = (r.body.data as any[]).map((f) => new Date(f.creadaEl).getTime());
      expect(fechas).toEqual([...fechas].sort((a, b) => b - a));
    });

    it('un usuario común no puede abrir el panel', async () => {
      const r = await request(app).get('/api/admin/jobs/panel').set(con(ajeno));
      expect([401, 403]).toContain(r.status);
    });
  });
});
