import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';

/**
 * Lo que se vacía queda anotado.
 *
 * Cuatro lugares ponían en NULL datos de una persona o de un contrato: rechazar una ampliación, desactivar el 2FA,
 * desbanear y vencer un descuento por referidos. Vaciar el campo es necesario (si no, el dato viejo sigue mandando),
 * pero vaciarlo sin anotar antes qué valía es perder quién, cuándo, contra quién y por qué. Estas pruebas exigen que el
 * dato viejo quede en el registro de auditoría ANTES de borrarse, y que el secreto del 2FA y sus códigos NO se copien.
 */

jest.mock('../../server/index.js', () => ({
  __esModule: true,
  socketService: new Proxy({}, { get: () => () => undefined }),
}));
jest.mock('../../server/services/email.js', () => ({
  __esModule: true,
  default: new Proxy({}, { get: () => async () => true }),
}));
// El cron de descuentos guarda su función para que la prueba la pueda ejecutar sin esperar a la medianoche.
jest.mock('node-cron', () => {
  const schedule = (_expresion: string, funcion: unknown) => { (globalThis as any).__cronReferidos = funcion; };
  return { __esModule: true, default: { schedule }, schedule };
});

import { User } from '../../server/models/sql/User.model.js';
import { AuditLog } from '../../server/models/sql/AuditLog.model.js';
import { leerMetadata } from '../../server/utils/auditLog.js';
import { crearUsuario } from '../helpers/fixtures.js';

