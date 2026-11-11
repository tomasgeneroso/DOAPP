import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';

/**
 * Solo el número de DNI (regla del dueño, 2026-11-11: «sacar lo de Didit por el momento, que solo pida número de dni»).
 *
 * Con `VERIFICACION_CON_DIDIT` apagada el registro no pide documento ni selfie: alcanza con el DNI del formulario. Esa persona puede publicar, postularse y cobrar
 * (`identidadSuficiente`), pero NO queda «verificada»: no recibe el beneficio de lanzamiento (primeras 2.000 PERSONAS VERIFICADAS) ni la insignia. Encendida de nuevo, todo vuelve
 * a como era. Las pruebas del resto del proyecto corren con la variable encendida (`tests/env.first.ts`).
 */
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));

import { User } from '../../server/models/sql/User.model.js';
import { ModuleConfig } from '../../server/models/sql/ModuleConfig.model.js';
import { AuditLog } from '../../server/models/sql/AuditLog.model.js';
import { protect, requireKyc } from '../../server/middleware/auth.js';
import { identidadDeclarada, identidadSuficiente } from '../../server/services/identidadDeclarada.js';
import { permisoParaAprobarAMano } from '../../server/services/aprobacionManualDeIdentidad.js';
import { fijarVerificacionConDidit, verificacionConDiditActiva } from '../../server/services/didit.js';
import { cargarVerificacionDelPanel } from '../../server/services/verificacionDelPanel.js';
import { MODULO_VERIFICACION_DIDIT } from '../../shared/constants/modulos.js';
import { crearUsuario } from '../helpers/fixtures.js';

