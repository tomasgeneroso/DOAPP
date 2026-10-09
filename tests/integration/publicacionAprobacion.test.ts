import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Publicación pagada: en esta etapa la aprueba un administrador antes de que se vea.
 *
 * Antes, capture-order abría el trabajo apenas se confirmaba el pago (status "open"). El ciclo documentado y todo el
 * panel de administración (aprobar, rechazar y devolver el pago) esperan "pendiente de aprobación" después de pagar.
 * Ahora queda en revisión, se avisa a administración y el cliente ve que su pago llegó; el módulo
 * «Aprobación de publicaciones pagadas» (encendido por defecto) lo apaga el owner cuando ya no haga falta.
 */

const mockObtenerPago = jest.fn<(...a: unknown[]) => Promise<unknown>>();
jest.mock('../../server/services/mercadopago.js', () => ({
  __esModule: true,
  default: {
    createPayment: async () => ({ paymentId: 'pref-x', checkoutUrl: 'https://mp.test/checkout' }),
    getPayment: (...a: unknown[]) => mockObtenerPago(...a),
  },
}));
jest.mock('../../server/services/currencyExchange.js', () => ({
  __esModule: true,
  describirCotizacion: (q: unknown) => q,
  default: {
    convertEURtoARS: async (n: number) => n * 3000,
    getEURtoARSRate: async () => 3000,
    getQuotedEURRate: async () => ({ rate: 3000 }),
    getUSDtoARSRate: async () => 1000,
    convertUSDtoARS: async (n: number) => n * 1000,
  },
}));
jest.mock('../../server/index.js', () => ({
  __esModule: true,
  socketService: new Proxy({}, { get: () => () => undefined }),
}));
jest.mock('node-cron', () => ({ __esModule: true, default: { schedule: () => undefined } }));
jest.mock('../../server/services/email.js', () => ({
  __esModule: true,
  default: new Proxy({}, { get: () => async () => true }),
}));

import { Job } from '../../server/models/sql/Job.model.js';
import { User } from '../../server/models/sql/User.model.js';
import { Payment } from '../../server/models/sql/Payment.model.js';
import { Notification } from '../../server/models/sql/Notification.model.js';
import { ModuleConfig } from '../../server/models/sql/ModuleConfig.model.js';
import { olvidarModulos } from '../../server/services/moduleFlags.js';
import { MODULO_APROBACION_DE_PUBLICACIONES } from '../../shared/constants/modulos.js';
import { crearUsuario, crearTrabajo } from '../helpers/fixtures.js';

