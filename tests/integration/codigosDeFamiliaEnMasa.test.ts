import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Códigos de familia en masa (regla del dueño, 2026-11-11): se pegan nombres separados por comas y se emite un código por persona. Solo el dueño. Quien ya tiene un código
 * activo no recibe otro (correr la misma lista dos veces no duplica). Los códigos son únicos. El registro de acciones guarda cuántos se crearon, no los nombres.
 * Los nombres de acá son inventados.
 */
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));

import { User } from '../../server/models/sql/User.model.js';
import { FamilyCode } from '../../server/models/sql/FamilyCode.model.js';
import { AuditLog } from '../../server/models/sql/AuditLog.model.js';
import { crearUsuario } from '../helpers/fixtures.js';

describe('POST /api/admin/family-codes/bulk', () => {
  let app: Express;
  let dueno: any, admin: any;
  const idsCreados: string[] = [];
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  // Solo letras: un nombre con números no se acepta (y con base 36 el azar a veces los traía y la prueba fallaba sola).
  const sufijo = Array.from({ length: 8 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
  // Apellidos únicos por corrida: la tabla de pruebas puede tener códigos de otras corridas.
  const nombre = (n: string) => `${n} Prueba${sufijo}`;
  const masa = (quien: any, cuerpo: Record<string, unknown>) => request(app).post('/api/admin/family-codes/bulk').set(con(quien)).send(cuerpo);
  const recordar = (r: any) => (r.body?.data?.creados ?? []).forEach((c: any) => idsCreados.push(c.id));

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/admin/family-codes', (await import('../../server/routes/admin/familyCodes.js')).default);
    dueno = await crearUsuario({ role: 'admin', adminRole: 'owner' });
    admin = await crearUsuario({ role: 'admin', adminRole: 'admin' });
  });

  afterAll(async () => {
    try {
      await AuditLog.destroy({ where: { performedBy: dueno.id } as any });
      await FamilyCode.destroy({ where: { createdById: dueno.id } as any, force: true } as any);
      await User.destroy({ where: { id: [dueno.id, admin.id] }, force: true });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  it('crea un código por persona: formato FAM-XXXXXXXX, únicos, con nombre y apellido separados y quién los emitió', async () => {
    const r = await masa(dueno, { nombres: `${nombre('ana')}, ${nombre('luis de la')}, ${nombre('maría paz')}`, notes: 'prueba en masa' });
    recordar(r);
    expect(r.status).toBe(201);
    expect(r.body.data.creados).toHaveLength(3);
    const codigos = r.body.data.creados.map((c: any) => c.code);
    for (const c of codigos) expect(c).toMatch(/^FAM-[A-HJ-NP-Z2-9]{8}$/);
    expect(new Set(codigos).size).toBe(3);

    const fila: any = await FamilyCode.findByPk(r.body.data.creados[0].id);
    expect(fila.firstName).toBe('Ana');
    expect(fila.lastName).toBe(`Prueba${sufijo}`);
    expect(fila.createdById).toBe(dueno.id);
    expect(fila.isActive).toBe(true);
    expect(fila.notes).toBe('prueba en masa');
    // el nombre compuesto: la primera palabra es el nombre
    const compuesto: any = await FamilyCode.findByPk(r.body.data.creados[2].id);
    expect([compuesto.firstName, compuesto.lastName]).toEqual(['María', `Paz Prueba${sufijo}`]);
  });

  it('correr la misma lista otra vez no duplica nada: devuelve el código que ya tienen, aunque cambien mayúsculas o tildes', async () => {
    const lista = `${nombre('Beto')}, ${nombre('Carla')}`;
    const primera = await masa(dueno, { nombres: lista });
    recordar(primera);
    expect(primera.body.data.creados).toHaveLength(2);

    const otra = await masa(dueno, { nombres: lista.toUpperCase() });
    recordar(otra);
    expect(otra.status).toBe(201);
    expect(otra.body.data.creados).toHaveLength(0);
    expect(otra.body.data.yaExistian.map((y: any) => y.code).sort()).toEqual(primera.body.data.creados.map((c: any) => c.code).sort());
    expect(await FamilyCode.count({ where: { lastName: `Prueba${sufijo}`, firstName: ['Beto', 'Carla'] } as any })).toBe(2);
  });

  it('un código desactivado no cuenta: esa persona puede recibir uno nuevo', async () => {
    const lista = nombre('Dora');
    const primera = await masa(dueno, { nombres: lista });
    recordar(primera);
    await FamilyCode.update({ isActive: false } as any, { where: { id: primera.body.data.creados[0].id } });
    const otra = await masa(dueno, { nombres: lista });
    recordar(otra);
    expect(otra.body.data.creados).toHaveLength(1);
    expect(otra.body.data.creados[0].code).not.toBe(primera.body.data.creados[0].code);
  });

  it('lo que no se puede usar vuelve con el motivo y no frena al resto; si no sirve ninguno, 400', async () => {
    const mezcla = await masa(dueno, { nombres: `${nombre('Elena')}, Soloun, Num3ro Apellido, ${nombre('Elena')}` });
    recordar(mezcla);
    expect(mezcla.status).toBe(201);
    expect(mezcla.body.data.creados).toHaveLength(1);
    expect(mezcla.body.data.invalidos.map((i: any) => i.texto)).toEqual(['Soloun', 'Num3ro Apellido']);
    expect(mezcla.body.data.repetidos).toHaveLength(1);

    const nada = await masa(dueno, { nombres: 'Soloun, Otro' });
    expect(nada.status).toBe(400);
    expect(nada.body.data.invalidos).toHaveLength(2);
  });

  it('el registro de acciones guarda cuántos y cuáles códigos, pero NO los nombres', async () => {
    const r = await masa(dueno, { nombres: nombre('Fabi') });
    recordar(r);
    const asiento: any = await AuditLog.findOne({ where: { performedBy: dueno.id, action: 'family_code.bulk_create' } as any, order: [['createdAt', 'DESC']] });
    expect(asiento).toBeTruthy();
    expect(JSON.stringify([asiento.description, asiento.metadata])).not.toContain('Fabi');
    expect(JSON.stringify(asiento.metadata)).toContain(r.body.data.creados[0].id);
  });

  it('solo el dueño: un administrador recibe 403 y no se crea nada; sin sesión, 401', async () => {
    const antes = await FamilyCode.count();
    const r = await masa(admin, { nombres: nombre('Gina') });
    expect(r.status).toBe(403);
    expect(await FamilyCode.count()).toBe(antes);
    expect((await request(app).post('/api/admin/family-codes/bulk').send({ nombres: nombre('Gina') })).status).toBe(401);
  });

  it('pide nombres y una fecha de vencimiento válida', async () => {
    expect((await masa(dueno, {})).status).toBe(400);
    expect((await masa(dueno, { nombres: '   ' })).status).toBe(400);
    expect((await masa(dueno, { nombres: nombre('Hugo'), expiresAt: 'no-es-una-fecha' })).status).toBe(400);
  });

  it('con vencimiento, lo guarda en todos', async () => {
    const r = await masa(dueno, { nombres: `${nombre('Iris')}, ${nombre('Juan')}`, expiresAt: '2030-01-31' });
    recordar(r);
    expect(r.status).toBe(201);
    for (const c of r.body.data.creados) {
      const fila: any = await FamilyCode.findByPk(c.id);
      expect(new Date(fila.expiresAt).getFullYear()).toBe(2030);
    }
  });
});