describe('solo DNI (verificación con Didit apagada)', () => {
  let app: Express;
  const emails: string[] = [];
  let n = 0;
  const dniNuevo = () => String(60000000 + Math.floor(Math.random() * 2000000) + n++);
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const apagar = () => {
    process.env.VERIFICACION_CON_DIDIT = 'false';
  };
  const encender = () => {
    process.env.VERIFICACION_CON_DIDIT = 'true';
  };
  const cuentaNueva = async () => {
    const email = `solodni${Date.now().toString(36)}${n++}@registro.test`;
    emails.push(email);
    const r = await request(app).post('/api/auth/register').send({ pasos: true, email, password: 'password123', termsAccepted: true });
    expect(r.status).toBe(201);
    return (await User.findOne({ where: { email } })) as any;
  };
  const completar = (u: any, dni: string) => request(app).put('/api/auth/registro/completar').set(con(u)).send({ nombres: 'Ana', apellidos: 'Prueba', dni, username: `sd${Date.now().toString(36)}${n++}` });

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/auth', (await import('../../server/routes/auth.js')).default);
    app.get('/puerta', protect, requireKyc, (_req, res) => {
      res.json({ success: true });
    });
  });

  beforeEach(() => {
    apagar();
  });

  afterAll(async () => {
    encender();
    try {
      await User.destroy({ where: { email: emails }, force: true });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  describe('identidadSuficiente', () => {
    it('la verificada siempre alcanza; la declarada (registro completo y DNI válido) solo con Didit apagado', () => {
      expect(identidadSuficiente({ dniVerified: true, registrationPending: true, dni: null })).toBe(true);
      expect(identidadSuficiente({ dniVerified: false, registrationPending: false, dni: '30123456' })).toBe(true);
      encender();
      expect(identidadSuficiente({ dniVerified: false, registrationPending: false, dni: '30123456' })).toBe(false);
      expect(identidadSuficiente({ dniVerified: true, registrationPending: false, dni: '30123456' })).toBe(true);
    });

    it('sin registro completo o sin un DNI válido no alcanza', () => {
      expect(identidadSuficiente({ registrationPending: true, dni: '30123456' })).toBe(false);
      expect(identidadSuficiente({ registrationPending: false, dni: null })).toBe(false);
      expect(identidadSuficiente({ registrationPending: false, dni: '123' })).toBe(false);
      expect(identidadSuficiente({ registrationPending: false, dni: '1234567890' })).toBe(false);
      expect(identidadSuficiente(null)).toBe(false);
      expect(identidadDeclarada({ registrationPending: false, dni: '30123456' })).toBe(true);
    });
  });

  describe('registro sin documento', () => {
    it('/registro/completar no exige haber pasado por Didit, aunque Didit tenga claves, y deja la cuenta SIN verificar y SIN beneficio de lanzamiento', async () => {
      const claveAntes = process.env.DIDIT_API_KEY;
      process.env.DIDIT_API_KEY = 'clave-de-prueba';
      try {
        const u = await cuentaNueva();
        const antes = u.freeContractsRemaining;
        const r = await completar(u, dniNuevo());
        expect(r.status).toBe(200);
        expect(r.body.verificada).toBe(false);
        const despues: any = await User.findByPk(u.id);
        expect(despues).toMatchObject({ registrationPending: false, dniVerified: false, name: 'Ana Prueba' });
        expect(despues.launchBenefitGrantedAt ?? null).toBeNull();
        expect(despues.freeContractsRemaining).toBe(antes);
      } finally {
        if (claveAntes === undefined) delete process.env.DIDIT_API_KEY;
        else process.env.DIDIT_API_KEY = claveAntes;
      }
    });

    it('el DNI no se repite entre cuentas: es lo único que se controla, así que se controla', async () => {
      const dni = dniNuevo();
      expect((await completar(await cuentaNueva(), dni)).status).toBe(200);
      const otra = await completar(await cuentaNueva(), dni);
      expect(otra.status).toBe(400);
      expect(otra.body.code).toBe('DNI_EN_USO');
    });

    it('con Didit encendido y con claves, sin pasar por Didit sigue sin poder completarse', async () => {
      const claveAntes = process.env.DIDIT_API_KEY;
      process.env.DIDIT_API_KEY = 'clave-de-prueba';
      encender();
      try {
        const r = await completar(await cuentaNueva(), dniNuevo());
        expect(r.status).toBe(409);
        expect(r.body.code).toBe('IDENTIDAD_PENDIENTE');
      } finally {
        if (claveAntes === undefined) delete process.env.DIDIT_API_KEY;
        else process.env.DIDIT_API_KEY = claveAntes;
      }
    });

    it('no se ofrece Didit ni la carga de fotos: kyc/start y dni-photos responden que por ahora no hace falta', async () => {
      const u = await cuentaNueva();
      const inicio = await request(app).post('/api/auth/kyc/start').set(con(u)).send({});
      expect(inicio.status).toBe(409);
      expect(inicio.body.code).toBe('VERIFICACION_APAGADA');
      expect(inicio.body.message).toMatch(/número de DNI/);
      const fotos = await request(app).post('/api/auth/dni-photos').set(con(u)).send({});
      expect(fotos.status).toBe(403);
      expect(fotos.body.code).toBe('VERIFICACION_APAGADA');
    });

    it('/auth/me dice si Didit está encendido y si la cuenta ya puede publicar, postularse y cobrar', async () => {
      const u = await cuentaNueva();
      const antes = await request(app).get('/api/auth/me').set(con(u));
      expect(antes.body.user.capabilities).toMatchObject({ verificacionConDidit: false, manualKyc: false, identidadSuficiente: false });
      expect((await completar(u, dniNuevo())).status).toBe(200);
      const despues = await request(app).get('/api/auth/me').set(con(u));
      expect(despues.body.user.capabilities).toMatchObject({ verificacionConDidit: false, manualKyc: false, identidadSuficiente: true });
      expect(despues.body.user.dniVerified).toBe(false);
      encender();
      const conDidit = await request(app).get('/api/auth/me').set(con(u));
      expect(conDidit.body.user.capabilities).toMatchObject({ verificacionConDidit: true, identidadSuficiente: false });
    });
  });

  describe('la puerta de publicar, postularse y cobrar (requireKyc)', () => {
    it('con el registro pendiente no pasa y el mensaje pide el DNI, no «verificar con Didit»', async () => {
      const u = await cuentaNueva();
      const r = await request(app).get('/puerta').set(con(u));
      expect(r.status).toBe(403);
      expect(r.body.code).toBe('KYC_REQUIRED');
      expect(r.body.message).toMatch(/número de DNI/);
    });

    it('con el registro completo y su DNI pasa, sin estar verificada', async () => {
      const u = await cuentaNueva();
      expect((await completar(u, dniNuevo())).status).toBe(200);
      expect((await request(app).get('/puerta').set(con(u))).status).toBe(200);
    });

    it('con Didit encendido, el DNI solo no alcanza: hay que estar verificada', async () => {
      const u = await cuentaNueva();
      expect((await completar(u, dniNuevo())).status).toBe(200);
      encender();
      const r = await request(app).get('/puerta').set(con(u));
      expect(r.status).toBe(403);
      expect(r.body.message).toMatch(/verificar tu identidad/);
      await User.update({ dniVerified: true }, { where: { id: u.id } });
      expect((await request(app).get('/puerta').set(con(u))).status).toBe(200);
    });
  });

  describe('módulo del panel «Verificación de identidad con Didit» (identity:didit)', () => {
    let dueno: any, admin: any;
    let appModulos: Express;
    const claveAntes = process.env.DIDIT_API_KEY;
    const filaDelModulo = () => ModuleConfig.findByPk(MODULO_VERIFICACION_DIDIT);

    beforeAll(async () => {
      appModulos = express();
      appModulos.use(express.json());
      appModulos.use('/api/admin/modules', (await import('../../server/routes/admin/modules.js')).default);
      dueno = await crearUsuario({ role: 'admin', adminRole: 'owner' });
      admin = await crearUsuario({ role: 'admin', adminRole: 'admin' });
    });

    beforeEach(async () => {
      fijarVerificacionConDidit(null);
      await ModuleConfig.destroy({ where: { moduleId: MODULO_VERIFICACION_DIDIT } });
      delete process.env.DIDIT_API_KEY;
    });

    afterAll(async () => {
      fijarVerificacionConDidit(null);
      if (claveAntes === undefined) delete process.env.DIDIT_API_KEY;
      else process.env.DIDIT_API_KEY = claveAntes;
      try {
        await ModuleConfig.destroy({ where: { moduleId: MODULO_VERIFICACION_DIDIT } });
        await AuditLog.destroy({ where: { performedBy: dueno.id } as any });
        await User.destroy({ where: { id: [dueno.id, admin.id] }, force: true });
      } catch {
        /* la limpieza no puede hacer fallar el test */
      }
    });

    it('al abrir el panel por primera vez aparece apagado y SIN cambiar lo que rige hoy (se siembra con el valor actual)', async () => {
      const r = await request(appModulos).get('/api/admin/modules').set(con(dueno));
      expect(r.status).toBe(200);
      const m = r.body.modules.find((x: any) => x.moduleId === MODULO_VERIFICACION_DIDIT);
      expect(m).toMatchObject({ category: 'identity', isActive: false });
      expect(m.name).toMatch(/Didit/);
      expect((await filaDelModulo())?.isActive).toBe(false);
      // Con la variable de arranque encendida, el panel NO lo apaga por abrirse: se siembra encendido.
      await ModuleConfig.destroy({ where: { moduleId: MODULO_VERIFICACION_DIDIT } });
      encender();
      await request(appModulos).get('/api/admin/modules').set(con(dueno));
      expect((await filaDelModulo())?.isActive).toBe(true);
    });

    it('solo el dueño lo cambia: un administrador recibe 403 y nada se toca', async () => {
      await request(appModulos).get('/api/admin/modules').set(con(dueno));
      process.env.DIDIT_API_KEY = 'clave-de-prueba';
      const r = await request(appModulos).patch(`/api/admin/modules/${MODULO_VERIFICACION_DIDIT}`).set(con(admin)).send({ isActive: true });
      expect(r.status).toBe(403);
      expect((await filaDelModulo())?.isActive).toBe(false);
      expect(verificacionConDiditActiva()).toBe(false);
    });

    it('no se puede encender si Didit no tiene sus claves en el servidor (409) y sigue apagado', async () => {
      await request(appModulos).get('/api/admin/modules').set(con(dueno));
      const r = await request(appModulos).patch(`/api/admin/modules/${MODULO_VERIFICACION_DIDIT}`).set(con(dueno)).send({ isActive: true });
      expect(r.status).toBe(409);
      expect(r.body.code).toBe('DIDIT_SIN_CLAVES');
      expect((await filaDelModulo())?.isActive).toBe(false);
    });

    it('el dueño lo enciende y apaga desde el panel: rige al instante (aunque la variable diga otra cosa) y queda anotado', async () => {
      await request(appModulos).get('/api/admin/modules').set(con(dueno));
      process.env.DIDIT_API_KEY = 'clave-de-prueba';
      expect(verificacionConDiditActiva()).toBe(false); // la variable de arranque está apagada

      const encendido = await request(appModulos).patch(`/api/admin/modules/${MODULO_VERIFICACION_DIDIT}`).set(con(dueno)).send({ isActive: true });
      expect(encendido.status).toBe(200);
      expect(verificacionConDiditActiva()).toBe(true);
      // El asiento lleva el id del módulo en `targetIdentifier` (texto): `targetId` es UUID y ahí el INSERT fallaba en silencio.
      expect(await AuditLog.count({ where: { performedBy: dueno.id, action: 'module_enabled', targetIdentifier: MODULO_VERIFICACION_DIDIT } as any })).toBe(1);

      const apagado = await request(appModulos).patch(`/api/admin/modules/${MODULO_VERIFICACION_DIDIT}`).set(con(dueno)).send({ isActive: false });
      expect(apagado.status).toBe(200);
      expect(verificacionConDiditActiva()).toBe(false);
      expect(await AuditLog.count({ where: { performedBy: dueno.id, action: 'module_disabled', targetIdentifier: MODULO_VERIFICACION_DIDIT } as any })).toBe(1);
    });

    it('rechaza un valor que no es verdadero o falso', async () => {
      await request(appModulos).get('/api/admin/modules').set(con(dueno));
      const r = await request(appModulos).patch(`/api/admin/modules/${MODULO_VERIFICACION_DIDIT}`).set(con(dueno)).send({ isActive: 'si' });
      expect(r.status).toBe(400);
    });

    it('cargarVerificacionDelPanel (arranque y refresco) lleva el estado del módulo; sin fila vuelve a valer la variable de arranque', async () => {
      expect(await cargarVerificacionDelPanel()).toBeNull();
      expect(verificacionConDiditActiva()).toBe(false);
      await ModuleConfig.create({ moduleId: MODULO_VERIFICACION_DIDIT, category: 'identity', name: 'Didit', isActive: true } as any);
      expect(await cargarVerificacionDelPanel()).toBe(true);
      expect(verificacionConDiditActiva()).toBe(true);
      await ModuleConfig.update({ isActive: false }, { where: { moduleId: MODULO_VERIFICACION_DIDIT } });
      expect(await cargarVerificacionDelPanel()).toBe(false);
      expect(verificacionConDiditActiva()).toBe(false);
      await ModuleConfig.destroy({ where: { moduleId: MODULO_VERIFICACION_DIDIT } });
      encender();
      expect(await cargarVerificacionDelPanel()).toBeNull();
      expect(verificacionConDiditActiva()).toBe(true);
    });
  });

  describe('aprobación manual de un administrador', () => {
    it('con Didit apagado se puede aprobar a mano (es la única forma de verificar a alguien) y la descripción lo dice', () => {
      const permiso = permisoParaAprobarAMano({ dniVerified: false, registrationPending: false, kycAttempts: 0 });
      expect(permiso).toMatchObject({ permitido: true, motivo: 'didit_sin_configurar' });
      expect(permiso.descripcion).toMatch(/apagado o sin configurar/);
    });
  });
});
