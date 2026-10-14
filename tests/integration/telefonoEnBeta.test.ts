import { describe, it, expect, beforeAll, beforeEach, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * La verificación del teléfono por WhatsApp se activa con la versión real, no en la beta.
 *
 * En la beta: el servidor no ofrece la verificación (`capabilities.phoneVerification` en falso, que es lo que mira cada
 * pantalla para mostrarla u ocultarla), no manda códigos ni acepta códigos, y el teléfono no cuenta para el escalón 2 de
 * la credibilidad (quien no puede verificarlo no queda trabado en el escalón 1: alcanza con el correo). Con la fase real
 * todo se enciende solo, sin tocar nada.
 */

jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('../../server/services/email.js', () => ({
  __esModule: true,
  default: new Proxy({}, { get: () => async () => true }),
}));

let mockBeta = true;
jest.mock('../../server/services/platformPhase.js', () => ({
  ...(jest.requireActual('../../server/services/platformPhase.js') as object),
  isBetaPhase: async () => mockBeta,
  getPlatformPhase: async () => (mockBeta ? 'beta' : 'live'),
}));
const mockEnviar = jest.fn<(...a: unknown[]) => Promise<unknown>>();
jest.mock('../../server/services/whatsapp.js', () => ({
  __esModule: true,
  getWhatsAppStatus: () => ({ ready: true, reason: null }),
  sendWhatsAppCode: (...a: unknown[]) => mockEnviar(...a),
}));

import { User } from '../../server/models/sql/User.model.js';
import { crearUsuario } from '../helpers/fixtures.js';

describe('verificación del teléfono: solo con la versión real', () => {
  let app: Express;
  let persona: any;
  const con = () => ({ Authorization: `Bearer ${jwt.sign({ id: persona.id, email: persona.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const yo = () => request(app).get('/api/auth/me').set(con());

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/auth', (await import('../../server/routes/auth.js')).default);
    persona = await crearUsuario({ role: 'client', phone: '+5491112345678', isVerified: true, dniVerified: true });
  });
  beforeEach(async () => {
    mockBeta = true;
    mockEnviar.mockReset();
    mockEnviar.mockResolvedValue({ sent: true });
    await User.update({ phoneVerified: false, phoneVerificationCode: null, phoneVerificationExpires: null } as any, { where: { id: persona.id } });
  });
  afterAll(async () => { /* la base se reconstruye en cada suite */ });

  describe('en la beta', () => {
    it('no se ofrece: la capacidad viene en falso', async () => {
      const r = await yo();
      expect(r.status).toBe(200);
      expect(r.body.user.capabilities.phoneVerification).toBe(false);
    });

    it('no manda códigos por WhatsApp (403 y no se llama al canal)', async () => {
      const r = await request(app).post('/api/auth/phone/send-code').set(con()).send({ phone: '+5491112345678' });
      expect(r.status).toBe(403);
      expect(r.body.code).toBe('PHONE_VERIFICATION_NOT_IN_BETA');
      expect(r.body.message).toMatch(/versión real/i);
      expect(mockEnviar).not.toHaveBeenCalled();
      expect(((await User.findByPk(persona.id)) as any).phoneVerificationCode).toBeNull(); // ni se guardó un código
    });

    it('tampoco acepta un código, aunque hubiera uno guardado de antes', async () => {
      await User.update({ phoneVerificationCode: '123456', phoneVerificationExpires: new Date(Date.now() + 600_000) } as any, { where: { id: persona.id } });
      const r = await request(app).post('/api/auth/phone/verify-code').set(con()).send({ code: '123456' });
      expect(r.status).toBe(403);
      expect(((await User.findByPk(persona.id)) as any).phoneVerified).toBe(false);
    });

    it('el escalón 2 de la credibilidad pide solo el correo', async () => {
      const r = await yo();
      expect(r.body.user.credibility.score).toBe(2);
      expect(r.body.user.credibility.breakdown.find((b: any) => b.level === 2)).toMatchObject({ label: 'Correo', achieved: true });
    });

    it('sin el correo verificado, sigue en el escalón 1', async () => {
      const otra = await crearUsuario({ role: 'client', dniVerified: true, isVerified: false });
      const r = await request(app).get('/api/auth/me').set({ Authorization: `Bearer ${jwt.sign({ id: otra.id, email: otra.email }, process.env.JWT_SECRET || 'test-secret')}` });
      expect(r.body.user.credibility.score).toBe(1);
    });
  });

  describe('con la versión real', () => {
    it('se ofrece y se puede pedir y confirmar el código', async () => {
      mockBeta = false;
      expect((await yo()).body.user.capabilities.phoneVerification).toBe(true);

      const enviado = await request(app).post('/api/auth/phone/send-code').set(con()).send({ phone: '+5491112345678' });
      expect(enviado.status).toBe(200);
      expect(mockEnviar).toHaveBeenCalledTimes(1);
      const codigo = ((await User.findByPk(persona.id)) as any).phoneVerificationCode;

      const mal = await request(app).post('/api/auth/phone/verify-code').set(con()).send({ code: '000000' });
      expect(mal.status).toBe(400);
      const bien = await request(app).post('/api/auth/phone/verify-code').set(con()).send({ code: codigo });
      expect(bien.status).toBe(200);
      expect(((await User.findByPk(persona.id)) as any).phoneVerified).toBe(true);
    });

    it('el escalón 2 vuelve a pedir teléfono y correo', async () => {
      mockBeta = false;
      const sin = await yo();
      expect(sin.body.user.credibility.score).toBe(1);
      expect(sin.body.user.credibility.breakdown.find((b: any) => b.level === 2)).toMatchObject({ label: 'Teléfono y correo', achieved: false });

      await User.update({ phoneVerified: true } as any, { where: { id: persona.id } });
      expect((await yo()).body.user.credibility.score).toBe(2);
    });
  });
});