describe('lo que se vacía queda anotado antes de borrarse', () => {
  let app: Express;
  let admin: any;
  const creados: string[] = [];
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const fila = async (id: string) => (await User.findByPk(id)) as any;
  const asiento = async (action: string, targetId: string) => {
    // Algunos asientos se escriben sin esperar (void): se consulta unos instantes.
    for (let i = 0; i < 20; i++) {
      const a: any = await AuditLog.findOne({ where: { action, targetId: String(targetId) }, order: [['createdAt', 'DESC']] });
      if (a) return a;
      await new Promise((r) => setTimeout(r, 50));
    }
    return null;
  };

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/admin/2fa', (await import('../../server/routes/admin/twoFactor.js')).default);
    app.use('/api/admin/users', (await import('../../server/routes/admin/users.js')).default);
    app.use('/api/admin/blacklist', (await import('../../server/routes/admin/blacklist.js')).default);
    admin = await crearUsuario({ role: 'doer', adminRole: 'owner', name: 'Ana Admin' });
    creados.push(admin.id);
  });

  afterAll(async () => {
    try {
      await AuditLog.destroy({ where: { targetId: creados } });
      await User.destroy({ where: { id: creados }, force: true });
    } catch { /* la limpieza no puede hacer fallar el test */ }
  });

  describe('desactivar el 2FA', () => {
    const SECRETO = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
    const CODIGOS = ['AAAA1111', 'BBBB2222', 'CCCC3333'];

    it('anota quién, para quién, cuándo, por qué y cuántos códigos sin usar había, SIN copiar el secreto ni los códigos', async () => {
      const u: any = await crearUsuario({ role: 'doer', adminRole: 'admin', twoFactorEnabled: true, twoFactorSecret: SECRETO, twoFactorBackupCodes: [...CODIGOS] });
      creados.push(u.id);

      const r = await request(app).post('/api/admin/2fa/disable').set(con(u)).send({ password: 'password123', reason: 'Cambié de celular' });

      expect(r.status).toBe(200);
      const despues = await fila(u.id);
      expect(despues.twoFactorEnabled).toBe(false);
      expect(despues.twoFactorSecret ?? null).toBeNull();
      expect(despues.twoFactorBackupCodes ?? null).toBeNull();

      const a = await asiento('disable_2fa', u.id);
      expect(a).not.toBeNull();
      expect(a.createdAt).toBeTruthy();
      expect(String(a.performedBy)).toBe(String(u.id));
      expect(a.description).toContain('Cambié de celular');
      const meta: any = leerMetadata(a);
      expect(meta).toMatchObject({ desactivadoPor: String(u.id), paraUsuario: String(u.id), motivo: 'Cambié de celular', codigosDeRespaldoSinUsar: 3 });

      // el secreto y los códigos son lo que NO se guarda: copiarlos al registro sería dejar la puerta abierta en otro lado
      const todo = JSON.stringify(a.toJSON());
      expect(todo).not.toContain(SECRETO);
      for (const c of CODIGOS) expect(todo).not.toContain(c);
    });
  });

  describe('desbanear a un usuario', () => {
    const banear = async (over: Record<string, unknown> = {}) => {
      const u: any = await crearUsuario({ role: 'doer' });
      creados.push(u.id);
      await User.update(
        {
          isBanned: true,
          banReason: 'Fraude con pagos',
          bannedAt: new Date('2026-09-01T12:00:00.000Z'),
          bannedBy: admin.id,
          banExpiresAt: new Date('2027-01-01T00:00:00.000Z'),
          ...over,
        } as any,
        { where: { id: u.id } },
      );
      return u;
    };

    it('desde la ficha del usuario: el baneo entero (motivo, fecha, quién lo puso y hasta cuándo) queda anotado', async () => {
      const u = await banear();

      const r = await request(app).post(`/api/admin/users/${u.id}/unban`).set(con(admin)).send({ reason: 'Apelación aceptada' });

      expect(r.status).toBe(200);
      const despues = await fila(u.id);
      expect(despues.isBanned).toBe(false);
      expect(despues.banReason ?? null).toBeNull();
      expect(despues.bannedBy ?? null).toBeNull();

      const a = await asiento('unban_user', u.id);
      expect(a).not.toBeNull();
      expect(String(a.performedBy)).toBe(String(admin.id));
      expect(a.description).toContain('Fraude con pagos');
      expect(a.description).toContain('Apelación aceptada');
      const meta: any = leerMetadata(a);
      expect(meta.baneoAnterior).toMatchObject({
        banReason: 'Fraude con pagos',
        bannedAt: '2026-09-01T12:00:00.000Z',
        bannedBy: String(admin.id),
        banExpiresAt: '2027-01-01T00:00:00.000Z',
      });
      expect(meta.baneoAnterior.baneadoPorNombre).toContain(admin.email);
      expect(meta.motivoDelDesbaneo).toBe('Apelación aceptada');
      expect(meta.desbaneadoPor).toBe(String(admin.id));
      // y en `changes` quedan los valores viejos campo por campo
      const motivo = (a.changes as any[]).find((c) => c.field === 'banReason');
      expect(motivo).toMatchObject({ oldValue: 'Fraude con pagos', newValue: null });
    });

    it('desde la lista negra: también queda anotado qué baneo se levantó', async () => {
      const u = await banear({ banReason: 'Cuenta duplicada' });

      const r = await request(app).post(`/api/admin/blacklist/${u.id}/remove`).set(con(admin)).send({ notes: 'Era un error' });

      expect(r.status).toBe(200);
      expect((await fila(u.id)).isBanned).toBe(false);
      const a = await asiento('blacklist.remove', u.id);
      expect(a).not.toBeNull();
      expect(a.description).toContain('Cuenta duplicada');
      const meta: any = leerMetadata(a);
      expect(meta.baneoAnterior).toMatchObject({ banReason: 'Cuenta duplicada', bannedBy: String(admin.id) });
      expect(meta.desbaneadoPor).toBe(String(admin.id));
    });
  });

  describe('vencer un descuento por referidos', () => {
    it('anota a quién le venció, cuándo vencía y qué tasa tenía, y deja el usuario sin descuento', async () => {
      const venciaEl = new Date(Date.now() - 2 * 86_400_000);
      const u: any = await crearUsuario({ role: 'doer' });
      creados.push(u.id);
      await User.update(
        { hasReferralDiscount: true, referralDiscountExpiresAt: venciaEl, currentCommissionRate: 3, membershipTier: 'free' } as any,
        { where: { id: u.id } },
      );

      const { startResetReferralDiscountsJob } = await import('../../server/jobs/resetReferralDiscounts.js');
      startResetReferralDiscountsJob();
      const correr = (globalThis as any).__cronReferidos as () => Promise<void>;
      expect(typeof correr).toBe('function');
      await correr();

      const despues = await fila(u.id);
      expect(despues.hasReferralDiscount).toBe(false);
      expect(despues.referralDiscountExpiresAt ?? null).toBeNull();

      const a = await asiento('REFERRAL_DISCOUNT_EXPIRED', u.id);
      expect(a).not.toBeNull();
      expect(a.actor).toBe('cron:resetReferralDiscounts');
      const meta: any = leerMetadata(a);
      expect(meta.venciaEl).toBe(venciaEl.toISOString());
      expect(Number(meta.tasaAnterior)).toBe(3);
      const vencimiento = (a.changes as any[]).find((c) => c.field === 'referralDiscountExpiresAt');
      expect(vencimiento).toMatchObject({ oldValue: venciaEl.toISOString(), newValue: null });
    });
  });
});