describe('publicación pagada: queda pendiente de aprobación', () => {
  let app: Express;
  let cliente: any, admin: any;
  const jobs: string[] = [];
  let idMp = 7_000_000;
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });

  /** Un trabajo esperando el pago de su publicación y su pago pendiente, listos para confirmar. */
  const armar = async () => {
    const trabajo: any = await crearTrabajo(cliente.id, { status: 'pending_payment', price: 10000 });
    jobs.push(trabajo.id);
    const pref = `pref-aprob-${trabajo.id.slice(0, 8)}`;
    const pago: any = await Payment.create({
      payerId: cliente.id, recipientId: null, contractId: null, amount: 10000, currency: 'ARS', status: 'pending',
      paymentType: 'job_publication', mercadopagoPreferenceId: pref, description: 'Publicación de prueba',
      platformFee: 0, platformFeePercentage: 0, isEscrow: false,
    } as any);
    await trabajo.update({ publicationPaymentId: pago.id });
    return { trabajo, pago, pref };
  };
  const aprobado = () => ({ status: 'approved', status_detail: 'accredited', transaction_amount: 10000, currency_id: 'ARS', metadata: {} });
  const capturar = (pref: string) =>
    request(app).post('/api/payments/capture-order').set(con(cliente)).send({ preference_id: pref, paymentId: String(++idMp) });
  const estadoDe = async (id: string) => ((await Job.findByPk(id)) as any).status as string;
  const apagarModulo = async () => {
    await ModuleConfig.upsert({ moduleId: MODULO_APROBACION_DE_PUBLICACIONES, category: 'feature', name: 'Aprobación', description: 'x', isActive: false } as any);
    olvidarModulos();
  };

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/payments', (await import('../../server/routes/payments.js')).default);
    app.use('/api/admin/jobs', (await import('../../server/routes/admin/jobs.js')).default);
    cliente = await crearUsuario({ role: 'client' });
    admin = await crearUsuario({ role: 'admin', adminRole: 'admin' });
  });

  beforeEach(async () => {
    await ModuleConfig.destroy({ where: { moduleId: MODULO_APROBACION_DE_PUBLICACIONES } });
    olvidarModulos();
    mockObtenerPago.mockReset();
    mockObtenerPago.mockResolvedValue(aprobado());
  });

  afterEach(async () => {
    await Notification.destroy({ where: { recipientId: [cliente.id, admin.id] } });
  });

  afterAll(async () => {
    try {
      await ModuleConfig.destroy({ where: { moduleId: MODULO_APROBACION_DE_PUBLICACIONES } });
      olvidarModulos();
      await Payment.destroy({ where: { payerId: cliente.id } });
      await Job.destroy({ where: { id: jobs }, force: true });
      await User.destroy({ where: { id: [cliente.id, admin.id] }, force: true });
    } catch { /* ok */ }
  });

  it('con el pago confirmado, el trabajo queda PENDIENTE DE APROBACIÓN (no se abre solo) y figura pagado', async () => {
    const { trabajo, pago, pref } = await armar();

    const r = await capturar(pref);

    expect(r.status).toBe(200);
    expect(r.body.data.jobPublished).toBe(false);
    expect(r.body.data.jobPendingApproval).toBe(true);
    const t: any = await Job.findByPk(trabajo.id);
    expect(t.status).toBe('pending_approval');
    expect(t.publicationPaid).toBe(true);
    expect(((await Payment.findByPk(pago.id)) as any).status).toBe('completed');
  });

  it('el cliente recibe un aviso de que el pago llegó y está en revisión, y administración recibe el aviso de aprobar', async () => {
    const { pref } = await armar();
    await capturar(pref);

    const alCliente = await Notification.findAll({ where: { recipientId: cliente.id } });
    expect(alCliente.map((n: any) => n.title)).toContain('Pago recibido: tu publicación está en revisión');
    expect(alCliente.map((n: any) => n.title)).not.toContain('Trabajo publicado');

    const alAdmin = await Notification.findAll({ where: { recipientId: admin.id } });
    expect(alAdmin.map((n: any) => n.title)).toContain('Publicación pagada para aprobar');
  });

  it('el administrador la aprueba desde el panel y recién ahí queda abierta', async () => {
    const { trabajo, pref } = await armar();
    await capturar(pref);
    expect(await estadoDe(trabajo.id)).toBe('pending_approval');

    const r = await request(app).put(`/api/admin/jobs/${trabajo.id}/status`).set(con(admin)).send({ status: 'approved' });

    expect(r.status).toBe(200);
    expect(await estadoDe(trabajo.id)).toBe('open');
  });

  it('repetir la confirmación (recargar la página de éxito) no rehace nada y responde que sigue en revisión', async () => {
    const { trabajo, pref } = await armar();
    await capturar(pref);
    await Notification.destroy({ where: { recipientId: [cliente.id, admin.id] } });

    const otra = await capturar(pref);

    expect(otra.status).toBe(200);
    expect(otra.body.data.alreadyProcessed).toBe(true);
    expect(otra.body.data.jobPendingApproval).toBe(true);
    expect(otra.body.data.jobPublished).toBe(false);
    expect(await estadoDe(trabajo.id)).toBe('pending_approval');
    expect(await Notification.count({ where: { recipientId: [cliente.id, admin.id] } })).toBe(0);
  });

  it('con el módulo «Aprobación de publicaciones pagadas» APAGADO se publica apenas se confirma el pago', async () => {
    await apagarModulo();
    const { trabajo, pref } = await armar();

    const r = await capturar(pref);

    expect(r.status).toBe(200);
    expect(r.body.data.jobPublished).toBe(true);
    expect(r.body.data.jobPendingApproval).toBe(false);
    expect(await estadoDe(trabajo.id)).toBe('open');
    const titulos = (await Notification.findAll({ where: { recipientId: cliente.id } })).map((n: any) => n.title);
    expect(titulos).toContain('Trabajo publicado');
  });

  it('un pago rechazado por MercadoPago no deja nada pendiente de aprobación', async () => {
    const { trabajo, pref } = await armar();
    mockObtenerPago.mockResolvedValue({ ...aprobado(), status: 'rejected' });

    const r = await capturar(pref);

    expect(r.status).toBe(409);
    expect(await estadoDe(trabajo.id)).toBe('pending_payment');
    expect(await Notification.count({ where: { recipientId: admin.id } })).toBe(0);
  });
});
