import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import bcrypt from 'bcryptjs';

/**
 * Login, registro, "olvidé mi contraseña" y reenvío de verificación.
 *
 *  - El login decía "No existe una cuenta con este email" o "Contraseña incorrecta" según el caso (y una cuenta
 *    inexistente respondía en milisegundos mientras una existente tardaba lo de bcrypt): se podía averiguar qué
 *    correos tienen cuenta.
 *  - El correo se buscaba tal cual: "Juan@x.com" no entraba aunque la cuenta existiera, y el registro con otra
 *    capitalización pasaba el control de duplicados y chocaba después con el índice único (un 500).
 *  - authLimiter no cuenta los pedidos exitosos: registro, "olvidé mi contraseña" (responde 200 siempre) y reenvío
 *    de verificación no tenían tope real; se podían crear cuentas en masa y llenarle la casilla a alguien.
 */

jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
const mockMail = jest.fn<(...a: unknown[]) => Promise<unknown>>();
jest.mock('../../server/services/email.js', () => ({
  __esModule: true,
  default: new Proxy({}, { get: () => (...a: unknown[]) => mockMail(...a) }),
}));

import { User } from '../../server/models/sql/User.model.js';

describe('autenticación: sin enumeración de cuentas, correo normalizado y con tope', () => {
  let app: Express;
  const creados: string[] = [];
  const CLAVE = 'password123';

  const login = (email: string, password = CLAVE) => request(app).post('/api/auth/login').send({ email, password });

  beforeAll(async () => {
    mockMail.mockResolvedValue(true);
    app = express();
    app.use(express.json());
    app.use('/api/auth', (await import('../../server/routes/auth.js')).default);
    const u: any = await User.create({
      email: 'existe@login.test', name: 'Persona existente', username: 'existelogin', password: CLAVE, role: 'client', isVerified: true,
    } as any);
    creados.push(u.id);
    const sinVerificar: any = await User.create({
      email: 'sinverificar@login.test', name: 'Sin verificar', username: 'sinverificarlogin', password: CLAVE, role: 'client', isVerified: false,
    } as any);
    creados.push(sinVerificar.id);
  });

  afterAll(async () => {
    try { await User.destroy({ where: { id: creados }, force: true }); } catch { /* ok */ }
    try { await User.destroy({ where: { email: ['dup@login.test', 'nuevo@login.test'] }, force: true }); } catch { /* ok */ }
  });

  describe('login', () => {
    it('contraseña mal en una cuenta que existe, y correo que no existe: la MISMA respuesta (no se sabe cuál es cuál)', async () => {
      const malaClave = await login('existe@login.test', 'otra-clave-equivocada');
      const sinCuenta = await login('no-existe-nadie@login.test', 'otra-clave-equivocada');
      expect(malaClave.status).toBe(401);
      expect(sinCuenta.status).toBe(401);
      expect(sinCuenta.body).toEqual(malaClave.body);
      expect(malaClave.body.message).toBe('Email o contraseña incorrectos');
      expect(JSON.stringify(sinCuenta.body)).not.toMatch(/no existe/i);
    });

    it('una cuenta inexistente también hace el trabajo de bcrypt (el tiempo de respuesta no delata)', async () => {
      const espiar = jest.spyOn(bcrypt, 'compare');
      try {
        await login('no-existe-nadie@login.test');
        await login('existe@login.test', 'mala');
        const llamadas = espiar.mock.calls.length;
        expect(llamadas).toBe(2); // una por intento, exista o no la cuenta
      } finally {
        espiar.mockRestore();
      }
    });

    it('ingresa con el correo en otra capitalización', async () => {
      const r = await login('EXISTE@Login.Test');
      expect(r.status).toBe(200);
      expect(r.body.success).toBe(true);
    });

    it('con la contraseña correcta y la cuenta sin verificar sigue pidiendo verificar el correo (403)', async () => {
      const r = await login('sinverificar@login.test');
      expect(r.status).toBe(403);
      expect(r.body.emailNotVerified).toBe(true);
    });

    it('un cuerpo raro no rompe ni revela nada', async () => {
      for (const cuerpo of [{ email: 'existe@login.test' }, { password: 'x' }, { email: ['a@b.c'], password: 'x' }, {}]) {
        const r = await request(app).post('/api/auth/login').send(cuerpo as any);
        expect([JSON.stringify(cuerpo), r.status]).toEqual([JSON.stringify(cuerpo), 400]);
      }
    });
  });

  describe('registro', () => {
    const registrar = (email: string, username: string) =>
      request(app).post('/api/auth/register').send({ name: 'Persona Nueva', username, email, password: CLAVE, dni: '12345678', termsAccepted: true });

    it('un correo ya registrado con OTRA capitalización es un 400 claro, no un 500 de base de datos', async () => {
      const u: any = await User.create({ email: 'dup@login.test', name: 'Dup', username: 'dupuserx', password: CLAVE, role: 'client' } as any);
      creados.push(u.id);
      const r = await registrar('DUP@Login.Test', 'otro.usuario');
      expect(r.status).toBe(400);
      expect(r.body.message).toBe('El email ya está registrado');
    });
  });

  describe('topes de pedidos que mandan correos', () => {
    it('reenviar la verificación al MISMO correo más de 3 veces por hora: 429', async () => {
      const estados: number[] = [];
      for (let i = 0; i < 4; i++) {
        estados.push((await request(app).post('/api/auth/resend-verification').send({ email: 'sinverificar@login.test' })).status);
      }
      expect(estados).toEqual([200, 200, 200, 429]);
    });

    it('"olvidé mi contraseña" para el mismo correo: también 429 al cuarto pedido', async () => {
      const estados: number[] = [];
      for (let i = 0; i < 4; i++) {
        estados.push((await request(app).post('/api/auth/forgot-password').send({ email: 'existe@login.test' })).status);
      }
      expect(estados[3]).toBe(429);
      expect(estados.slice(0, 3).every((s) => s === 200)).toBe(true);
    });

    it('desde una misma IP, aunque cambie el correo en cada pedido, hay un tope por hora', async () => {
      let bloqueado = false;
      for (let i = 0; i < 25 && !bloqueado; i++) {
        const r = await request(app).post('/api/auth/resend-verification').send({ email: `bombardeo${i}@login.test` });
        if (r.status === 429) bloqueado = true;
      }
      expect(bloqueado).toBe(true);
    });
  });
});
