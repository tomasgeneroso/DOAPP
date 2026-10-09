import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * F1: POST /api/payments/capture-order daba el pago por aprobado sin que MercadoPago lo confirmara.
 *
 * Tres caminos terminaban igual (publicar, activar la membresía o dejar plata en escrow sin haber
 * pagado): que el navegador no mandara el id del pago, que MercadoPago no respondiera ("si no puedo
 * verificar, supongo que salió bien") y que el pago figurara "pendiente". Además un pago ya reembolsado
 * o en disputa volvía a escrow al repetir la confirmación, y la descripción —que escribe quien paga—
 * decidía si el pago activaba una membresía.
 *
 * Todo con el servidor real y la base de pruebas; MercadoPago es un simulacro, no sale nada a la red.
 * Cada caso de "no" comprueba lo mismo: nada se activó y el pago quedó donde correspondía.
 */

const PRECIO_ARS = 21000;

const mockObtenerPago = jest.fn<(...args: unknown[]) => Promise<unknown>>();
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
jest.mock('../../server/index.js', () => ({ __esModule: true, socketService: {} }));
jest.mock('node-cron', () => ({ __esModule: true, default: { schedule: () => undefined } }));
jest.mock('../../server/services/email.js', () => ({
  __esModule: true,
  default: { sendEmail: async () => true },
}));

import { User } from '../../server/models/sql/User.model.js';
import { Membership } from '../../server/models/sql/Membership.model.js';
import { Payment } from '../../server/models/sql/Payment.model.js';
import { Notification } from '../../server/models/sql/Notification.model.js';

describe('POST /api/payments/capture-order: sólo se da por pagado lo que MercadoPago confirma', () => {
  let app: Express;
  const usuarios: Record<string, { id: string; token: string }> = {};
  const emails: string[] = [];
  let contadorPref = 0;
  let contadorIdMp = 9_000_000;

  const crearUsuario = async (clave: string) => {
    const email = `${clave}@captura.test`;
    emails.push(email);
    const u: any = await User.create({
      email,
      name: `Persona ${clave}`,
      username: `cap${clave}`,
      password: 'password123',
      role: 'doer',
    } as any);
    usuarios[clave] = { id: u.id, token: jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret') };
  };
  const como = (clave: string) => ({ Authorization: `Bearer ${usuarios[clave].token}` });

  const crearPago = async (clave: string, extra: Record<string, unknown> = {}) => {
    const pref = `pref-captura-${++contadorPref}`;
    const p: any = await Payment.create({
      payerId: usuarios[clave].id,
      recipientId: null,
      contractId: null,
      amount: PRECIO_ARS,
      currency: 'ARS',
      status: 'pending',
      paymentType: 'membership',
      mercadopagoPreferenceId: pref,
      description: 'Membresía DOAPP PRO - Mensual',
      platformFee: 0,
      platformFeePercentage: 0,
      isEscrow: false,
      ...extra,
    } as any);
    return { id: p.id as string, pref };
  };

  const capturar = (clave: string, pref: string, body: Record<string, unknown> = {}) =>
    request(app).post('/api/payments/capture-order').set(como(clave)).send({ preference_id: pref, ...body });

  const aprobado = (extra: Record<string, unknown> = {}) => ({
    status: 'approved',
    status_detail: 'accredited',
    transaction_amount: PRECIO_ARS,
    currency_id: 'ARS',
    metadata: {},
    ...extra,
  });

  const estadoDe = async (id: string) => (await Payment.findByPk(id) as any).status as string;
  const esPro = async (clave: string) => (await User.findByPk(usuarios[clave].id) as any).membershipTier === 'pro';
  const tieneMembresia = async (clave: string) => (await Membership.count({ where: { userId: usuarios[clave].id } })) > 0;
  /** Nada se activó: ni el plan del usuario ni la fila de membresía. */
  const nadaSeActivo = async (clave: string) => {
    expect(await esPro(clave)).toBe(false);
    expect(await tieneMembresia(clave)).toBe(false);
  };

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    const pagos = await import('../../server/routes/payments.js');
    app.use('/api/payments', pagos.default);
    await User.destroy({ where: { email: ['pagador@captura.test', 'otro@captura.test'] } });
    await crearUsuario('pagador');
    await crearUsuario('otro');
  });

  afterAll(async () => {
    const ids = Object.values(usuarios).map((u) => u.id);
    await Notification.destroy({ where: { recipientId: ids } });
    await Membership.destroy({ where: { userId: ids } });
    await Payment.destroy({ where: { payerId: ids } });
    await User.destroy({ where: { email: emails } });
  });

  beforeEach(async () => {
    mockObtenerPago.mockReset();
    mockObtenerPago.mockResolvedValue(aprobado());
    const ids = Object.values(usuarios).map((u) => u.id);
    await Notification.destroy({ where: { recipientId: ids } });
    await Membership.destroy({ where: { userId: ids } });
    await Payment.destroy({ where: { payerId: ids } });
    await User.update({ hasMembership: false, membershipTier: 'free' } as any, { where: { id: ids } });
  });

  /* ---------------- el "sí" ---------------- */

  it('un pago aprobado, por el monto y la moneda esperados, se completa y activa lo que compra', async () => {
    const { id, pref } = await crearPago('pagador');
    const idMp = String(++contadorIdMp);

    const r = await capturar('pagador', pref, { paymentId: idMp });
    expect(r.status).toBe(200);
    expect(r.body.data.membershipActivated).toBe(true);
    expect(await estadoDe(id)).toBe('completed');
    expect(((await Payment.findByPk(id)) as any).mercadopagoPaymentId).toBe(idMp);
    expect(await esPro('pagador')).toBe(true);
    expect(mockObtenerPago).toHaveBeenCalledWith(idMp, 'mercadopago');
  });

  /* ---------------- los "no" de F1 ---------------- */

  it('sin id de pago de MercadoPago no hay nada que verificar: NO se da por pagado', async () => {
    const { id, pref } = await crearPago('pagador');

    const r = await capturar('pagador', pref); // sólo preference_id, como en el hueco original
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('PAYMENT_PENDING');
    expect(r.body.success).toBe(false);
    expect(mockObtenerPago).not.toHaveBeenCalled();
    expect(await estadoDe(id)).toBe('pending');
    await nadaSeActivo('pagador');
  });

  it('si MercadoPago no responde, NO se supone que salió bien', async () => {
    const { id, pref } = await crearPago('pagador');
    mockObtenerPago.mockRejectedValue(new Error('ETIMEDOUT'));

    const r = await capturar('pagador', pref, { paymentId: String(++contadorIdMp) });
    expect(r.status).toBe(503);
    expect(r.body.code).toBe('PAYMENT_VERIFICATION_UNAVAILABLE');
    expect(await estadoDe(id)).toBe('pending');
    await nadaSeActivo('pagador');
  });

  it('un pago "pendiente" no activa nada (antes seguía de largo y activaba igual)', async () => {
    const { id, pref } = await crearPago('pagador');
    mockObtenerPago.mockResolvedValue(aprobado({ status: 'pending' }));
    const idMp = String(++contadorIdMp);

    const r = await capturar('pagador', pref, { paymentId: idMp });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('PAYMENT_PENDING');
    // queda en proceso y con el id guardado, para que el webhook lo complete cuando se acredite
    expect(await estadoDe(id)).toBe('processing');
    expect(((await Payment.findByPk(id)) as any).mercadopagoPaymentId).toBe(idMp);
    await nadaSeActivo('pagador');
  });

  it('un pago pendiente se confirma al volver a la página cuando MercadoPago ya lo aprobó (la promesa del mensaje)', async () => {
    const { id, pref } = await crearPago('pagador');
    const idMp = String(++contadorIdMp);
    mockObtenerPago.mockResolvedValue(aprobado({ status: 'pending' }));
    expect((await capturar('pagador', pref, { paymentId: idMp })).status).toBe(409);
    expect(await estadoDe(id)).toBe('processing');

    mockObtenerPago.mockResolvedValue(aprobado());
    const r = await capturar('pagador', pref, { paymentId: idMp });
    expect(r.status).toBe(200);
    expect(await estadoDe(id)).toBe('completed');
    expect(await esPro('pagador')).toBe(true);
  });

  it('el mensaje de "pendiente" sólo dice que se acredita solo si el webhook procesa pagos', async () => {
    const a = await crearPago('pagador');
    mockObtenerPago.mockResolvedValue(aprobado({ status: 'pending' }));
    delete process.env.MP_WEBHOOK_PROCESA_PAGOS;
    const apagado = await capturar('pagador', a.pref, { paymentId: String(++contadorIdMp) });
    expect(apagado.body.message).not.toContain('se va a acreditar solo');
    expect(apagado.body.message).toContain('recargá');

    const b = await crearPago('pagador');
    process.env.MP_WEBHOOK_PROCESA_PAGOS = 'true';
    try {
      const encendido = await capturar('pagador', b.pref, { paymentId: String(++contadorIdMp) });
      expect(encendido.body.message).toContain('se va a acreditar solo');
    } finally {
      delete process.env.MP_WEBHOOK_PROCESA_PAGOS;
    }
  });

  it('"in_process" y "authorized" (reserva sin capturar) tampoco son plata cobrada', async () => {
    for (const estado of ['in_process', 'authorized']) {
      const { id, pref } = await crearPago('pagador');
      mockObtenerPago.mockResolvedValue(aprobado({ status: estado }));
      const r = await capturar('pagador', pref, { paymentId: String(++contadorIdMp) });
      expect([estado, r.status]).toEqual([estado, 409]);
      expect(await estadoDe(id)).toBe('processing');
    }
    await nadaSeActivo('pagador');
  });

  it('un pago rechazado o cancelado no activa nada y el pago queda como estaba', async () => {
    for (const estado of ['rejected', 'cancelled']) {
      const { id, pref } = await crearPago('pagador');
      mockObtenerPago.mockResolvedValue(aprobado({ status: estado }));
      const r = await capturar('pagador', pref, { paymentId: String(++contadorIdMp) });
      expect([estado, r.status, r.body.code]).toEqual([estado, 409, 'PAYMENT_REJECTED']);
      expect(await estadoDe(id)).toBe('pending');
    }
    await nadaSeActivo('pagador');
  });

  it('una respuesta vacía o sin estado de MercadoPago no se interpreta como aprobada', async () => {
    for (const rara of [{}, null, { status: '' }, { status: 'approved' } /* sin monto ni moneda */]) {
      const { id, pref } = await crearPago('pagador');
      mockObtenerPago.mockResolvedValue(rara);
      const r = await capturar('pagador', pref, { paymentId: String(++contadorIdMp) });
      expect([JSON.stringify(rara), r.status]).toEqual([JSON.stringify(rara), 502]);
      expect(await estadoDe(id)).toBe('pending');
    }
    await nadaSeActivo('pagador');
  });

  /* ---------------- monto, moneda, dueño ---------------- */

  it('un pago aprobado de $1 no libera una orden de $21.000: queda en revisión', async () => {
    const { id, pref } = await crearPago('pagador');
    mockObtenerPago.mockResolvedValue(aprobado({ transaction_amount: 1 }));

    const r = await capturar('pagador', pref, { paymentId: String(++contadorIdMp) });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('PAYMENT_UNDER_REVIEW');
    expect(await estadoDe(id)).toBe('pending_verification');
    await nadaSeActivo('pagador');
  });

  it('un pago aprobado en otra moneda queda en revisión', async () => {
    const { id, pref } = await crearPago('pagador');
    mockObtenerPago.mockResolvedValue(aprobado({ currency_id: 'USD' }));

    const r = await capturar('pagador', pref, { paymentId: String(++contadorIdMp) });
    expect(r.status).toBe(409);
    expect(await estadoDe(id)).toBe('pending_verification');
    await nadaSeActivo('pagador');
  });

  it('el pago de MercadoPago de otra persona (según su metadata) no sirve', async () => {
    const { id, pref } = await crearPago('pagador');
    mockObtenerPago.mockResolvedValue(aprobado({ metadata: { user_id: usuarios.otro.id } }));

    const r = await capturar('pagador', pref, { paymentId: String(++contadorIdMp) });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('PAYMENT_NOT_YOURS');
    expect(await estadoDe(id)).toBe('pending');
    await nadaSeActivo('pagador');
  });

  it('nadie puede confirmar el pago de otro', async () => {
    const { id, pref } = await crearPago('pagador');
    const r = await capturar('otro', pref, { paymentId: String(++contadorIdMp) });
    expect(r.status).toBe(403);
    expect(await estadoDe(id)).toBe('pending');
    await nadaSeActivo('pagador');
  });

  it('el id de pago tiene que ser un número: no se arma una consulta con lo que mande el navegador', async () => {
    for (const malo of ['mp-123', '../merchant_orders/9', '123/refunds', '12']) {
      const { pref } = await crearPago('pagador');
      const r = await capturar('pagador', pref, { paymentId: malo });
      expect([malo, r.status]).toEqual([malo, 400]);
    }
    expect(mockObtenerPago).not.toHaveBeenCalled();
  });

  it('un pago de MercadoPago no sirve para dos órdenes', async () => {
    const idMp = String(++contadorIdMp);
    const a = await crearPago('pagador');
    expect((await capturar('pagador', a.pref, { paymentId: idMp })).status).toBe(200);

    const b = await crearPago('pagador');
    const r = await capturar('pagador', b.pref, { paymentId: idMp });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('PAYMENT_ALREADY_USED');
    expect(await estadoDe(b.id)).toBe('pending');
  });

  /* ---------------- estados: repetir no rehace ---------------- */

  it('repetir la confirmación de un pago ya procesado responde lo mismo y no rehace nada', async () => {
    const { pref } = await crearPago('pagador');
    const idMp = String(++contadorIdMp);
    expect((await capturar('pagador', pref, { paymentId: idMp })).status).toBe(200);
    const membresia: any = await Membership.findOne({ where: { userId: usuarios.pagador.id } });
    const avisos = await Notification.count({ where: { recipientId: usuarios.pagador.id } });
    const llamadasAntes = mockObtenerPago.mock.calls.length;

    const otra = await capturar('pagador', pref, { paymentId: idMp });
    expect(otra.status).toBe(200);
    expect(otra.body.data.alreadyProcessed).toBe(true);
    expect(otra.body.data.membershipActivated).toBe(true);
    // no volvió a consultar, ni a crear, ni a renovar, ni a avisar
    expect(mockObtenerPago.mock.calls.length).toBe(llamadasAntes);
    expect(await Membership.count({ where: { userId: usuarios.pagador.id } })).toBe(1);
    const despues: any = await Membership.findOne({ where: { userId: usuarios.pagador.id } });
    expect(new Date(despues.endDate).getTime()).toBe(new Date(membresia.endDate).getTime());
    expect(await Notification.count({ where: { recipientId: usuarios.pagador.id } })).toBe(avisos);
  });

  it.each(['refunded', 'disputed', 'failed', 'cancelled', 'released', 'pending_verification'])(
    'un pago en estado "%s" no se vuelve a confirmar (antes volvía a escrow)',
    async (estado) => {
      const { id, pref } = await crearPago('pagador', { status: estado, isEscrow: true });
      const r = await capturar('pagador', pref, { paymentId: String(++contadorIdMp) });
      expect(r.status).toBe(409);
      expect(r.body.code).toBe('PAYMENT_NOT_CAPTURABLE');
      expect(await estadoDe(id)).toBe(estado);
      expect(mockObtenerPago).not.toHaveBeenCalled();
      await nadaSeActivo('pagador');
    },
  );

  it('dos confirmaciones simultáneas del mismo pago ejecutan lo que compra UNA sola vez', async () => {
    const { pref } = await crearPago('pagador');
    const idMp = String(++contadorIdMp);
    const [a, b] = await Promise.all([
      capturar('pagador', pref, { paymentId: idMp }),
      capturar('pagador', pref, { paymentId: idMp }),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(await Membership.count({ where: { userId: usuarios.pagador.id } })).toBe(1);
    const activaciones = await Notification.count({ where: { recipientId: usuarios.pagador.id, title: 'Membresía PRO activada' } });
    expect(activaciones).toBe(1);
  });

  /* ---------------- la descripción no decide qué compra el pago ---------------- */

  it('un pago que NO es de membresía no activa PRO por decir "Membresía" en la descripción', async () => {
    const { pref } = await crearPago('pagador', { paymentType: 'contract_payment', description: 'Membresía DOAPP PRO - Mensual' });
    const r = await capturar('pagador', pref, { paymentId: String(++contadorIdMp) });
    expect(r.status).toBe(200);
    expect(r.body.data.membershipActivated).toBeUndefined();
    await nadaSeActivo('pagador');
  });
});
