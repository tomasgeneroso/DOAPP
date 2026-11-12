import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';

/**
 * Para publicar o trabajar hace falta el correo CONFIRMADO (regla del dueño, 2026-11-12). Sin confirmarlo se puede mirar, escribir en el blog y dejar un trabajo en borrador, pero
 * no publicarlo ni pagar su publicación, no postularse, no cotizar, no aceptar un contrato ni retirar plata. Antes la publicación y el pago de la publicación solo pedían la identidad,
 * y una cuenta de X —que nace «verificada» y sin correo— nunca tenía que confirmar el que escribía.
 */
const correos: Array<{ to: string; url?: string }> = [];
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('../../server/services/email.js', () => ({
  __esModule: true,
  default: {
    sendVerificationEmail: async (to: string, _nombre: string, url: string) => {
      correos.push({ to, url });
      return true;
    },
    ...new Proxy({}, { get: () => async () => true }),
  },
}));

import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { bloqueoParaOperar, correoConfirmado } from '../../server/services/identidadDeclarada.js';
import { crearUsuario, crearTrabajo } from '../helpers/fixtures.js';

describe('correo confirmado para publicar o trabajar', () => {
  let app: Express;
  const creados: string[] = [];
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const cuenta = async (over: Record<string, unknown> = {}) => {
    const u = await crearUsuario({ dni: String(30000000 + Math.floor(Math.random() * 9000000)), dniVerified: true, registrationPending: false, ...over });
    creados.push(String(u.id));
    return u;
  };

  beforeAll(async () => {
    // Con Didit apagado (como en producción hoy) el registro se completa con el DNI; con Didit encendido pediría pasar por Didit antes (otro camino, ya probado en registroEnPasos).
    process.env.VERIFICACION_CON_DIDIT = 'false';
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/auth', (await import('../../server/routes/auth.js')).default);
    app.use('/api/proposals', (await import('../../server/routes/proposals.js')).default);
    app.use('/api/balance', (await import('../../server/routes/balance.js')).default);
    app.use('/api/contracts', (await import('../../server/routes/contracts.js')).default);
    app.use('/api/payments', (await import('../../server/routes/payments.js')).default);
    app.use('/api/jobs', (await import('../../server/routes/jobs.js')).default);
  });

  afterAll(async () => {
    process.env.VERIFICACION_CON_DIDIT = 'true';
    try {
      await Job.destroy({ where: { clientId: creados } as any, force: true } as any);
      await User.destroy({ where: { id: creados }, force: true });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  describe('la regla', () => {
    it('correo confirmado = el enlace se abrió Y la cuenta tiene correo (una cuenta de X nace «verificada» sin correo: no cuenta)', () => {
      expect(correoConfirmado({ isVerified: true, email: 'a@b.com' })).toBe(true);
      expect(correoConfirmado({ isVerified: false, email: 'a@b.com' })).toBe(false);
      expect(correoConfirmado({ isVerified: true, email: '' })).toBe(false);
      expect(correoConfirmado({ isVerified: true, email: null })).toBe(false);
      expect(correoConfirmado(null)).toBe(false);
    });

    it('el bloqueo dice primero el correo y después la identidad, con un código y un texto cada uno', () => {
      const sinCorreo = bloqueoParaOperar({ isVerified: false, email: 'a@b.com', dniVerified: true, registrationPending: false, dni: '30123456' });
      expect(sinCorreo?.codigo).toBe('EMAIL_REQUIRED');
      expect(sinCorreo?.mensaje).toMatch(/Confirmá tu correo electrónico para publicar o trabajar/);
      expect(bloqueoParaOperar({ isVerified: false, email: 'a@b.com' })?.codigo).toBe('EMAIL_REQUIRED'); // aunque tampoco tenga la identidad: primero el correo
      expect(bloqueoParaOperar({ isVerified: true, email: 'a@b.com', registrationPending: true })?.codigo).toBe('KYC_REQUIRED');
      expect(bloqueoParaOperar({ isVerified: true, email: 'a@b.com', dniVerified: true })).toBeNull();
    });
  });

  describe('lo que no se puede sin el correo confirmado', () => {
    it('postularse, cotizar/aceptar y retirar responden 403 EMAIL_REQUIRED; con el correo confirmado la misma persona pasa la puerta', async () => {
      const sin = await cuenta({ isVerified: false });
      for (const [metodo, ruta] of [
        ['post', '/api/proposals'],
        ['post', '/api/proposals/apply-and-accept'],
        ['post', '/api/balance/withdraw'],
      ] as const) {
        const r = await (request(app) as any)[metodo](ruta).set(con(sin)).send({});
        expect({ ruta, estado: r.status, codigo: r.body.code }).toEqual({ ruta, estado: 403, codigo: 'EMAIL_REQUIRED' });
      }
      await User.update({ isVerified: true } as never, { where: { id: sin.id } });
      const con2 = await request(app).post('/api/proposals').set(con(sin)).send({});
      expect(con2.body.code).not.toBe('EMAIL_REQUIRED'); // pasó la puerta (después falla por datos incompletos, que es otra cosa)
    });

    it('aceptar un contrato también pide el correo confirmado', async () => {
      const sin = await cuenta({ isVerified: false });
      const r = await request(app).put('/api/contracts/00000000-0000-4000-8000-000000000000/accept').set(con(sin)).send({});
      expect(r.status).toBe(403);
      expect(r.body.code).toBe('EMAIL_REQUIRED');
    });

    it('pagar la publicación de un trabajo (create-order) exige el correo confirmado: este camino no tenía puerta', async () => {
      const sin = await cuenta({ isVerified: false });
      const trabajo = await crearTrabajo(sin.id, { status: 'draft' });
      const r = await request(app).post('/api/payments/create-order').set(con(sin)).send({ paymentType: 'job_publication', jobId: trabajo.id, paymentMethod: 'balance' });
      expect(r.status).toBe(403);
      expect(r.body.code).toBe('EMAIL_REQUIRED');
      expect(((await Job.findByPk(trabajo.id)) as any).status).toBe('draft'); // no se publicó ni se cobró
    });

    it('crear un trabajo sin el correo confirmado lo deja en BORRADOR y lo explica; no lo publica', async () => {
      const sin = await cuenta({ isVerified: false });
      const r = await request(app)
        .post('/api/jobs')
        .set(con(sin))
        .field('title', 'Arreglo de canilla')
        .field('summary', 'Pierde agua')
        .field('description', 'La canilla de la cocina pierde agua y hay que cambiarla por una nueva, con materiales incluidos.')
        .field('price', '10000')
        .field('category', 'plomeria')
        .field('location', 'Resistencia, Chaco')
        .field('startDate', new Date(Date.now() + 5 * 86_400_000).toISOString())
        .field('endDate', new Date(Date.now() + 6 * 86_400_000).toISOString())
        .field('pricingMode', 'quote');
      // Aunque el trabajo sea «a cotizar» (que se publica de entrada), sin correo confirmado queda en borrador.
      if (r.status === 201) {
        expect(r.body.requiresEmail).toBe(true);
        expect(r.body.code).toBe('EMAIL_REQUIRED');
        expect(r.body.message).toMatch(/Confirmá tu correo electrónico/);
        expect(r.body.job.status).not.toBe('open');
      } else {
        // la creación puede rechazar otros datos de la prueba; lo que importa es que NO se publicó
        expect(r.body.job?.status).not.toBe('open');
      }
    });
  });

  describe('cuentas de X: el correo que escriben al completar el registro hay que confirmarlo', () => {
    it('queda SIN confirmar y se le manda el enlace; hasta abrirlo no puede publicar ni trabajar', async () => {
      correos.length = 0;
      const email = `x${Date.now().toString(36)}@registro.test`;
      const u = await crearUsuario({ email: '', isVerified: true, registrationPending: true, username: `x${Date.now().toString(36)}`, name: 'Nuevo usuario' } as any);
      creados.push(String(u.id));
      const dni = String(40000000 + Math.floor(Math.random() * 5000000));
      const r = await request(app).put('/api/auth/registro/completar').set(con(u)).send({ nombres: 'Ana', apellidos: 'Prueba', dni, username: `ana${Date.now().toString(36)}`, email });
      expect(r.status).toBe(200);
      const despues: any = await User.findByPk(u.id);
      expect(despues.email).toBe(email);
      expect(despues.isVerified).toBe(false);
      expect(correos).toHaveLength(1);
      expect(correos[0].to).toBe(email);
      expect(correos[0].url).toMatch(/\/verify-email\?token=/);
      expect(correoConfirmado(despues)).toBe(false);
      const puerta = await request(app).post('/api/proposals').set(con(despues)).send({});
      expect(puerta.body.code).toBe('EMAIL_REQUIRED');
      // abre el enlace y ya puede
      const token = (correos[0].url as string).split('token=')[1];
      expect((await request(app).get('/api/auth/verify-email').query({ token })).status).toBe(200);
      expect(((await User.findByPk(u.id)) as any).isVerified).toBe(true);
    });

    it('una cuenta que ya traía correo (registro normal) NO se marca como sin confirmar al completar el registro', async () => {
      const u = await crearUsuario({ isVerified: true, registrationPending: true } as any);
      creados.push(String(u.id));
      const dni = String(45000000 + Math.floor(Math.random() * 3000000));
      await request(app).put('/api/auth/registro/completar').set(con(u)).send({ nombres: 'Ana', apellidos: 'Prueba', dni, username: `ana${Date.now().toString(36)}` });
      expect(((await User.findByPk(u.id)) as any).isVerified).toBe(true);
    });
  });

  it('/auth/me avisa si el correo está confirmado', async () => {
    const sin = await cuenta({ isVerified: false });
    const me = await request(app).get('/api/auth/me').set(con(sin));
    expect(me.body.user.capabilities.correoConfirmado).toBe(false);
    await User.update({ isVerified: true } as never, { where: { id: sin.id } });
    expect((await request(app).get('/api/auth/me').set(con(sin))).body.user.capabilities.correoConfirmado).toBe(true);
  });
});
