import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';

/**
 * La verificación de Didit solo se aprueba si el documento es de quien se registró (nombre y DNI), y la sesión de Didit va atada a UNA
 * cuenta.
 *
 * Didit aprueba un documento auténtico, pero no sabe quién se registró en DOAPP: antes se daba por verificada la cuenta (y hasta se le
 * corregía el DNI con el del documento) aunque el nombre no tuviera nada que ver con el registro.
 */

let decisionDeDidit: any = {};
jest.mock('../../server/services/didit.js', () => {
  const real: any = (jest as any).requireActual('../../server/services/didit.js');
  return { __esModule: true, ...real, default: { ...real.default }, verifyDiditWebhook: () => true, getDiditDecision: async () => decisionDeDidit };
});
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
import { crearUsuario } from '../helpers/fixtures.js';
import { controlarCoincidencia, leerDocumento, ACCION_IDENTIDAD_NO_COINCIDE } from '../../server/services/identidadDeDidit.js';

const documento = (nombres: string, apellidos: string, dni: string) => ({
  status: 'Approved',
  id_verifications: [{ document_number: dni, first_name: nombres, last_name: apellidos }],
});

describe('Didit: el documento tiene que ser de quien se registró', () => {
  let app: Express;
  const usuarios: string[] = [];
  let n = 0;
  const dniNuevo = () => String(40000000 + Math.floor(Math.random() * 5000000) + n++);
  const cuenta = async (over: Record<string, unknown> = {}) => {
    const u: any = await crearUsuario({ role: 'client', name: 'Tomás Generoso', dni: dniNuevo(), kycStatus: 'In Progress', dniVerified: false, ...over });
    usuarios.push(u.id);
    return u;
  };
  const recargar = (u: any) => User.findByPk(u.id) as Promise<any>;
  const aviso = (u: any, sesion: string, status = 'Approved') =>
    request(app)
      .post('/api/auth/kyc/webhook')
      .set({ 'x-signature-simple': 'x', 'x-timestamp': String(Math.floor(Date.now() / 1000)) })
      .send({ session_id: sesion, status, vendor_data: String(u.id), webhook_type: 'status.updated' });

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/auth', (await import('../../server/routes/auth.js')).default);
  });

  afterAll(async () => {
    try {
      await AuditLog.destroy({ where: { targetId: usuarios } });
      await User.destroy({ where: { id: usuarios }, force: true });
    } catch { /* la limpieza no puede hacer fallar el test */ }
  });

  it('leerDocumento toma nombres, apellidos y un DNI con forma de DNI', () => {
    expect(leerDocumento(documento('TOMAS ANDRES', 'GENEROSO', '30111222'))).toEqual({ nombres: 'TOMAS ANDRES', apellidos: 'GENEROSO', dni: '30111222' });
    expect(leerDocumento({ id_verifications: [{ document_number: 'ABC', full_name: 'Ana Pérez' }] })).toEqual({ nombres: 'Ana Pérez', apellidos: null, dni: null });
    expect(leerDocumento({})).toEqual({ nombres: null, apellidos: null, dni: null });
  });

  it('controlarCoincidencia: nombre y DNI coinciden → queda aprobada', async () => {
    const dni = dniNuevo();
    const u = await cuenta({ dni });
    const updates: any = { kycStatus: 'Approved', dniVerified: true, kycVerifiedAt: new Date() };
    expect(await controlarCoincidencia(u, updates, documento('TOMAS ANDRES', 'GENEROSO', dni))).toBe(true);
    expect(updates).toMatchObject({ kycStatus: 'Approved', dniVerified: true });
  });

  it('controlarCoincidencia: otro nombre → en revisión, sin dniVerified, con un evento y SIN cambiar el DNI', async () => {
    const u = await cuenta();
    const updates: any = { kycStatus: 'Approved', dniVerified: true, kycVerifiedAt: new Date() };
    expect(await controlarCoincidencia(u, updates, documento('JUAN', 'PEREZ', String(u.dni)))).toBe(false);
    expect(updates.kycStatus).toBe('In Review');
    expect(updates.dniVerified).toBeUndefined();
    expect(updates.kycVerifiedAt).toBeUndefined();
    expect(await AuditLog.count({ where: { action: ACCION_IDENTIDAD_NO_COINCIDE, targetId: String(u.id) } })).toBe(1);
    // el mismo caso, preguntado otra vez (el estado se consulta seguido), no llena la lista de avisos
    await controlarCoincidencia(u, { kycStatus: 'Approved', dniVerified: true }, documento('JUAN', 'PEREZ', String(u.dni)));
    expect(await AuditLog.count({ where: { action: ACCION_IDENTIDAD_NO_COINCIDE, targetId: String(u.id) } })).toBe(1);
  });

  it('controlarCoincidencia: mismo nombre pero otro DNI → en revisión', async () => {
    const u = await cuenta();
    const updates: any = { kycStatus: 'Approved', dniVerified: true };
    expect(await controlarCoincidencia(u, updates, documento('TOMAS', 'GENEROSO', '99888777'))).toBe(false);
    expect(updates.kycStatus).toBe('In Review');
  });

  it('controlarCoincidencia: sin nombre en el documento no se aprueba (falla cerrada); una cuenta sin DNI solo compara el nombre', async () => {
    const u = await cuenta();
    const sinNombre: any = { kycStatus: 'Approved', dniVerified: true };
    expect(await controlarCoincidencia(u, sinNombre, { id_verifications: [{ document_number: String(u.dni) }] })).toBe(false);
    const sinDni = await cuenta({ dni: null });
    const ok: any = { kycStatus: 'Approved', dniVerified: true };
    expect(await controlarCoincidencia(sinDni, ok, documento('TOMAS', 'GENEROSO', dniNuevo()))).toBe(true);
  });

  it('quien ya está verificado (a mano, por un administrador) no se vuelve a evaluar, y un rechazo pasa tal cual', async () => {
    const verificada = await cuenta({ dniVerified: true });
    const a: any = { kycStatus: 'Approved' };
    expect(await controlarCoincidencia(verificada, a, documento('JUAN', 'PEREZ', '1'))).toBe(true);
    expect(a.kycStatus).toBe('Approved');
    const b: any = { kycStatus: 'Declined' };
    expect(await controlarCoincidencia(await cuenta(), b, documento('JUAN', 'PEREZ', '1'))).toBe(false);
    expect(b.kycStatus).toBe('Declined');
  });

  it('webhook: un documento de otra persona NO verifica la cuenta y no le cambia el DNI', async () => {
    const u = await cuenta({ diditSessionId: 'ses-ajena-1' });
    decisionDeDidit = documento('JUAN', 'PEREZ', '77777777');
    const r = await aviso(u, 'ses-ajena-1');
    expect(r.status).toBe(200);
    const despues = await recargar(u);
    expect(despues.dniVerified).toBe(false);
    expect(despues.kycStatus).toBe('In Review');
    expect(String(despues.dni)).toBe(String(u.dni));
  });

  it('webhook: el documento de la misma persona verifica la cuenta', async () => {
    const u = await cuenta({ diditSessionId: 'ses-propia-1' });
    decisionDeDidit = documento('TOMAS', 'GENEROSO', String(u.dni));
    await aviso(u, 'ses-propia-1');
    const despues = await recargar(u);
    expect(despues.dniVerified).toBe(true);
    expect(despues.kycStatus).toBe('Approved');
  });

  it('webhook: un aviso de una sesión que NO es la actual de la cuenta se ignora', async () => {
    const u = await cuenta({ diditSessionId: 'ses-actual' });
    decisionDeDidit = documento('TOMAS', 'GENEROSO', String(u.dni));
    const r = await aviso(u, 'ses-vieja');
    expect(r.status).toBe(200);
    const despues = await recargar(u);
    expect(despues.dniVerified).toBe(false);
    expect(despues.diditSessionId).toBe('ses-actual');
  });
});
