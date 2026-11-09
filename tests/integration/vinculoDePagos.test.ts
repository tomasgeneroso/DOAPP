import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Buscar un contrato por su pago, y vincular un pago suelto.
 *
 * Caso real (informe del dueño, 2026-11-09): en «Gestión de contratos» no se podía buscar el contrato de un pago, y un contrato aceptado con un pago
 * figuraba «pendiente de pago» porque el pago no estaba vinculado a él. La búsqueda solo miraba ids de contrato, trabajo, cliente y trabajador, y un
 * contrato puede estar respaldado por el pago de la publicación del trabajo o por una cotización pagada que quedó suelta (sin `contract_id`) si un
 * administrador aprobó el pago ANTES de aprobar el contrato.
 *
 * Base de pruebas real; nada sale a la red.
 */
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));
jest.mock('../../server/services/invoiceService.js', () => ({
  __esModule: true,
  generateClientPaymentInvoice: async () => undefined,
  generateWorkerPaymentInvoice: async () => undefined,
  getUserInvoices: async () => [],
  getInvoiceById: async () => null,
}));

import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { Contract } from '../../server/models/sql/Contract.model.js';
import { Payment } from '../../server/models/sql/Payment.model.js';
import { Proposal } from '../../server/models/sql/Proposal.model.js';
import { PaymentProof } from '../../server/models/sql/PaymentProof.model.js';
import { Notification } from '../../server/models/sql/Notification.model.js';
import { AuditLog } from '../../server/models/sql/AuditLog.model.js';
import { crearUsuario, crearTrabajo, crearContrato } from '../helpers/fixtures.js';
import { contratosDeUnPago, idsDeContratosPorPago, pareceUnIdParcial } from '../../server/services/vinculoDePagos.js';

describe('pareceUnIdParcial', () => {
  it('solo hexadecimales y guiones, de 4 en adelante', () => {
    expect(pareceUnIdParcial('54acb79f')).toBe(true);
    expect(pareceUnIdParcial('54acb79f-e454-4089-b85c-90f4dd5a4bc7')).toBe(true);
    expect(pareceUnIdParcial('abc')).toBe(false);
    expect(pareceUnIdParcial("54ac'; DROP TABLE x;--")).toBe(false);
    expect(pareceUnIdParcial('Pintar el living')).toBe(false);
    expect(pareceUnIdParcial(undefined)).toBe(false);
  });
});

