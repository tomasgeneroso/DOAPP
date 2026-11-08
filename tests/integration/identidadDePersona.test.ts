import { describe, it, expect, beforeAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Una persona, una cuenta (2026-11-06).
 *
 * El caso que lo motivó: el dueño pudo verificarse con cuatro documentos (DNI y pasaporte argentinos, DNI y pasaporte italianos) y abrir cuatro cuentas, porque
 * solo se guardaba una clave de identidad si el número tenía forma de DNI argentino. Ahora se guarda la clave de persona (apellido + nombre + fecha de nacimiento)
 * y una coincidencia deja una alerta para administración SIN frenar el registro; desde el panel se pueden unir las dos cuentas.
 */

jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));

import { AuditLog } from '../../server/models/sql/AuditLog.model.js';
import { Notification } from '../../server/models/sql/Notification.model.js';
import { User } from '../../server/models/sql/User.model.js';
import { aplicarIdentidadDeDidit } from '../../server/services/identidadDeDidit.js';
import { crearUsuario, crearTrabajo, crearContrato } from '../helpers/fixtures.js';

let n = 0;
const letras = (i: number) => String.fromCharCode(97 + (i % 26)) + String.fromCharCode(97 + (Math.floor(i / 26) % 26));
/** Una persona nueva: apellido único (solo letras: los números no cuentan para la clave) y la misma fecha de nacimiento. */
const persona = () => ({ first_name: 'Tomás', last_name: `Generoso${letras(++n)}`.replace(/\d/g, ''), date_of_birth: '1990-05-15' });
const conDni = (p: any, dni: string) => ({ status: 'Approved', id_verifications: [{ ...p, document_type: 'Identity Card', document_number: dni }] });
const conPasaporte = (p: any, numero: string) => ({ status: 'Approved', id_verifications: [{ ...p, document_type: 'Passport', document_number: numero }] });
let dniSeq = 41_000_000;

