import { describe, it, expect, beforeAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * El DNI es la clave de la cuenta (no se repite) y el CUIL lleva el DNI adentro; los dos se completan con lo que Didit leyó.
 *
 *  - Registro: un DNI que ya usa otra cuenta se rechaza (antes solo lo revisaba «completar registro» de quienes entran con Google).
 *  - Configuración → Información legal: el DNI no se puede repetir ni cambiar una vez verificado con Didit; el CUIL tiene que ser
 *    un CUIL de verdad (dígito verificador) y coincidir con el DNI.
 *  - Didit: al aprobarse, el DNI y el CUIL del documento completan la cuenta; si ese DNI ya lo usa otra cuenta no se toca nada.
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
import { aplicarIdentidadDeDidit, extraerIdentidad } from '../../server/services/identidadDeDidit.js';
import { crearUsuario } from '../helpers/fixtures.js';
import { digitoVerificador } from '../../shared/identidad/documentos.js';

// Cada test usa sus propios DNI: el DNI no se repite (índice único), así que los fijos chocarían entre tests.
let n = 0;
const dniNuevo = () => String(40_000_000 + ++n * 7919 + Math.floor(Math.random() * 1000));
/** CUIL válido para un DNI: prefijo + DNI de 8 dígitos + dígito verificador (si ese prefijo no tiene, prueba el siguiente). */
const cuilDe = (dni: string, prefijos = ['20', '27', '23', '24']) => {
  for (const p of prefijos) {
    const base = `${p}${dni.padStart(8, '0')}`;
    const d = digitoVerificador(base);
    if (d !== null) return `${base}${d}`;
  }
  throw new Error('sin CUIL posible para ' + dni);
};
const decision = (dni: string, extra: Record<string, unknown> = {}) => ({ status: 'Approved', id_verifications: [{ document_number: dni, first_name: 'Ana', last_name: 'Pérez', ...extra }] });

describe('DNI y CUIL', () => {
  let app: Express;
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const guardar = (u: any, body: Record<string, unknown>) => request(app).put('/api/auth/settings').set(con(u)).send(body);
  const recargar = (u: any) => User.findByPk(u.id) as Promise<any>;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/auth', (await import('../../server/routes/auth.js')).default);
  });

  describe('registro', () => {
    const registrar = (dni: string, extra: Record<string, unknown> = {}) => {
      const k = `${Date.now().toString(36)}${n++}`;
      return request(app).post('/api/auth/register').send({ name: 'Persona Nueva', username: `nuevo${k}`, email: `nuevo${k}@dni.test`, password: 'password123', dni, termsAccepted: true, ...extra });
    };

    it('un DNI que ya usa otra cuenta se rechaza, y el primero entra', async () => {
      const dni = dniNuevo();
      const primero = await registrar(dni);
      expect(primero.status).toBe(201);
      const repetido = await registrar(dni);
      expect(repetido.status).toBe(400);
      expect(repetido.body.code).toBe('DNI_EN_USO');
      expect(repetido.body.field).toBe('dni'); // la pantalla marca el campo
      expect(await User.count({ where: { dni } })).toBe(1);
    });

    it('sin DNI o con un DNI mal escrito, no se registra', async () => {
      expect((await registrar('')).status).toBe(400);
      expect((await registrar('12ab5678')).status).toBe(400);
      expect((await registrar('123')).status).toBe(400);
    });
  });

  describe('configuración → información legal', () => {
    it('el DNI de otra cuenta no se puede tomar', async () => {
      const dni = dniNuevo();
      await crearUsuario({ dni });
      const yo = await crearUsuario({});
      const r = await guardar(yo, { dni });
      expect(r.status).toBe(400);
      expect(r.body.code).toBe('DNI_EN_USO');
      expect((await recargar(yo)).dni ?? null).toBeNull();
    });

    it('cargar el propio DNI (con puntos) lo guarda sin puntos y queda anotado', async () => {
      const yo = await crearUsuario({});
      const dni = dniNuevo();
      const r = await guardar(yo, { dni: `${dni.slice(0, 2)}.${dni.slice(2, 5)}.${dni.slice(5)}` });
      expect(r.status).toBe(200);
      expect((await recargar(yo)).dni).toBe(dni);
    });

    it('un DNI mal formado se rechaza', async () => {
      const yo = await crearUsuario({});
      for (const mal of ['123', '1234567890', 'abcdefgh']) expect((await guardar(yo, { dni: mal })).body.code).toBe('DNI_INVALIDO');
    });

    it('verificado con Didit, el DNI no se cambia desde la configuración', async () => {
      const dni = dniNuevo();
      const yo = await crearUsuario({ dni, dniVerified: true });
      const r = await guardar(yo, { dni: dniNuevo() });
      expect(r.status).toBe(400);
      expect(r.body.code).toBe('DNI_VERIFICADO');
      expect((await recargar(yo)).dni).toBe(dni);
      // mandar el mismo DNI (la pantalla lo manda siempre) no es un cambio
      expect((await guardar(yo, { dni })).status).toBe(200);
    });

    it('el CUIL tiene que ser válido y llevar el DNI de la cuenta', async () => {
      const dni = dniNuevo();
      const yo = await crearUsuario({ dni });
      const bueno = cuilDe(dni);
      const conDigitoMal = bueno.slice(0, 10) + String((Number(bueno[10]) + 1) % 10);
      const con = (taxId: string) => guardar(yo, { legalInfo: { taxStatus: 'monotributo', taxId } });
      expect((await con(conDigitoMal)).body.code).toBe('CUIL_INVALIDO'); // dígito verificador mal
      expect((await con('123')).body.code).toBe('CUIL_INVALIDO');
      expect((await con(cuilDe(dniNuevo()))).body.code).toBe('CUIL_NO_COINCIDE'); // válido, pero de otro DNI
      const bien = await con(bueno);
      expect(bien.status).toBe(200);
      expect((await recargar(yo)).legalInfo.taxId).toBe(`${bueno.slice(0, 2)}-${bueno.slice(2, 10)}-${bueno[10]}`);
    });

    it('un CUIT de empresa se acepta sin compararlo con el DNI, y vaciar el campo se puede', async () => {
      const yo = await crearUsuario({ dni: dniNuevo() });
      expect((await guardar(yo, { legalInfo: { taxId: '30-50001091-2' } })).status).toBe(200);
      expect((await guardar(yo, { legalInfo: { taxId: '' } })).status).toBe(200);
      expect((await recargar(yo)).legalInfo.taxId).toBe('');
    });

    it('el documento de la información legal es siempre el DNI de la cuenta (no queda otro número suelto)', async () => {
      const dni = dniNuevo();
      const yo = await crearUsuario({ dni });
      await guardar(yo, { legalInfo: { idType: 'passport', idNumber: 'AAA123456', taxStatus: 'freelancer' } });
      const u = await recargar(yo);
      expect(u.legalInfo.idType).toBe('dni');
      expect(u.getDecryptedIdNumber()).toBe(dni);
    });
  });

  describe('lo que lee Didit', () => {
    it('el DNI sale de document_number; el CUIL, de cualquier campo que tenga un CUIL válido de ese DNI', () => {
      const dni = '30111222';
      const cuil = cuilDe(dni);
      const bonito = `${cuil.slice(0, 2)}-${cuil.slice(2, 10)}-${cuil[10]}`;
      expect(extraerIdentidad(decision(dni, { personal_number: bonito }))).toEqual({ dni, cuil: bonito });
      expect(extraerIdentidad(decision(dni, { extra: `CUIL ${cuil} (nuevo)` }))).toEqual({ dni, cuil: bonito });
    });

    it('lo que falta, viene raro o no es de ese DNI no se inventa', () => {
      const dni = '30111222';
      const cuil = cuilDe(dni);
      expect(extraerIdentidad(decision(dni, { personal_number: cuilDe('12345678') })).cuil).toBeNull(); // CUIL válido pero de otro DNI
      expect(extraerIdentidad(decision(dni, { personal_number: cuil.slice(0, 10) + String((Number(cuil[10]) + 1) % 10) })).cuil).toBeNull(); // dígito mal
      expect(extraerIdentidad(decision(dni, { document_number: 'AB123' }))).toEqual({ dni: null, cuil: null });
      for (const raro of [null, undefined, {}, [], 'x', { id_verifications: [] }]) expect(extraerIdentidad(raro)).toEqual({ dni: null, cuil: null });
    });

    it('completa el DNI y el CUIL de una cuenta que no los tenía', async () => {
      const dni = dniNuevo();
      const cuil = cuilDe(dni);
      const u: any = await crearUsuario({});
      const r = await aplicarIdentidadDeDidit(u, decision(dni, { personal_number: cuil }));
      expect(r).toMatchObject({ dniCompletado: true, cuilCompletado: true, dniEnUsoPorOtraCuenta: false });
      const g = await recargar(u);
      expect(g.dni).toBe(dni);
      expect(g.legalInfo.taxId).toBe(`${cuil.slice(0, 2)}-${cuil.slice(2, 10)}-${cuil[10]}`);
      expect(g.getDecryptedIdNumber()).toBe(dni);
      const evento = await AuditLog.findOne({ where: { targetId: String(u.id), action: 'KYC_DNI_COMPLETADO' } });
      expect(evento).toBeTruthy();
    });

    it('es idempotente: la segunda vez no cambia nada', async () => {
      const dni = dniNuevo();
      const d = decision(dni, { personal_number: cuilDe(dni) });
      const u: any = await crearUsuario({});
      await aplicarIdentidadDeDidit(u, d);
      const r = await aplicarIdentidadDeDidit(await recargar(u), d);
      expect(r).toEqual({ dniCompletado: false, dniCorregido: false, cuilCompletado: false, dniEnUsoPorOtraCuenta: false });
    });

    it('un DNI mal tipeado al registrarse se corrige con el del documento (y queda anotado lo que valía antes)', async () => {
      const antes = dniNuevo();
      const dni = dniNuevo();
      const u: any = await crearUsuario({ dni: antes });
      const r = await aplicarIdentidadDeDidit(u, decision(dni));
      expect(r.dniCorregido).toBe(true);
      expect((await recargar(u)).dni).toBe(dni);
      const evento: any = await AuditLog.findOne({ where: { targetId: String(u.id), action: 'KYC_DNI_CORREGIDO' } });
      expect(JSON.stringify(evento.changes)).toContain(antes);
    });

    it('si ese DNI ya lo usa OTRA cuenta no se toca nada y queda un aviso de severidad alta', async () => {
      const dniAjeno = dniNuevo();
      await crearUsuario({ dni: dniAjeno });
      const propio = dniNuevo();
      const u: any = await crearUsuario({ dni: propio });
      const r = await aplicarIdentidadDeDidit(u, decision(dniAjeno));
      expect(r.dniEnUsoPorOtraCuenta).toBe(true);
      expect((await recargar(u)).dni).toBe(propio);
      const evento: any = await AuditLog.findOne({ where: { targetId: String(u.id), action: 'KYC_DNI_EN_USO' } });
      expect(evento.severity).toBe('high');
    });

    it('si el DNI de Didit es de otra cuenta, el CUIL de ese DNI tampoco se carga en esta', async () => {
      const dniAjeno = dniNuevo();
      await crearUsuario({ dni: dniAjeno });
      const u: any = await crearUsuario({ dni: dniNuevo() });
      await aplicarIdentidadDeDidit(u, decision(dniAjeno, { personal_number: cuilDe(dniAjeno) }));
      expect((await recargar(u)).legalInfo?.taxId ?? '').toBe('');
    });

    it('un CUIL ya cargado y válido no se pisa', async () => {
      const dni = dniNuevo();
      const propio = cuilDe(dni, ['27', '23', '24']);
      const otro = cuilDe(dni, ['20']);
      const guardado = `${propio.slice(0, 2)}-${propio.slice(2, 10)}-${propio[10]}`;
      const u: any = await crearUsuario({ dni, legalInfo: { idType: 'dni', taxStatus: 'monotributo', taxId: guardado } as any });
      const r = await aplicarIdentidadDeDidit(await recargar(u), decision(dni, { personal_number: otro }));
      expect(r.cuilCompletado).toBe(false);
      expect((await recargar(u)).legalInfo.taxId).toBe(guardado);
    });

    it('GET /auth/kyc/status completa los datos de quien ya estaba aprobado', async () => {
      const dni = dniNuevo();
      const cuil = cuilDe(dni);
      const u: any = await crearUsuario({ kycStatus: 'Approved', dniVerified: true, kycData: decision(dni, { personal_number: cuil }) } as any);
      const r = await request(app).get('/api/auth/kyc/status').set(con(u));
      expect(r.status).toBe(200);
      const g = await recargar(u);
      expect(g.dni).toBe(dni);
      expect(g.legalInfo?.taxId).toBe(`${cuil.slice(0, 2)}-${cuil.slice(2, 10)}-${cuil[10]}`);
    });
  });
});
