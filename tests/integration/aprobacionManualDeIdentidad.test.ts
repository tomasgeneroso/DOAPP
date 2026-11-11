import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Aprobar una identidad a mano: solo cuando Didit falla o hay un problema.
 *
 * Regla del dueño (2026-11-07): la identidad la verifica Didit; un administrador puede aprobarla a mano pero solo si Didit falla o hay problemas
 * (Didit sin configurar, intentos agotados, verificación en revisión). Siempre con un motivo escrito y dejando rastro. Antes la ruta rechazaba
 * siempre, y las cuentas que Didit no podía resolver (documento que no coincide con el registro) quedaban sin salida.
 */
const didit = { configurado: true };
jest.mock('../../server/services/didit.js', () => ({
  __esModule: true,
  isDiditConfigured: () => didit.configurado,
  diditEnUso: () => didit.configurado,
  verificacionConDiditActiva: () => true,
  getKycMaxAttempts: () => 3,
  getDiditMedia: async () => ({ items: [] }),
  isManualKycUnlocked: () => false,
}));
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));

import { User } from '../../server/models/sql/User.model.js';
import { AuditLog } from '../../server/models/sql/AuditLog.model.js';
import { Notification } from '../../server/models/sql/Notification.model.js';
import { crearUsuario } from '../helpers/fixtures.js';
import { permisoParaAprobarAMano, RAZON_MINIMA_DE_APROBACION } from '../../server/services/aprobacionManualDeIdentidad.js';

describe('permisoParaAprobarAMano (la regla sola)', () => {
  const base = { dniVerified: false, registrationPending: false, mergedIntoId: null, kycStatus: null, kycAttempts: 0 };

  it('con Didit andando y la persona sin problema, NO se permite', () => {
    const p = permisoParaAprobarAMano(base, true);
    expect(p.permitido).toBe(false);
    expect(p.descripcion).toMatch(/Didit está funcionando/);
  });

  it('Didit sin configurar, intentos agotados y verificación en revisión SÍ se permiten, cada uno con su motivo', () => {
    expect(permisoParaAprobarAMano(base, false)).toMatchObject({ permitido: true, motivo: 'didit_sin_configurar' });
    expect(permisoParaAprobarAMano({ ...base, kycAttempts: 3 }, true)).toMatchObject({ permitido: true, motivo: 'intentos_agotados' });
    expect(permisoParaAprobarAMano({ ...base, kycAttempts: 2 }, true).permitido).toBe(false);
    expect(permisoParaAprobarAMano({ ...base, kycStatus: 'In Review' }, true)).toMatchObject({ permitido: true, motivo: 'en_revision' });
  });

  it('un rechazo suelto, una sesión vencida o abandonada NO alcanzan: la persona puede reintentar', () => {
    for (const kycStatus of ['Declined', 'Expired', 'Abandoned', 'Not Started', 'In Progress']) {
      expect(permisoParaAprobarAMano({ ...base, kycStatus }, true).permitido).toBe(false);
    }
  });

  it('nunca si ya está verificada, si no terminó el registro o si fue unida a otra cuenta (aunque Didit esté caído)', () => {
    expect(permisoParaAprobarAMano({ ...base, dniVerified: true, kycStatus: 'In Review' }, false).permitido).toBe(false);
    expect(permisoParaAprobarAMano({ ...base, registrationPending: true }, false).permitido).toBe(false);
    expect(permisoParaAprobarAMano({ ...base, mergedIntoId: 'otra' }, false).permitido).toBe(false);
  });
});

