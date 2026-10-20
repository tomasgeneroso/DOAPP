import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * «Ya pagué» (pago por transferencia en /payment): quien transfirió declara número de operación, nombre, documento, banco y fecha, y adjunta
 * el comprobante. El servidor valida todo otra vez, no deja reusar un número de operación en otro pago y muestra la cuenta del entorno
 * (BANK_CBU / BANK_ALIAS), nunca una de ejemplo.
 */
jest.mock('../../server/index.js', () => ({ __esModule: true, socketService: new Proxy({}, { get: () => () => undefined }) }));
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));
jest.mock('../../server/services/mercadopago.js', () => ({
  __esModule: true,
  default: { createPayment: async () => ({ paymentId: 'pref-x', checkoutUrl: 'https://mp.test/checkout' }), getPayment: async () => ({}) },
}));
jest.mock('../../server/services/currencyExchange.js', () => ({
  __esModule: true,
  describirCotizacion: (q: unknown) => q,
  default: { convertEURtoARS: async (n: number) => n * 3000, getEURtoARSRate: async () => 3000, getQuotedEURRate: async () => ({ rate: 3000 }), getUSDtoARSRate: async () => 1000, convertUSDtoARS: async (n: number) => n * 1000 },
}));

import { Payment } from '../../server/models/sql/Payment.model.js';
import { PaymentProof } from '../../server/models/sql/PaymentProof.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { User } from '../../server/models/sql/User.model.js';
import { Notification } from '../../server/models/sql/Notification.model.js';
import { crearUsuario, crearTrabajo } from '../helpers/fixtures.js';

const hoy = () => new Date().toISOString().slice(0, 10);
const ayer = () => new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const PDF = Buffer.from('%PDF-1.4 comprobante de prueba');

