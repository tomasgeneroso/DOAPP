import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';

/**
 * Código de familia (regla del dueño, 2026-11-12): se puede poner al registrarse (con o sin «FAM-», en minúsculas, con espacios), con la cuenta ya creada
 * (también las de Google o X) y un código que no es de nadie da un mensaje claro. Antes el registro lo trataba como código de REFERIDO y respondía
 * «Código de referido inválido» aunque el código fuera bueno.
 */
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));

import { User } from '../../server/models/sql/User.model.js';
import { FamilyCode } from '../../server/models/sql/FamilyCode.model.js';
import { normalizarCodigoDeFamilia } from '../../server/services/codigoDeFamilia.js';
import { crearUsuario } from '../helpers/fixtures.js';

describe('código de familia', () => {
  let app: Express;
  let n = 0;
  const emails: string[] = [];
  const codigos: string[] = [];
  let duenoId = '';
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const dniNuevo = () => String(46000000 + Math.floor(Math.random() * 2000000) + n++);
  const codigoNuevo = async () => {
    const code = FamilyCode.generateCode();
    codigos.push(code);
    await FamilyCode.create({ firstName: 'Prueba', lastName: 'Familia', code, createdById: duenoId } as never);
    return code;
  };
  const registrar = (referralCode?: string) => {
    const email = `fam${Date.now().toString(36)}${n++}@registro.test`;
    emails.push(email);
    return request(app).post('/api/auth/register').send({
      name: 'Ana Prueba', username: `fam${Date.now().toString(36)}${n++}`, email, password: 'password123', dni: dniNuevo(), termsAccepted: true, sinSesion: true, referralCode,
    }).then((r) => ({ r, email }));
  };

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/auth', (await import('../../server/routes/auth.js')).default);
    const dueno: any = await crearUsuario({ email: `duenofam${Date.now().toString(36)}@registro.test` } as never);
    duenoId = dueno.id;
    emails.push(dueno.email);
  });

  afterAll(async () => {
    try {
      await User.update({ familyCodeId: null } as never, { where: { email: emails } });
      await FamilyCode.destroy({ where: { code: codigos }, force: true } as never);
      await User.destroy({ where: { email: emails }, force: true });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  it('el código se reconoce con o sin FAM-, en minúsculas y con espacios o guiones de más; lo que no puede ser un código da null', () => {
    expect(normalizarCodigoDeFamilia('FAM-YG83BJJV')).toBe('FAM-YG83BJJV');
    expect(normalizarCodigoDeFamilia('yg83bjjv')).toBe('FAM-YG83BJJV');
    expect(normalizarCodigoDeFamilia(' fam yg83 bjjv ')).toBe('FAM-YG83BJJV');
    expect(normalizarCodigoDeFamilia('FAM–YG83–BJJV')).toBe('FAM-YG83BJJV');
    expect(normalizarCodigoDeFamilia('YG83BJJ')).toBeNull(); // 7
    expect(normalizarCodigoDeFamilia('YG83BJJ0')).toBeNull(); // el 0 no existe en el alfabeto
    expect(normalizarCodigoDeFamilia(null)).toBeNull();
    expect(normalizarCodigoDeFamilia(12345678)).toBeNull();
  });

  it('al registrarse con el código completo, la cuenta nace con el Plan Familia (0%) y el código queda usado', async () => {
    const code = await codigoNuevo();
    const { r, email } = await registrar(code);
    expect(r.status).toBe(201);
    expect(r.body.familia).toMatchObject({ aplicada: true });
    const u: any = await User.findOne({ where: { email } });
    expect(u.hasFamilyPlan).toBe(true);
    expect(Number(u.currentCommissionRate)).toBe(0);
    const fila: any = await FamilyCode.findOne({ where: { code } });
    expect(fila.usedById).toBe(u.id);
  });

  it('al registrarse con el código SIN «FAM-» y en minúsculas también funciona (lo que escribía el dueño)', async () => {
    const code = await codigoNuevo();
    const { r, email } = await registrar(code.replace('FAM-', '').toLowerCase());
    expect(r.status).toBe(201);
    expect(r.body.familia).toMatchObject({ aplicada: true });
    expect(((await User.findOne({ where: { email } })) as any).hasFamilyPlan).toBe(true);
  });

  it('un código que no es de nadie se rechaza con un mensaje claro y NO crea la cuenta', async () => {
    const { r, email } = await registrar('ZZZZ2222');
    expect(r.status).toBe(400);
    expect(r.body.field).toBe('referralCode');
    expect(r.body.message).toMatch(/no es válido o ya no se puede usar/);
    expect(await User.findOne({ where: { email } })).toBeNull();
  });

  it('un código de familia ya usado tampoco sirve para registrarse', async () => {
    const code = await codigoNuevo();
    expect((await registrar(code)).r.status).toBe(201);
    const segundo = await registrar(code);
    expect(segundo.r.status).toBe(400);
    expect(await User.findOne({ where: { email: segundo.email } })).toBeNull();
  });

  it('con la cuenta ya creada (también una de Google o X) se activa desde /activate-family-code, con o sin FAM-', async () => {
    const code = await codigoNuevo();
    const u: any = await crearUsuario({ email: `social${Date.now().toString(36)}${n++}@registro.test`, registrationPending: true } as never);
    emails.push(u.email);
    const r = await request(app).post('/api/auth/activate-family-code').set(con(u)).send({ code: code.replace('FAM-', '').toLowerCase() });
    expect(r.status).toBe(200);
    expect(((await User.findByPk(u.id)) as any).hasFamilyPlan).toBe(true);
  });

  it('el canje cuenta qué pasó: ya tiene plan, código usado o inexistente', async () => {
    const code = await codigoNuevo();
    const a: any = await crearUsuario({ email: `a${Date.now().toString(36)}${n++}@registro.test` } as never);
    const b: any = await crearUsuario({ email: `b${Date.now().toString(36)}${n++}@registro.test` } as never);
    emails.push(a.email, b.email);
    expect((await request(app).post('/api/auth/activate-family-code').set(con(a)).send({ code })).status).toBe(200);
    const otra = await request(app).post('/api/auth/activate-family-code').set(con(a)).send({ code: await codigoNuevo() });
    expect(otra.status).toBe(400);
    expect(otra.body.message).toMatch(/Ya tenés un plan familia/);
    const usado = await request(app).post('/api/auth/activate-family-code').set(con(b)).send({ code });
    expect(usado.status).toBe(400);
    expect(usado.body.message).toMatch(/ya fue utilizado/);
    const nada = await request(app).post('/api/auth/activate-family-code').set(con(b)).send({ code: 'FAM-ZZZZ2222' });
    expect(nada.status).toBe(404);
  });
});