describe('contratos y pagos: buscar y vincular', () => {
  let app: Express;
  let cliente: any, trabajador: any, otro: any, admin: any, otroAdmin: any, dueno: any, comun: any;
  const creados = { pagos: [] as string[], contratos: [] as string[], jobs: [] as string[], propuestas: [] as string[] };
  const ids = () => [cliente, trabajador, otro, admin, otroAdmin, dueno, comun].map((u) => u.id);
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const motivo = 'Comprobé en el banco y en la cotización aceptada que este pago es de este contrato.';

  /** Un trabajo con su contrato (con el cliente y el trabajador de la prueba) y la propuesta que lo originó. */
  const escenario = async (contratoOver: Record<string, unknown> = {}, trabajoOver: Record<string, unknown> = {}) => {
    const trabajo: any = await crearTrabajo(cliente.id, { status: 'in_progress', ...trabajoOver });
    creados.jobs.push(trabajo.id);
    const propuesta: any = await Proposal.create({
      jobId: trabajo.id, freelancerId: trabajador.id, clientId: cliente.id, coverLetter: 'Hola', proposedPrice: 9000, estimatedDuration: 2, status: 'approved',
    } as any);
    creados.propuestas.push(propuesta.id);
    const contrato: any = await crearContrato({ jobId: trabajo.id, clientId: cliente.id, doerId: trabajador.id }, { status: 'accepted', paymentStatus: 'pending', ...contratoOver });
    creados.contratos.push(contrato.id);
    return { trabajo, propuesta, contrato };
  };
  const pago = async (over: Record<string, unknown> = {}) => {
    const p: any = await Payment.create({
      payerId: cliente.id, recipientId: null, amount: 9000, amountArs: 9000, currency: 'ARS', status: 'pending_verification', paymentType: 'contract_payment',
      paymentMethod: 'bank_transfer', platformFee: 0, platformFeePercentage: 0, isEscrow: true, ...over,
    } as any);
    creados.pagos.push(p.id);
    return p;
  };
  /** Una cotización pagada que quedó suelta: sin contrato, con la propuesta en la metadata. */
  const pagoSuelto = async (propuestaId: string, over: Record<string, unknown> = {}) =>
    pago({ metadata: { tipo: 'aceptacion_cotizacion', proposalId: propuestaId }, ...over });

  const buscar = async (q: string) => {
    const r = await request(app).get(`/api/admin/contracts?search=${encodeURIComponent(q)}`).set(con(admin));
    if (r.status !== 200) throw new Error(`GET /api/admin/contracts?search=… → ${r.status} ${JSON.stringify(r.body)}`);
    return (r.body.data as any[]).map((c) => c.id);
  };
  const esperar = async (cond: () => Promise<boolean>, ms = 4000) => {
    const hasta = Date.now() + ms;
    while (Date.now() < hasta) {
      if (await cond()) return true;
      await new Promise((r) => setTimeout(r, 50));
    }
    return false;
  };

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/admin/contracts', (await import('../../server/routes/admin/contracts.js')).default);
    app.use('/api/admin/payments', (await import('../../server/routes/admin/payments.js')).default);
    cliente = await crearUsuario({ role: 'client' });
    trabajador = await crearUsuario({ role: 'doer' });
    otro = await crearUsuario({ role: 'client' });
    admin = await crearUsuario({ role: 'admin', adminRole: 'admin' });
    otroAdmin = await crearUsuario({ role: 'admin', adminRole: 'admin' });
    dueno = await crearUsuario({ role: 'admin', adminRole: 'owner' });
    comun = await crearUsuario({ role: 'client' });
  });

  afterAll(async () => {
    try {
      await AuditLog.destroy({ where: { targetId: creados.pagos } as any });
      await PaymentProof.destroy({ where: { paymentId: creados.pagos } });
      await Notification.destroy({ where: { recipientId: ids() } });
      await Payment.destroy({ where: { id: creados.pagos }, force: true } as any);
      await Contract.destroy({ where: { id: creados.contratos }, force: true });
      await Proposal.destroy({ where: { id: creados.propuestas }, force: true } as any);
      await Job.destroy({ where: { id: creados.jobs }, force: true });
      await User.destroy({ where: { id: ids() }, force: true });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  /* ---------------- buscar un contrato por su pago ---------------- */

  describe('buscar por el id del pago (GET /api/admin/contracts?search=)', () => {
    it('un pago con contract_id: el contrato aparece con el id completo y con un pedazo', async () => {
      const { contrato } = await escenario();
      const p = await pago({ contractId: contrato.id, status: 'held_escrow' });

      expect(await buscar(p.id)).toContain(contrato.id);
      expect(await buscar(p.id.slice(0, 8))).toContain(contrato.id);
    });

    it('el pago de la PUBLICACIÓN del trabajo: aparece el contrato de ese trabajo', async () => {
      const { trabajo, contrato } = await escenario();
      const pub = await pago({ paymentType: 'job_publication', status: 'completed', isEscrow: false });
      await trabajo.update({ publicationPaymentId: pub.id });

      expect(await buscar(pub.id)).toContain(contrato.id);
    });

    it('una cotización pagada que quedó SUELTA (sin contract_id): aparece el contrato que su propuesta identifica', async () => {
      const { propuesta, contrato } = await escenario();
      const p = await pagoSuelto(propuesta.id, { status: 'verified' });
      expect(p.contractId).toBeNull();

      expect(await buscar(p.id)).toContain(contrato.id);
      expect(await buscar(p.id.slice(0, 8))).toContain(contrato.id);
    });

    it('un pago de OTRO cliente con la misma propuesta no arrastra el contrato de este', async () => {
      const { propuesta, contrato } = await escenario();
      const ajeno = await pagoSuelto(propuesta.id, { payerId: otro.id });

      expect(await buscar(ajeno.id)).not.toContain(contrato.id);
    });

    it('un pedazo que no es de ningún pago no trae contratos de más, y un texto con comillas no rompe nada', async () => {
      const { contrato } = await escenario();
      expect(await buscar('deadbeef-0000')).not.toContain(contrato.id);
      const r = await request(app).get(`/api/admin/contracts?search=${encodeURIComponent("54ac'; DROP TABLE contracts;--")}`).set(con(admin));
      expect(r.status).toBe(200);
    });

    it('la búsqueda por el id del contrato, del trabajo, del cliente y del trabajador sigue funcionando', async () => {
      const { trabajo, contrato } = await escenario();
      expect(await buscar(contrato.id)).toContain(contrato.id);
      expect(await buscar(trabajo.id)).toContain(contrato.id);
      expect(await buscar(cliente.id)).toContain(contrato.id);
      expect(await buscar(trabajador.id)).toContain(contrato.id);
    });
  });

  describe('lo que la lista muestra del pago de cada contrato', () => {
    it('un contrato respaldado por la publicación trae `pagoDePublicacion`', async () => {
      const { trabajo, contrato } = await escenario();
      const pub = await pago({ paymentType: 'job_publication', status: 'completed', isEscrow: false });
      await trabajo.update({ publicationPaymentId: pub.id });

      const r = await request(app).get(`/api/admin/contracts?search=${contrato.id}`).set(con(admin));
      const fila = (r.body.data as any[]).find((c) => c.id === contrato.id);
      expect(fila.payment).toBeNull();
      expect(fila.pagoDePublicacion).toMatchObject({ id: pub.id, status: 'completed' });
      expect(fila.pagosSinVincular).toEqual([]);
    });

    it('un contrato con una cotización pagada suelta trae `pagosSinVincular`', async () => {
      const { propuesta, contrato } = await escenario();
      const p = await pagoSuelto(propuesta.id, { status: 'verified' });

      const r = await request(app).get(`/api/admin/contracts?search=${contrato.id}`).set(con(admin));
      const fila = (r.body.data as any[]).find((c) => c.id === contrato.id);
      expect(fila.payment).toBeNull();
      expect(fila.pagosSinVincular.map((x: any) => x.id)).toEqual([p.id]);
    });

    it('un contrato con su pago vinculado lo trae en `payment` y sin sueltos', async () => {
      const { contrato } = await escenario();
      const p = await pago({ contractId: contrato.id, status: 'held_escrow' });

      const r = await request(app).get(`/api/admin/contracts?search=${contrato.id}`).set(con(admin));
      const fila = (r.body.data as any[]).find((c) => c.id === contrato.id);
      expect(fila.payment.id).toBe(p.id);
      expect(fila.pagosSinVincular).toEqual([]);
    });
  });

  /* ---------------- vincular a mano ---------------- */

  describe('POST /api/admin/contracts/:id/link-payment', () => {
    const vincular = (quien: any, contratoId: string, body: Record<string, unknown>) =>
      request(app).post(`/api/admin/contracts/${contratoId}/link-payment`).set(con(quien)).send(body);

    it('vincula el pago suelto, deja de estar suelto, no cambia el estado del pago y queda anotado con severidad alta', async () => {
      const { propuesta, contrato } = await escenario();
      const p = await pagoSuelto(propuesta.id, { status: 'verified' });

      const r = await vincular(admin, contrato.id, { paymentId: p.id, motivo });

      expect(r.status).toBe(200);
      const despues: any = await Payment.findByPk(p.id);
      expect(String(despues.contractId)).toBe(String(contrato.id));
      expect(despues.status).toBe('verified'); // solo vincula: no mueve dinero ni estados
      const fila = (await buscar(p.id)).includes(contrato.id);
      expect(fila).toBe(true);
      const lista = await request(app).get(`/api/admin/contracts?search=${contrato.id}`).set(con(admin));
      const delContrato = (lista.body.data as any[]).find((c) => c.id === contrato.id);
      expect(delContrato.payment.id).toBe(p.id);
      expect(delContrato.pagosSinVincular).toEqual([]);
      let anotada: any = null;
      await esperar(async () => {
        anotada = await AuditLog.findOne({ where: { targetId: p.id, action: 'payment.link_contract' } as any });
        return !!anotada;
      });
      expect(anotada?.severity).toBe('high');
      expect(anotada?.metadata).toMatchObject({ contratoId: contrato.id, motivo });
    });

    it('sin motivo escrito (o muy corto): 400 y el pago no se toca', async () => {
      const { propuesta, contrato } = await escenario();
      const p = await pagoSuelto(propuesta.id);

      for (const corto of [undefined, '', 'ok']) {
        const r = await vincular(admin, contrato.id, { paymentId: p.id, motivo: corto });
        expect(r.status).toBe(400);
        expect(r.body.code).toBe('VINCULO_SIN_MOTIVO');
      }
      expect(((await Payment.findByPk(p.id)) as any).contractId).toBeNull();
    });

    it('ids incompletos: 400', async () => {
      const { contrato } = await escenario();
      const r = await vincular(admin, contrato.id, { paymentId: '54acb79f', motivo });
      expect(r.status).toBe(400);
      expect(r.body.code).toBe('VINCULO_ID_INVALIDO');
    });

    it('un pago de OTRO cliente: 409 y no se vincula', async () => {
      const { contrato } = await escenario();
      const ajeno = await pago({ payerId: otro.id });
      const r = await vincular(admin, contrato.id, { paymentId: ajeno.id, motivo });
      expect(r.status).toBe(409);
      expect(r.body.code).toBe('VINCULO_OTRO_PAGADOR');
      expect(((await Payment.findByPk(ajeno.id)) as any).contractId).toBeNull();
    });

    it('un pago que ya tiene contrato: 409 (no se re-vincula a otro)', async () => {
      const a = await escenario();
      const b = await escenario();
      const p = await pago({ contractId: a.contrato.id });
      const r = await vincular(admin, b.contrato.id, { paymentId: p.id, motivo });
      expect(r.status).toBe(409);
      expect(r.body.code).toBe('VINCULO_PAGO_YA_VINCULADO');
      expect(String(((await Payment.findByPk(p.id)) as any).contractId)).toBe(String(a.contrato.id));
    });

    it('un pago de publicación o rechazado: 409', async () => {
      const { contrato } = await escenario();
      const pub = await pago({ paymentType: 'job_publication', status: 'completed', isEscrow: false });
      const rechazado = await pago({ status: 'rejected' });
      expect((await vincular(admin, contrato.id, { paymentId: pub.id, motivo })).body.code).toBe('VINCULO_TIPO_DE_PAGO');
      expect((await vincular(admin, contrato.id, { paymentId: rechazado.id, motivo })).body.code).toBe('VINCULO_PAGO_NO_VIGENTE');
    });

    it('un contrato cancelado no recibe un pago, y uno que ya tiene otro pago vigente no se financia dos veces', async () => {
      const cancelado = await escenario({ status: 'cancelled' });
      const p1 = await pago();
      expect((await vincular(admin, cancelado.contrato.id, { paymentId: p1.id, motivo })).body.code).toBe('VINCULO_CONTRATO_NO_VIGENTE');

      const financiado = await escenario();
      await pago({ contractId: financiado.contrato.id, status: 'held_escrow' });
      const p2 = await pago();
      const r = await vincular(admin, financiado.contrato.id, { paymentId: p2.id, motivo });
      expect(r.status).toBe(409);
      expect(r.body.code).toBe('VINCULO_CONTRATO_YA_TIENE_PAGO');
    });

    it('dos vínculos a la vez: gana uno solo', async () => {
      const a = await escenario();
      const b = await escenario();
      const p = await pagoSuelto(a.propuesta.id);
      const [r1, r2] = await Promise.all([
        vincular(admin, a.contrato.id, { paymentId: p.id, motivo }),
        vincular(otroAdmin, b.contrato.id, { paymentId: p.id, motivo }),
      ]);
      expect([r1.status, r2.status].filter((s) => s === 200)).toHaveLength(1);
      expect(((await Payment.findByPk(p.id)) as any).contractId).not.toBeNull();
    });

    it('quien es parte del pago no lo vincula (el dueño sí); un usuario común no puede', async () => {
      const { propuesta, contrato } = await escenario();
      const delAdmin = await pagoSuelto(propuesta.id, { payerId: admin.id });
      const r1 = await vincular(admin, contrato.id, { paymentId: delAdmin.id, motivo });
      expect(r1.status).toBe(403);
      expect(r1.body.code).toBe('APROBACION-DE-PAGO-PROPIO');

      const { propuesta: p2, contrato: c2 } = await escenario();
      const p = await pagoSuelto(p2.id);
      const r2 = await vincular(comun, c2.id, { paymentId: p.id, motivo });
      expect(r2.status).toBe(403);
      expect(((await Payment.findByPk(p.id)) as any).contractId).toBeNull();
    });
  });

  /* ---------------- vincular solo al aprobar el pago ---------------- */

  describe('al aprobar el pago (POST /api/admin/payments/:id/approve)', () => {
    const aprobar = (quien: any, id: string) => request(app).post(`/api/admin/payments/${id}/approve`).set(con(quien)).send({});

    it('una cotización pagada se vincula SOLA al único contrato que su propuesta identifica', async () => {
      const { propuesta, contrato } = await escenario();
      const p = await pagoSuelto(propuesta.id);

      const r = await aprobar(admin, p.id);

      expect(r.status).toBe(200);
      const despues: any = await Payment.findByPk(p.id);
      expect(despues.status).toBe('verified');
      expect(String(despues.contractId)).toBe(String(contrato.id));
      expect(await buscar(p.id)).toContain(contrato.id);
      let anotada: any = null;
      await esperar(async () => {
        anotada = await AuditLog.findOne({ where: { targetId: p.id, action: 'payment.link_contract' } as any });
        return !!anotada;
      });
      expect(anotada?.metadata).toMatchObject({ contratoId: contrato.id, via: 'propuesta', automatico: true });
    });

    it('si la propuesta identifica DOS contratos no adivina: el pago queda suelto', async () => {
      const { trabajo, propuesta, contrato } = await escenario();
      const segundo: any = await crearContrato({ jobId: trabajo.id, clientId: cliente.id, doerId: trabajador.id }, { status: 'accepted', paymentStatus: 'pending' });
      creados.contratos.push(segundo.id);
      const p = await pagoSuelto(propuesta.id);

      const r = await aprobar(admin, p.id);

      expect(r.status).toBe(200);
      expect(((await Payment.findByPk(p.id)) as any).contractId).toBeNull();
      expect(contrato.id).not.toBe(segundo.id);
    });

    it('un pago sin propuesta (o de otro tipo) se aprueba como siempre, sin vincular nada', async () => {
      const sinPropuesta = await pago();
      const publicacion = await pago({ paymentType: 'job_publication', isEscrow: false });
      expect((await aprobar(admin, sinPropuesta.id)).status).toBe(200);
      expect((await aprobar(admin, publicacion.id)).status).toBe(200);
      expect(((await Payment.findByPk(sinPropuesta.id)) as any).contractId).toBeNull();
      expect(((await Payment.findByPk(publicacion.id)) as any).contractId).toBeNull();
    });
  });

  describe('contratosDeUnPago (la regla sola)', () => {
    it('junta las tres vías sin repetir', async () => {
      const { trabajo, propuesta, contrato } = await escenario();
      const p = await pago({ contractId: contrato.id, metadata: { proposalId: propuesta.id } });
      await trabajo.update({ publicationPaymentId: p.id });

      const r = await contratosDeUnPago(p as any);

      expect(r).toEqual([{ contratoId: String(contrato.id), via: 'contractId' }]);
      expect(await idsDeContratosPorPago(p.id.slice(0, 8))).toContain(String(contrato.id));
    });
  });
});

/**
 * Las otras búsquedas por un pedazo de id del panel de administración.
 *
 * Usaban `"contracts"."id"` / `"jobs"."id"` adentro de una consulta cuya tabla se llama `"Contract"` / `"Job"`: Postgres contestaba «referencia a la entrada de la
 * cláusula FROM no válida». La lista de contratos devolvía 500 (la pantalla no mostraba nada ni avisaba) y la búsqueda global, la de trabajos y la de usuarios
 * se tragaban el error y simplemente no encontraban el contrato ni el trabajo.
 */
describe('buscar por un pedazo de id en el panel (antes fallaba en silencio)', () => {
  let app: Express;
  let cliente: any, trabajador: any, admin: any;
  const creados = { contratos: [] as string[], jobs: [] as string[] };
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  let trabajo: any, contrato: any;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/admin/jobs', (await import('../../server/routes/admin/jobs.js')).default);
    app.use('/api/admin/search', (await import('../../server/routes/admin/search.js')).default);
    app.use('/api/admin/users', (await import('../../server/routes/admin/users.js')).default);
    cliente = await crearUsuario({ role: 'client' });
    trabajador = await crearUsuario({ role: 'doer' });
    admin = await crearUsuario({ role: 'admin', adminRole: 'admin' });
    trabajo = await crearTrabajo(cliente.id, { status: 'in_progress' });
    creados.jobs.push(trabajo.id);
    contrato = await crearContrato({ jobId: trabajo.id, clientId: cliente.id, doerId: trabajador.id }, { status: 'accepted' });
    creados.contratos.push(contrato.id);
  });

  afterAll(async () => {
    try {
      await Contract.destroy({ where: { id: creados.contratos }, force: true });
      await Job.destroy({ where: { id: creados.jobs }, force: true });
      await User.destroy({ where: { id: [cliente.id, trabajador.id, admin.id] }, force: true });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  it('la lista de trabajos encuentra un trabajo por un pedazo de su id y por el id de su contrato', async () => {
    for (const q of [String(trabajo.id).slice(0, 8), String(contrato.id).slice(0, 8)]) {
      const r = await request(app).get(`/api/admin/jobs?search=${q}`).set(con(admin));
      expect(r.status).toBe(200);
      expect(JSON.stringify(r.body)).toContain(String(trabajo.id));
    }
  });

  it('la búsqueda global encuentra el contrato por un id completo', async () => {
    const r = await request(app).get(`/api/admin/search?id=${contrato.id}`).set(con(admin));
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.body)).toContain(String(contrato.id));
  });

  it('la búsqueda global encuentra un pago, un trabajo y una persona por su id', async () => {
    const pago: any = await Payment.create({
      payerId: cliente.id, amount: 5000, amountArs: 5000, currency: 'ARS', status: 'completed', paymentType: 'job_publication', paymentMethod: 'bank_transfer',
      platformFee: 0, platformFeePercentage: 0,
    } as any);
    try {
      const porPago = await request(app).get(`/api/admin/search?id=${pago.id}`).set(con(admin));
      expect(porPago.status).toBe(200);
      expect(JSON.stringify(porPago.body.data.payments)).toContain(String(pago.id));

      const porTrabajo = await request(app).get(`/api/admin/search?id=${trabajo.id}`).set(con(admin));
      expect(porTrabajo.body.data.job?.id).toBe(String(trabajo.id));

      const porPersona = await request(app).get(`/api/admin/search?id=${cliente.id}`).set(con(admin));
      expect(JSON.stringify(porPersona.body.data.users)).toContain(String(cliente.id));
    } finally {
      await Payment.destroy({ where: { id: pago.id }, force: true } as any);
    }
  });

  it('la lista de usuarios encuentra al cliente y al trabajador por un pedazo del id de su contrato', async () => {
    const r = await request(app).get(`/api/admin/users?search=${String(contrato.id).slice(0, 8)}`).set(con(admin));
    expect(r.status).toBe(200);
    const texto = JSON.stringify(r.body);
    expect(texto).toContain(String(cliente.id));
    expect(texto).toContain(String(trabajador.id));
  });
});