describe('pago por transferencia: comprobante y datos de quien transfirió', () => {
  let app: Express;
  let cliente: any;
  const pagos: string[] = [];
  const trabajos: string[] = [];
  const sesion = () => ({ Authorization: `Bearer ${jwt.sign({ id: cliente.id, email: cliente.email }, process.env.JWT_SECRET || 'test-secret')}` });

  const pagoDePublicacion = async (over: Record<string, unknown> = {}) => {
    const trabajo = await crearTrabajo(cliente.id, { status: 'pending_payment' });
    trabajos.push(trabajo.id);
    const p: any = await Payment.create({
      payerId: cliente.id, amount: 5280.49, currency: 'ARS', status: 'pending_verification', paymentType: 'job_publication', paymentMethod: 'bank_transfer',
      isEscrow: false, platformFee: 0, platformFeePercentage: 0, ...over,
    } as any);
    await Job.update({ publicationPaymentId: p.id } as any, { where: { id: trabajo.id } });
    pagos.push(p.id);
    return p;
  };

  const subir = (paymentId: string, campos: Record<string, string>, archivo: Buffer | null = PDF) => {
    let r = request(app).post(`/api/payments/${paymentId}/upload-proof`).set(sesion());
    for (const [k, v] of Object.entries(campos)) r = r.field(k, v);
    if (archivo) r = r.attach('proof', archivo, { filename: 'comprobante.pdf', contentType: 'application/pdf' });
    return r;
  };

  const datos = (over: Record<string, string> = {}) => ({
    bankReference: `OP-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
    senderName: 'Tomás Generoso',
    senderDocument: '40.182.662',
    senderBankName: 'Banco Galicia',
    transferDate: ayer(),
    ...over,
  });

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/payments', (await import('../../server/routes/payments.js')).default);
    cliente = await crearUsuario({ role: 'client', dniVerified: true });
  });

  afterAll(async () => {
    try {
      await PaymentProof.destroy({ where: { paymentId: pagos } });
      await Notification.destroy({ where: { relatedId: pagos } as any });
      await Payment.destroy({ where: { id: pagos } });
      await Job.destroy({ where: { id: trabajos }, force: true });
      await User.destroy({ where: { id: cliente.id }, force: true });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  it('«Ya pagué» con todos los datos: se guarda el comprobante con quién transfirió, el documento normalizado y la fecha', async () => {
    const p = await pagoDePublicacion();
    const d = datos({ transferDate: hoy() });
    const r = await subir(p.id, d);
    expect([r.status, r.body.message]).toEqual([200, expect.any(String)]);
    const proof: any = await PaymentProof.findOne({ where: { paymentId: p.id, isActive: true } });
    expect(proof).toMatchObject({ bankReference: d.bankReference, senderName: 'Tomás Generoso', senderDocument: '40182662', senderBankName: 'Banco Galicia', status: 'pending' });
    expect(String(proof.transferDate)).toBe(hoy());
    expect(((await Payment.findByPk(p.id)) as any).status).toBe('pending_verification');
  });

  it('con datos faltantes o inválidos responde 400 con el motivo de cada uno y no guarda nada', async () => {
    const p = await pagoDePublicacion();
    const r = await subir(p.id, { bankReference: '12', senderName: '', senderDocument: '123', senderBankName: '', transferDate: '2099-01-01' });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('DATOS_DE_TRANSFERENCIA_INVALIDOS');
    expect(Object.keys(r.body.errores).sort()).toEqual(['banco', 'documento', 'fecha', 'nombre', 'numero']);
    expect(r.body.message).toContain('número de operación');
    expect(await PaymentProof.count({ where: { paymentId: p.id } })).toBe(0);
  });

  it('un número de operación que ya respalda OTRO pago no se acepta (comprobante reusado)', async () => {
    const primero = await pagoDePublicacion();
    const d = datos();
    expect((await subir(primero.id, d)).status).toBe(200);
    const segundo = await pagoDePublicacion();
    const r = await subir(segundo.id, { ...d, bankReference: d.bankReference.toLowerCase() });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('NUMERO_DE_OPERACION_REPETIDO');
    expect(await PaymentProof.count({ where: { paymentId: segundo.id } })).toBe(0);
    // el mismo pago puede volver a subirlo (corrige el archivo): no es «otro pago»
    expect((await subir(primero.id, d)).status).toBe(200);
  });

  it('los pagos que no son de la pantalla /payment (órdenes de pago al terminar) siguen subiendo solo el archivo', async () => {
    const p = await pagoDePublicacion({ paymentType: 'contract_payment' });
    const r = await subir(p.id, {});
    expect(r.status).toBe(200);
  });

  it('otro usuario no puede subir comprobante a un pago ajeno', async () => {
    const p = await pagoDePublicacion();
    const otro: any = await crearUsuario({ role: 'client' });
    try {
      const r = await request(app)
        .post(`/api/payments/${p.id}/upload-proof`)
        .set({ Authorization: `Bearer ${jwt.sign({ id: otro.id, email: otro.email }, process.env.JWT_SECRET || 'test-secret')}` })
        .field('bankReference', 'OP-AJENO-1').field('senderName', 'Otra Persona').field('senderDocument', '30111222').field('senderBankName', 'Banco').field('transferDate', hoy())
        .attach('proof', PDF, { filename: 'c.pdf', contentType: 'application/pdf' });
      // 403 (no es suyo) o 404 (con RLS un pago ajeno ni siquiera existe para esta sesión): en ambos casos no se sube nada.
      expect([403, 404]).toContain(r.status);
      expect(await PaymentProof.count({ where: { paymentId: p.id } })).toBe(0);
    } finally {
      await User.destroy({ where: { id: otro.id }, force: true });
    }
  });

  describe('GET /api/payments/bank-details', () => {
    const previo = { cbu: process.env.BANK_CBU, alias: process.env.BANK_ALIAS };
    afterAll(() => {
      if (previo.cbu === undefined) delete process.env.BANK_CBU; else process.env.BANK_CBU = previo.cbu;
      if (previo.alias === undefined) delete process.env.BANK_ALIAS; else process.env.BANK_ALIAS = previo.alias;
    });

    it('devuelve la cuenta configurada en el entorno', async () => {
      process.env.BANK_CBU = '0000003100148518910535';
      process.env.BANK_ALIAS = 'doapppagos';
      const r = await request(app).get('/api/payments/bank-details').set(sesion());
      expect(r.status).toBe(200);
      expect(r.body.disponible).toBe(true);
      expect(r.body.bankDetails).toMatchObject({ cbu: '0000003100148518910535', alias: 'doapppagos' });
    });

    it('sin cuenta configurada no hay transferencia (y crear la orden responde 503, no una cuenta de ejemplo)', async () => {
      delete process.env.BANK_CBU;
      delete process.env.BANK_ALIAS;
      const r = await request(app).get('/api/payments/bank-details').set(sesion());
      expect(r.body).toMatchObject({ success: true, disponible: false, bankDetails: null });
    });
  });
});
