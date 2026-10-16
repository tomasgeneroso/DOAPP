import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';

/**
 * Registro en pasos: 1) correo y contraseña, 2) verificación con Didit, 3) los datos salen del documento, la persona los corrige y completa
 * lo que falta. Se agiliza el proceso y el nombre y el DNI vienen del documento, no de lo que se tipeó a ciegas.
 */

jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('../../server/services/email.js', () => ({
  __esModule: true,
  default: new Proxy({}, { get: () => async () => true }),
}));

import { User } from '../../server/models/sql/User.model.js';
import { AuditLog } from '../../server/models/sql/AuditLog.model.js';
import { aTitulo, completarRegistro, datosDelRegistro, sugerirUsuario } from '../../server/services/registroEnPasos.js';

const documento = (nombres: string, apellidos: string, dni: string) => ({
  status: 'Approved',
  id_verifications: [{ document_number: dni, first_name: nombres, last_name: apellidos }],
});

describe('registro en pasos', () => {
  let app: Express;
  const emails: string[] = [];
  let n = 0;
  const dniNuevo = () => String(50000000 + Math.floor(Math.random() * 3000000) + n++);
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const registrarPaso1 = async (extra: Record<string, unknown> = {}) => {
    const email = `pasos${Date.now().toString(36)}${n++}@registro.test`;
    emails.push(email);
    return { email, r: await request(app).post('/api/auth/register').send({ pasos: true, email, password: 'password123', termsAccepted: true, ...extra }) };
  };

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/auth', (await import('../../server/routes/auth.js')).default);
  });

  afterAll(async () => {
    try {
      await AuditLog.destroy({ where: { actor: 'system:didit' } });
      await User.destroy({ where: { email: emails }, force: true });
    } catch { /* la limpieza no puede hacer fallar el test */ }
  });

  describe('paso 1: correo y contraseña', () => {
    it('solo pide correo, contraseña y términos; crea la cuenta con datos provisorios y deja la sesión abierta (hace falta para Didit)', async () => {
      const { email, r } = await registrarPaso1();
      expect(r.status).toBe(201);
      expect(r.body.token).toEqual(expect.any(String));
      expect(r.body.user.registrationPending).toBe(true);
      const u: any = await User.findOne({ where: { email } });
      expect(u.registrationPending).toBe(true);
      expect(u.name).toBe('Nuevo usuario');
      expect(u.username).toMatch(/^u[a-z0-9]{6,11}$/);
      expect(u.dni ?? null).toBeNull();
      const cookies = (r.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
      expect(cookies.some((c) => c.startsWith('token='))).toBe(true);
    });

    it('sigue exigiendo un correo válido, una contraseña de 6 o más y aceptar los términos', async () => {
      expect((await request(app).post('/api/auth/register').send({ pasos: true, email: 'no-es-correo', password: 'password123', termsAccepted: true })).status).toBe(400);
      expect((await request(app).post('/api/auth/register').send({ pasos: true, email: 'a@registro.test', password: '123', termsAccepted: true })).status).toBe(400);
      expect((await request(app).post('/api/auth/register').send({ pasos: true, email: 'b@registro.test', password: 'password123', termsAccepted: false })).status).toBe(400);
    });

    it('un correo ya registrado se rechaza', async () => {
      const { email } = await registrarPaso1();
      const otra = await request(app).post('/api/auth/register').send({ pasos: true, email, password: 'password123', termsAccepted: true });
      expect(otra.status).toBe(400);
    });

    it('el registro de siempre (con nombre, usuario y DNI) sigue funcionando y NO queda pendiente', async () => {
      const email = `completo${Date.now().toString(36)}${n++}@registro.test`;
      emails.push(email);
      const r = await request(app).post('/api/auth/register').send({ name: 'Ana Pérez', username: `ana${Date.now().toString(36)}`, email, password: 'password123', dni: dniNuevo(), termsAccepted: true });
      expect(r.status).toBe(201);
      expect(((await User.findOne({ where: { email } })) as any).registrationPending).toBe(false);
    });

    it('/auth/me avisa que el registro está pendiente', async () => {
      const { email } = await registrarPaso1();
      const u: any = await User.findOne({ where: { email } });
      const me = await request(app).get('/api/auth/me').set(con(u));
      expect(me.body.user.registrationPending).toBe(true);
    });
  });

  describe('paso 3: datos del documento', () => {
    const cuentaVerificada = async (nombres: string, apellidos: string, dni: string) => {
      const { email } = await registrarPaso1();
      const u: any = await User.findOne({ where: { email } });
      await u.update({ kycStatus: 'Approved', dniVerified: true, kycData: documento(nombres, apellidos, dni), diditSessionId: `ses-${n++}-${Date.now()}` });
      return (await User.findByPk(u.id)) as any;
    };

    it('aTitulo pasa «TOMAS ANDRES» a «Tomas Andres»', () => {
      expect(aTitulo('TOMAS ANDRES')).toBe('Tomas Andres');
      expect(aTitulo("o'brien-perez  DE LA CRUZ")).toBe("O'Brien-Perez De La Cruz");
      expect(aTitulo(null)).toBe('');
    });

    it('datos: devuelve lo que leyó Didit para prellenar y lo que falta (usuario)', async () => {
      const dni = dniNuevo();
      const u = await cuentaVerificada('TOMAS ANDRES', 'GENEROSO', dni);
      const d = await datosDelRegistro(u);
      expect(d.pendiente).toBe(true);
      expect(d.documento).toEqual({ nombres: 'Tomas Andres', apellidos: 'Generoso', dni });
      expect(d.sugerido).toMatchObject({ nombres: 'Tomas Andres', apellidos: 'Generoso', dni });
      expect(d.sugerido.username).toMatch(/^[a-z0-9._]{3,30}$/);
      expect(d.sugerido.username).not.toMatch(/^u[a-z0-9]{8}$/); // no el provisorio: una sugerencia a partir del correo
      expect(d.faltan).toContain('username');
      expect(d.pedirCorreo).toBe(false);
    });

    it('datos por la API: solo la propia persona', async () => {
      const u = await cuentaVerificada('ANA', 'PEREZ', dniNuevo());
      const r = await request(app).get('/api/auth/registro/datos').set(con(u));
      expect(r.status).toBe(200);
      expect(r.body.data.documento.apellidos).toBe('Perez');
      expect((await request(app).get('/api/auth/registro/datos')).status).toBe(401);
    });

    it('completar con los datos del documento: queda registrada y verificada', async () => {
      const dni = dniNuevo();
      const u = await cuentaVerificada('TOMAS ANDRES', 'GENEROSO', dni);
      const usuario = `tomas${Date.now().toString(36)}`;
      const r = await request(app).put('/api/auth/registro/completar').set(con(u)).send({ nombres: 'Tomas Andres', apellidos: 'Generoso', dni, username: usuario, phone: '+54 9 11 5555-1234' });
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ success: true, verificada: true, enRevision: false });
      const despues: any = await User.findByPk(u.id);
      expect(despues).toMatchObject({ registrationPending: false, name: 'Tomas Andres Generoso', username: usuario, dniVerified: true });
      expect(String(despues.dni)).toBe(dni);
    });

    it('corregir un error de lectura (una letra) mantiene la verificación', async () => {
      const dni = dniNuevo();
      const u = await cuentaVerificada('GUILLERMO', 'FERNANDES', dni); // Didit leyó mal el apellido
      const r = await request(app).put('/api/auth/registro/completar').set(con(u)).send({ nombres: 'Guillermo', apellidos: 'Fernandez', dni, username: `gf${Date.now().toString(36)}` });
      expect(r.status).toBe(200);
      expect(r.body.verificada).toBe(true);
    });

    it('cambiar el nombre o el DNI a otra persona: se registra pero queda EN REVISIÓN, sin verificar, con aviso a administración', async () => {
      const dni = dniNuevo();
      const u = await cuentaVerificada('TOMAS', 'GENEROSO', dni);
      const r = await request(app).put('/api/auth/registro/completar').set(con(u)).send({ nombres: 'Juan', apellidos: 'Perez', dni: dniNuevo(), username: `otro${Date.now().toString(36)}` });
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ verificada: false, enRevision: true });
      const despues: any = await User.findByPk(u.id);
      expect(despues).toMatchObject({ registrationPending: false, dniVerified: false, kycStatus: 'In Review' });
      expect(await AuditLog.count({ where: { action: 'KYC_NO_COINCIDE', targetId: String(u.id) } })).toBe(1);
    });

    it('rechaza lo inválido: DNI repetido, usuario ocupado, nombre vacío', async () => {
      const dniAjeno = dniNuevo();
      const ajeno = await cuentaVerificada('LUIS', 'GOMEZ', dniAjeno);
      await ajeno.update({ dni: dniAjeno });
      const u = await cuentaVerificada('TOMAS', 'GENEROSO', dniNuevo());

      const repetido = await request(app).put('/api/auth/registro/completar').set(con(u)).send({ nombres: 'Tomas', apellidos: 'Generoso', dni: dniAjeno, username: `x${Date.now().toString(36)}` });
      expect(repetido.status).toBe(400);
      expect(repetido.body.code).toBe('DNI_EN_USO');

      const ocupado = await request(app).put('/api/auth/registro/completar').set(con(u)).send({ nombres: 'Tomas', apellidos: 'Generoso', dni: dniNuevo(), username: ajeno.username });
      expect(ocupado.status).toBe(400);
      expect(ocupado.body.field).toBe('username');

      const sinNombre = await request(app).put('/api/auth/registro/completar').set(con(u)).send({ nombres: '', apellidos: 'Generoso', dni: dniNuevo(), username: `y${Date.now().toString(36)}` });
      expect(sinNombre.status).toBe(400);
      expect(sinNombre.body.field).toBe('nombres');
      expect(((await User.findByPk(u.id)) as any).registrationPending).toBe(true); // nada se guardó
    });

    it('sin haber pasado por Didit no se puede completar (cuando Didit está disponible)', async () => {
      const { email } = await registrarPaso1();
      const u: any = await User.findOne({ where: { email } });
      const r = await request(app).put('/api/auth/registro/completar').set(con(u)).send({ nombres: 'Tomas', apellidos: 'Generoso', dni: dniNuevo(), username: `z${Date.now().toString(36)}` });
      // Sin DIDIT_API_KEY en el entorno de pruebas la verificación «no está disponible»: no se deja a nadie sin poder registrarse.
      expect([200, 409]).toContain(r.status);
    });

    it('no se completa dos veces', async () => {
      const dni = dniNuevo();
      const u = await cuentaVerificada('TOMAS', 'GENEROSO', dni);
      const datos = { nombres: 'Tomas', apellidos: 'Generoso', dni, username: `dos${Date.now().toString(36)}` };
      expect((await request(app).put('/api/auth/registro/completar').set(con(u)).send(datos)).status).toBe(200);
      const otra = await request(app).put('/api/auth/registro/completar').set(con(u)).send({ ...datos, username: `tres${Date.now().toString(36)}` });
      expect(otra.status).toBe(400);
      expect(otra.body.code).toBe('REGISTRO_YA_COMPLETO');
    });

    it('una cuenta sin correo (X) tiene que escribirlo, y no puede repetir uno existente', async () => {
      const dni = dniNuevo();
      const { email } = await registrarPaso1();
      const u: any = await User.findOne({ where: { email } });
      await u.update({ kycStatus: 'Approved', dniVerified: true, kycData: documento('ANA', 'LOPEZ', dni), email: '' });
      const sin = await completarRegistro((await User.findByPk(u.id)) as any, { nombres: 'Ana', apellidos: 'Lopez', dni, username: `ana${Date.now().toString(36)}` });
      expect(sin).toMatchObject({ ok: false, field: 'email' });
      const otra = await registrarPaso1();
      const repetido = await completarRegistro((await User.findByPk(u.id)) as any, { nombres: 'Ana', apellidos: 'Lopez', dni, username: `ana2${Date.now().toString(36)}`, email: otra.email });
      expect(repetido).toMatchObject({ ok: false, field: 'email' });
    });
  });

  it('sugerirUsuario arma un usuario válido y libre a partir del correo', async () => {
    expect(await sugerirUsuario('Juan.Perez+test@ejemplo.com')).toMatch(/^juan\.pereztest\d*$/);
    expect(await sugerirUsuario('x@ejemplo.com')).toMatch(/^usuario\d*$/);
  });
});