describe('una persona, una cuenta', () => {
  let app: Express;
  let admin: any, soporte: any;
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const lista = (q = '') => request(app).get(`/api/admin/hubs/identidad-a-revisar${q}`).set(con(admin));
  const unir = (cuerpo: any, quien = admin) => request(app).post('/api/admin/hubs/identidad-a-revisar/unir').set(con(quien)).send(cuerpo);

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/admin/hubs', (await import('../../server/routes/admin/hubs.js')).default);
    app.use('/api/auth', (await import('../../server/routes/auth.js')).default);
    admin = await crearUsuario({ role: 'admin', adminRole: 'admin' });
    soporte = await crearUsuario({ role: 'admin', adminRole: 'support' });
  });

  /** Dos cuentas de la misma persona: la primera con su DNI argentino, la segunda con su pasaporte italiano. */
  async function dosCuentasDeLaMismaPersona() {
    const p = persona();
    const a: any = await crearUsuario({ name: 'Cuenta Argentina', dni: String(++dniSeq), dniVerified: true });
    const b: any = await crearUsuario({ name: 'Cuenta Italiana', dniVerified: true });
    await aplicarIdentidadDeDidit(a, conDni(p, String(dniSeq)));
    await aplicarIdentidadDeDidit(b, conPasaporte(p, 'YA1234567'));
    return { p, a: await User.findByPk(a.id), b: await User.findByPk(b.id) } as { p: any; a: any; b: any };
  }

  describe('la clave de persona y la alerta', () => {
    it('un pasaporte (que no tiene forma de DNI argentino) deja clave de persona, y no guarda el nombre ni la fecha en claro', async () => {
      const { p, b } = await dosCuentasDeLaMismaPersona();
      expect(b.identityKey).toMatch(/^[0-9a-f]{64}$/);
      expect(b.identityKey).not.toContain(p.last_name.toUpperCase());
      expect(b.identityKey).not.toContain('1990');
    });

    it('los documentos de la misma persona dan la misma huella y dejan UNA alerta (la segunda cuenta avisa; la primera no tenía con quién coincidir)', async () => {
      const { a, b } = await dosCuentasDeLaMismaPersona();
      expect(a.identityKey).toBe(b.identityKey);
      const alertas = await AuditLog.findAll({ where: { action: 'IDENTIDAD_POSIBLE_DUPLICADA', targetId: [String(a.id), String(b.id)] } as any });
      expect(alertas).toHaveLength(1);
      expect(String((alertas[0] as any).targetId)).toBe(String(b.id));
      expect((alertas[0] as any).metadata.otraCuenta).toBe(String(a.id));
    });

    it('el registro NO se frena: la cuenta sigue verificada y nada de su estado cambió', async () => {
      const { b } = await dosCuentasDeLaMismaPersona();
      expect(b.dniVerified).toBe(true);
      expect(b.mergedIntoId).toBeNull();
    });

    it('la alerta no lleva el nombre ni la fecha de nacimiento: solo ids (nada personal en el registro)', async () => {
      const { p, a, b } = await dosCuentasDeLaMismaPersona();
      const alertas = await AuditLog.findAll({ where: { action: 'IDENTIDAD_POSIBLE_DUPLICADA', targetId: [String(a.id), String(b.id)] } as any });
      const texto = JSON.stringify(alertas.map((x: any) => ({ d: x.description, m: x.metadata })));
      expect(texto).not.toContain(p.last_name);
      expect(texto).not.toContain('1990-05-15');
    });

    it('consultar el estado de Didit varias veces no repite la alerta ni el aviso a administración', async () => {
      const { p, a, b } = await dosCuentasDeLaMismaPersona();
      for (let i = 0; i < 4; i++) await aplicarIdentidadDeDidit(b, conPasaporte(p, 'YA1234567'));
      expect(await AuditLog.count({ where: { action: 'IDENTIDAD_POSIBLE_DUPLICADA', targetId: [String(a.id), String(b.id)] } as any })).toBe(1);
      expect(await Notification.count({ where: { recipientId: admin.id, relatedId: String(b.id) } as any })).toBe(1);
    });

    it('otra fecha de nacimiento u otro nombre: no hay alerta (dos personas distintas)', async () => {
      const p = persona();
      const a: any = await crearUsuario({ name: 'Una' });
      const b: any = await crearUsuario({ name: 'Otra' });
      await aplicarIdentidadDeDidit(a, conPasaporte(p, 'AB1111111'));
      await aplicarIdentidadDeDidit(b, conPasaporte({ ...p, date_of_birth: '1990-05-16' }, 'AB2222222'));
      expect(await AuditLog.count({ where: { action: 'IDENTIDAD_POSIBLE_DUPLICADA', targetId: [String(a.id), String(b.id)] } as any })).toBe(0);
    });

    it('un documento sin fecha de nacimiento no arma clave (mejor ninguna que una floja)', async () => {
      const p = persona();
      const a: any = await crearUsuario();
      await aplicarIdentidadDeDidit(a, { status: 'Approved', id_verifications: [{ first_name: p.first_name, last_name: p.last_name, document_number: 'ZZ9999999' }] });
      expect((await User.findByPk(a.id) as any).identityKey).toBeNull();
    });
  });

  describe('el barrido de las cuentas que ya existían', () => {
    it('la vista previa encuentra el grupo y NO escribe nada; con --aplicar guarda las claves y deja la alerta (una sola vez)', async () => {
      const { detectarDuplicadosExistentes } = await import('../../server/services/identidadDePersona.js');
      const p = persona();
      const x: any = await crearUsuario({ name: 'Vieja Argentina' });
      const y: any = await crearUsuario({ name: 'Vieja Italiana' });
      // Cuentas verificadas ANTES de que existiera la clave: tienen los datos de Didit guardados pero no la huella.
      await User.update({ kycData: conDni(p, '30111222') } as any, { where: { id: x.id } });
      await User.update({ kycData: conPasaporte(p, 'IT7654321') } as any, { where: { id: y.id } });

      const salida: string[] = [];
      const previa = await detectarDuplicadosExistentes({ aplicar: false }, (t) => salida.push(t));
      expect(previa.grupos).toBeGreaterThanOrEqual(1);
      expect(previa.aplicado).toBe(false);
      expect(((await User.findByPk(x.id)) as any).identityKey).toBeNull();
      expect(await AuditLog.count({ where: { action: 'IDENTIDAD_POSIBLE_DUPLICADA', targetId: [String(x.id), String(y.id)] } as any })).toBe(0);
      // No imprime nombres ni fechas: solo ids y el correo enmascarado.
      expect(salida.join('\n')).not.toContain(p.last_name);
      expect(salida.join('\n')).not.toContain('1990-05-15');
      expect(salida.join('\n')).toContain(String(x.id));

      await detectarDuplicadosExistentes({ aplicar: true }, () => undefined);
      await detectarDuplicadosExistentes({ aplicar: true }, () => undefined); // de nuevo: no repite
      expect(((await User.findByPk(x.id)) as any).identityKey).toMatch(/^[0-9a-f]{64}$/);
      expect(await AuditLog.count({ where: { action: 'IDENTIDAD_POSIBLE_DUPLICADA', targetId: [String(x.id), String(y.id)] } as any })).toBe(1);
    });
  });

  describe('la lista de administración', () => {
    it('muestra la pareja UNA vez, como «misma persona», con las dos cuentas', async () => {
      const { a, b } = await dosCuentasDeLaMismaPersona();
      const r = await lista();
      expect(r.status).toBe(200);
      const filas = r.body.data.filter((c: any) => [String(a.id), String(b.id)].includes(c.userId) && c.tipo === 'misma_persona');
      expect(filas).toHaveLength(1);
      expect(filas[0]).toMatchObject({ userId: String(b.id), estado: 'pendiente', otraCuenta: { id: String(a.id), nombre: 'Cuenta Argentina' } });
    });

    it('marcarla revisada exige nota, la saca de la lista y NO toca los casos de DNI repetido de la misma cuenta', async () => {
      const { a, b } = await dosCuentasDeLaMismaPersona();
      const sinNota = await request(app).post(`/api/admin/hubs/identidad-a-revisar/${b.id}/revisar`).set(con(admin)).send({ tipo: 'misma_persona', otraCuentaId: String(a.id) });
      expect(sinNota.status).toBe(400);
      const ok = await request(app).post(`/api/admin/hubs/identidad-a-revisar/${b.id}/revisar`).set(con(admin)).send({ tipo: 'misma_persona', otraCuentaId: String(a.id), nota: 'Son homónimos con la misma fecha de nacimiento, verificado a mano.' });
      expect(ok.status).toBe(200);
      expect((await lista()).body.data.some((c: any) => c.userId === String(b.id) && c.tipo === 'misma_persona')).toBe(false);
      expect((await lista('?revisados=1')).body.data.find((c: any) => c.userId === String(b.id) && c.tipo === 'misma_persona')).toMatchObject({ estado: 'revisado' });
    });
  });

  describe('unir cuentas', () => {
    it('soporte no puede unir; sin nota, misma cuenta o cuentas que no existen son errores claros', async () => {
      const { a, b } = await dosCuentasDeLaMismaPersona();
      const nota = 'Es la misma persona: DNI argentino y pasaporte italiano.';
      expect((await unir({ principalId: String(a.id), secundariaId: String(b.id), nota }, soporte)).status).toBe(403);
      expect((await unir({ principalId: String(a.id), secundariaId: String(b.id) })).status).toBe(400);
      expect((await unir({ principalId: String(a.id), secundariaId: String(a.id), nota })).status).toBe(400);
      expect((await unir({ principalId: String(a.id), secundariaId: '00000000-0000-4000-8000-000000000000', nota })).status).toBe(404);
    });

    it('une: la secundaria queda unificada, deja de contar como una de las primeras y sus contratos libres se anulan (y queda anotado)', async () => {
      const { a, b } = await dosCuentasDeLaMismaPersona();
      await User.update({ isEarlyUser: true, earlyUserNumber: 7, freeContractsRemaining: 2 } as any, { where: { id: b.id } });
      const nota = 'Es la misma persona: DNI argentino y pasaporte italiano.';
      const r = await unir({ principalId: String(a.id), secundariaId: String(b.id), nota });
      expect(r.status).toBe(200);
      expect(r.body.anulado).toEqual({ esDeLasPrimerasCuentas: true, contratosLibres: 2 });

      const despues: any = await User.findByPk(b.id);
      expect(despues).toMatchObject({ mergedIntoId: String(a.id), isEarlyUser: false, freeContractsRemaining: 0 });
      expect(despues.mergedAt).toBeTruthy();
      expect(String(despues.mergedBy)).toBe(String(admin.id));

      const evento: any = await AuditLog.findOne({ where: { action: 'CUENTAS_UNIFICADAS', targetId: String(b.id) } as any });
      expect(evento).toBeTruthy();
      expect(String(evento.performedBy)).toBe(String(admin.id));
      expect(evento.metadata.nota).toBe(nota);
      expect(evento.metadata.anulado).toMatchObject({ isEarlyUser: true, freeContractsRemaining: 2 });
      expect(await Notification.count({ where: { recipientId: a.id, title: 'Unificamos tus cuentas' } as any })).toBe(1);
    });

    it('la pareja unida sale de la lista de pendientes', async () => {
      const { a, b } = await dosCuentasDeLaMismaPersona();
      await unir({ principalId: String(a.id), secundariaId: String(b.id), nota: 'Misma persona, se unen las cuentas.' });
      expect((await lista()).body.data.some((c: any) => [String(a.id), String(b.id)].includes(c.userId) && c.tipo === 'misma_persona')).toBe(false);
    });

    it('la cuenta unificada NO inicia sesión (con la contraseña correcta) y su sesión abierta se corta en el siguiente pedido', async () => {
      const { a, b } = await dosCuentasDeLaMismaPersona();
      await unir({ principalId: String(a.id), secundariaId: String(b.id), nota: 'Misma persona, se unen las cuentas.' });

      const login = await request(app).post('/api/auth/login').send({ email: b.email, password: 'password123' });
      expect(login.status).toBe(403);
      expect(login.body.code).toBe('CUENTA_UNIFICADA');

      const sesion = await request(app).get('/api/auth/me').set(con(b));
      expect(sesion.status).toBe(403);
      expect(sesion.body.code).toBe('CUENTA_UNIFICADA');

      // La principal sigue entrando con normalidad.
      expect((await request(app).get('/api/auth/me').set(con(a))).status).toBe(200);
    });

    it('con una contraseña incorrecta el mensaje NO revela que la cuenta está unificada (no se filtran qué correos existen)', async () => {
      const { b } = await dosCuentasDeLaMismaPersona();
      await User.update({ mergedIntoId: (await crearUsuario()).id } as any, { where: { id: b.id } });
      const login = await request(app).post('/api/auth/login').send({ email: b.email, password: 'incorrecta' });
      expect(login.status).toBe(401);
      expect(login.body.code).toBeUndefined();
    });

    it('si la cuenta a unir tiene saldo, un contrato sin terminar o un trabajo vivo, NO se une y dice qué falta resolver', async () => {
      const { a, b } = await dosCuentasDeLaMismaPersona();
      await User.update({ balanceArs: 500 } as any, { where: { id: b.id } });
      const trabajo = await crearTrabajo(b.id, { status: 'open' });
      const otro: any = await crearUsuario({ name: 'Trabajador' });
      await crearContrato({ jobId: trabajo.id, clientId: b.id, doerId: otro.id }, { status: 'in_progress' });

      const r = await unir({ principalId: String(a.id), secundariaId: String(b.id), nota: 'Misma persona, se unen las cuentas.' });
      expect(r.status).toBe(409);
      expect(r.body.motivos.join(' ')).toMatch(/saldo/);
      expect(r.body.motivos.join(' ')).toMatch(/contrato/);
      expect(r.body.motivos.join(' ')).toMatch(/trabajo/);
      expect(((await User.findByPk(b.id)) as any).mergedIntoId).toBeNull();
    });

    it('personas que no coinciden en la clave no se unen salvo que el administrador lo confirme (y queda anotado que lo confirmó él)', async () => {
      const a: any = await crearUsuario({ name: 'Una', dniVerified: true });
      const b: any = await crearUsuario({ name: 'Otra', dniVerified: true });
      await aplicarIdentidadDeDidit(a, conPasaporte(persona(), 'AA1111111'));
      await aplicarIdentidadDeDidit(b, conPasaporte(persona(), 'BB2222222'));
      const cuerpo = { principalId: String(a.id), secundariaId: String(b.id), nota: 'Mismo nombre escrito distinto en cada documento.' };
      const sin = await unir(cuerpo);
      expect(sin.status).toBe(409);
      expect(sin.body.motivos).toContain('no_coincide_la_clave');
      const con_ = await unir({ ...cuerpo, confirmarMismaPersona: true });
      expect(con_.status).toBe(200);
      const evento: any = await AuditLog.findOne({ where: { action: 'CUENTAS_UNIFICADAS', targetId: String(b.id) } as any });
      expect(evento.metadata).toMatchObject({ confirmadaPorElAdministrador: true, coincidiaLaClave: false });
    });

    it('no se unen cuentas del equipo de administración, ni baneadas, ni una ya unificada', async () => {
      const { a, b } = await dosCuentasDeLaMismaPersona();
      const nota = 'Misma persona, se unen las cuentas.';
      expect((await unir({ principalId: String(admin.id), secundariaId: String(b.id), nota, confirmarMismaPersona: true })).status).toBe(409);

      await User.update({ isBanned: true } as any, { where: { id: b.id } });
      expect((await unir({ principalId: String(a.id), secundariaId: String(b.id), nota })).status).toBe(409);
      await User.update({ isBanned: false } as any, { where: { id: b.id } });

      expect((await unir({ principalId: String(a.id), secundariaId: String(b.id), nota })).status).toBe(200);
      expect((await unir({ principalId: String(a.id), secundariaId: String(b.id), nota })).status).toBe(409);
    });

    it('la principal hereda la clave de persona si no la tenía (para detectar una tercera cuenta de la misma persona)', async () => {
      const p = persona();
      const a: any = await crearUsuario({ name: 'Principal sin clave' });
      const b: any = await crearUsuario({ name: 'Secundaria' });
      await aplicarIdentidadDeDidit(b, conPasaporte(p, 'CC3333333'));
      const r = await unir({ principalId: String(a.id), secundariaId: String(b.id), nota: 'Mismo nombre escrito distinto en cada documento.', confirmarMismaPersona: true });
      expect(r.status).toBe(200);
      expect(((await User.findByPk(a.id)) as any).identityKey).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});