describe('POST /api/admin/users/:id/verify (aprobación manual)', () => {
  let app: Express;
  let admin: any, otroAdmin: any, dueno: any;
  const creados: string[] = [];
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const razon = 'Vi el DNI frente y dorso: el nombre coincide, Didit lo dejó en revisión por una foto borrosa.';

  const persona = async (over: Record<string, unknown> = {}) => {
    const u: any = await crearUsuario({ role: 'client', name: 'Persona a verificar', registrationPending: false, dniVerified: false, ...over });
    creados.push(u.id);
    return u;
  };
  const aprobar = (quien: any, objetivo: any, body: Record<string, unknown> = { verified: true, razon }) =>
    request(app).post(`/api/admin/users/${objetivo.id}/verify`).set(con(quien)).send(body);
  const recargar = async (id: string) => (await User.findByPk(id)) as any;
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
    app.use('/api/admin/users', (await import('../../server/routes/admin/users.js')).default);
    admin = await crearUsuario({ role: 'admin', adminRole: 'admin' });
    otroAdmin = await crearUsuario({ role: 'admin', adminRole: 'admin' });
    dueno = await crearUsuario({ role: 'admin', adminRole: 'owner' });
    creados.push(admin.id, otroAdmin.id, dueno.id);
  });

  afterAll(async () => {
    try {
      await AuditLog.destroy({ where: { targetId: creados } as any });
      await Notification.destroy({ where: { recipientId: creados } });
      await User.destroy({ where: { id: creados }, force: true });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  it('verificación EN REVISIÓN: el administrador la aprueba, queda verificada y anotada con severidad alta', async () => {
    didit.configurado = true;
    const u = await persona({ kycStatus: 'In Review' });

    const r = await aprobar(admin, u);

    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ dniVerified: true, kycStatus: 'Approved' });
    const despues = await recargar(u.id);
    expect(despues.dniVerified).toBe(true);
    expect(despues.kycStatus).toBe('Approved');
    expect(despues.legalInfo?.adminVerifiedBy).toBe(String(admin.id));
    let fila: any = null;
    await esperar(async () => {
      fila = await AuditLog.findOne({ where: { targetId: u.id, action: 'approve_user_identity_manual' } as any });
      return !!fila;
    });
    expect(fila).not.toBeNull();
    expect(fila.severity).toBe('high');
    expect(fila.metadata).toMatchObject({ motivo: 'en_revision', razon });
    expect(fila.metadata.antes).toMatchObject({ kycStatus: 'In Review', dniVerified: false });
  });

  it('cuenta como persona verificada para el beneficio de lanzamiento', async () => {
    didit.configurado = true;
    const u = await persona({ kycStatus: 'In Review' });
    await aprobar(admin, u);
    const despues = await recargar(u.id);
    expect(despues.launchBenefitGrantedAt).toBeTruthy();
    expect(Number(despues.freeContractsRemaining)).toBeGreaterThanOrEqual(1);
  });

  it('intentos agotados con Didit andando: se permite', async () => {
    didit.configurado = true;
    const u = await persona({ kycStatus: 'Declined', kycAttempts: 3 });
    expect((await aprobar(admin, u)).status).toBe(200);
  });

  it('Didit sin configurar: se permite', async () => {
    didit.configurado = false;
    const u = await persona();
    expect((await aprobar(admin, u)).status).toBe(200);
    didit.configurado = true;
  });

  it('Didit andando y la persona puede reintentar: 409 y la cuenta no se toca', async () => {
    didit.configurado = true;
    const u = await persona({ kycStatus: 'Declined', kycAttempts: 1 });

    const r = await aprobar(admin, u);

    expect(r.status).toBe(409);
    expect(r.body.code).toBe('IDENTIDAD_APROBACION_MANUAL_NO_PERMITIDA');
    const despues = await recargar(u.id);
    expect(despues.dniVerified).toBe(false);
    expect(despues.kycStatus).toBe('Declined');
    expect(await AuditLog.count({ where: { targetId: u.id, action: 'approve_user_identity_manual' } as any })).toBe(0);
  });

  it('sin motivo escrito (o muy corto): 400 y la cuenta no se toca', async () => {
    didit.configurado = true;
    const u = await persona({ kycStatus: 'In Review' });

    for (const corto of [undefined, '', 'ok', 'a'.repeat(RAZON_MINIMA_DE_APROBACION - 1)]) {
      const r = await aprobar(admin, u, { verified: true, razon: corto });
      expect(r.status).toBe(400);
      expect(r.body.code).toBe('IDENTIDAD_APROBACION_SIN_MOTIVO');
    }
    expect((await recargar(u.id)).dniVerified).toBe(false);
  });

  it('nadie aprueba su propia identidad (el dueño sí, y queda anotado)', async () => {
    didit.configurado = true;
    await admin.update({ kycStatus: 'In Review', registrationPending: false, dniVerified: false });
    const propia = await aprobar(admin, admin);
    expect(propia.status).toBe(403);
    expect(propia.body.code).toBe('IDENTIDAD_APROBACION_PROPIA');

    await dueno.update({ kycStatus: 'In Review', registrationPending: false, dniVerified: false });
    expect((await aprobar(dueno, dueno)).status).toBe(200);
  });

  it('una cuenta ya verificada o sin registro terminado: 409', async () => {
    didit.configurado = false;
    const verificada = await persona({ dniVerified: true });
    const sinRegistro = await persona({ registrationPending: true });
    expect((await aprobar(admin, verificada)).status).toBe(409);
    expect((await aprobar(admin, sinRegistro)).status).toBe(409);
    didit.configurado = true;
  });

  it('un usuario común no puede', async () => {
    const comun = await persona();
    const otra = await persona({ kycStatus: 'In Review' });
    const r = await request(app).post(`/api/admin/users/${otra.id}/verify`).set(con(comun)).send({ verified: true, razon });
    expect(r.status).toBe(403);
    expect((await recargar(otra.id)).dniVerified).toBe(false);
  });

  it('la ficha de la persona dice si se puede aprobar a mano y por qué', async () => {
    didit.configurado = true;
    const enRevision = await persona({ kycStatus: 'In Review' });
    const sana = await persona();

    const a = await request(app).get(`/api/admin/users/${enRevision.id}/profile-detail`).set(con(otroAdmin));
    const b = await request(app).get(`/api/admin/users/${sana.id}/profile-detail`).set(con(otroAdmin));

    expect(a.status).toBe(200);
    expect(a.body.data.aprobacionManual).toMatchObject({ permitido: true, motivo: 'en_revision', razonMinima: RAZON_MINIMA_DE_APROBACION });
    expect(b.body.data.aprobacionManual.permitido).toBe(false);
    expect(b.body.data.aprobacionManual.descripcion).toMatch(/Didit/);
  });

  it('revocar una verificación sigue funcionando siempre', async () => {
    didit.configurado = true;
    const u = await persona({ dniVerified: true, kycStatus: 'Approved' });

    const r = await aprobar(admin, u, { verified: false });

    expect(r.status).toBe(200);
    const despues = await recargar(u.id);
    expect(despues.dniVerified).toBe(false);
    expect(despues.kycStatus).toBe('Revoked');
  });
});
