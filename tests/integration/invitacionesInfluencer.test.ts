import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Invitaciones de creadores de contenido (T&C 7.11): 5 enlaces por creador, de un solo uso; quien canjea uno no paga la
 * comisión de la Plataforma como Cliente durante 365 días desde el canje. Una invitación por cuenta, sin acumularse.
 */

jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('node-cron', () => ({ __esModule: true, default: { schedule: () => undefined } }));
jest.mock('../../server/services/email.js', () => ({
  __esModule: true,
  default: new Proxy({}, { get: () => async () => true }),
}));
jest.mock('../../server/services/mercadopago.js', () => ({ __esModule: true, default: {} }));

import { User } from '../../server/models/sql/User.model.js';
import { InfluencerInvite } from '../../server/models/sql/InfluencerInvite.model.js';
import { AuditLog } from '../../server/models/sql/AuditLog.model.js';
import { config } from '../../server/config/env.js';
import { POLITICAS } from '../../shared/constants/policies.js';
import { crearUsuario } from '../helpers/fixtures.js';
import {
  calcularFinDelBeneficio, canjearInvitacion, consultarInvitacion, crearLoteDeInvitaciones, darDeBajaInvitacion,
  enlaceDeInvitacion, estadoDeLaInvitacion, generarCodigoDeInvitacion, listarLotes, normalizarCodigoDeInvitacion,
  MAXIMO_DE_INVITACIONES_POR_LOTE,
} from '../../server/services/invitacionesInfluencer.js';
import { calculateCommission, getUserCommissionRate } from '../../server/services/commissionService.js';
import { configurarFechasDeFase } from '../../server/services/platformPhase.js';

const DIA = 24 * 60 * 60 * 1000;

describe('invitaciones de creadores de contenido', () => {
  let app: Express;
  let owner: any, admin: any;
  const usuarios: any[] = [];
  const lotes: string[] = [];
  const sesion = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, config.jwtSecret)}` });
  const nuevoUsuario = async (over: Record<string, unknown> = {}) => {
    const u = await crearUsuario({ role: 'client', freeContractsRemaining: 0, ...over });
    usuarios.push(u);
    return u;
  };
  const lote = async (over: Record<string, unknown> = {}) => {
    const r = await crearLoteDeInvitaciones({ nombre: 'Creadora de Prueba', usuario: '@creadora', creadoPorId: owner.id, ...over } as any);
    lotes.push(r.batchId);
    return r;
  };
  const crudoDelUsuario = async (id: string) => ((await User.findByPk(id)) as any);

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/invitaciones', (await import('../../server/routes/invitaciones.js')).default);
    app.use('/api/admin/influencer-invites', (await import('../../server/routes/admin/influencerInvites.js')).default);
    app.use('/api/auth', (await import('../../server/routes/auth.js')).default);
    owner = await crearUsuario({ role: 'admin', adminRole: 'owner' });
    admin = await crearUsuario({ role: 'admin', adminRole: 'admin' });
  });

  afterAll(async () => {
    configurarFechasDeFase({ betaEndsAt: null, liveStartsAt: null });
    try {
      const ids = [owner.id, admin.id, ...usuarios.map((u) => u.id)];
      await AuditLog.destroy({ where: { targetId: lotes.map(String) } as any });
      await User.update({ influencerInviteId: null } as any, { where: { id: ids } });
      await InfluencerInvite.destroy({ where: { batchId: lotes }, force: true });
      await User.destroy({ where: { id: ids }, force: true });
    } catch { /* ok */ }
  });

  describe('el lote', () => {
    it('da 5 invitaciones por defecto, con códigos únicos, de 365 días, y el enlace /invitacion/<código>', async () => {
      const r = await lote();
      expect(POLITICAS.INVITACIONES_POR_INFLUENCER).toBe(5);
      expect(r.invitaciones).toHaveLength(5);
      expect(new Set(r.invitaciones.map((i) => i.code)).size).toBe(5);
      for (const i of r.invitaciones) {
        expect(i.code).toMatch(/^INF-[A-HJ-NP-Z2-9]{12}$/);
        expect(i.enlace).toBe(enlaceDeInvitacion(i.code));
        expect(i.enlace).toMatch(/\/invitacion\/INF-/);
      }
      const filas = await InfluencerInvite.findAll({ where: { batchId: r.batchId } });
      expect(filas.every((f: any) => f.freeDays === POLITICAS.INVITACION_DIAS_SIN_COMISION && f.freeDays === 365)).toBe(true);
      expect(filas.every((f: any) => f.influencerName === 'Creadora de Prueba' && f.isActive && !f.redeemedById)).toBe(true);
    });

    it('la cantidad tiene tope y mínimo, y el nombre es obligatorio', async () => {
      await expect(crearLoteDeInvitaciones({ nombre: 'X', cantidad: 0, creadoPorId: owner.id })).rejects.toThrow(/entre 1 y/);
      await expect(crearLoteDeInvitaciones({ nombre: 'X', cantidad: MAXIMO_DE_INVITACIONES_POR_LOTE + 1, creadoPorId: owner.id })).rejects.toThrow(/entre 1 y/);
      await expect(crearLoteDeInvitaciones({ nombre: '   ', creadoPorId: owner.id })).rejects.toThrow(/nombre/i);
      const tres = await lote({ cantidad: 3 });
      expect(tres.invitaciones).toHaveLength(3);
    });

    it('el código tiene la forma esperada y se normaliza lo que escribe la gente (minúsculas, espacios)', () => {
      for (let i = 0; i < 50; i++) expect(generarCodigoDeInvitacion()).toMatch(/^INF-[A-HJ-NP-Z2-9]{12}$/);
      // Entropía: 300 códigos, todos distintos y usando casi todo el alfabeto (no un subconjunto chico ni un patrón).
      const muestra = Array.from({ length: 300 }, () => generarCodigoDeInvitacion());
      expect(new Set(muestra).size).toBe(300);
      expect(new Set(muestra.join('').replace(/INF-/g, '')).size).toBeGreaterThanOrEqual(28);
      expect(normalizarCodigoDeInvitacion('  inf-abcdefghjkmn  ')).toBe('INF-ABCDEFGHJKMN');
      for (const mal of ['', null, undefined, 'INF-ABC', 'INF-ABCDEFGHJKM0', 'FAM-ABCDEFGHJKMN', "INF-ABCDEFGHJKMN'; DROP TABLE users;--", 'INF-ABCDEFGHJKMNP']) {
        expect(normalizarCodigoDeInvitacion(mal as any)).toBeNull();
      }
    });
  });

  describe('consultar (lo que ve quien abre el enlace, sin cuenta)', () => {
    it('una válida cuenta de quién es y cuántos días da, y nada más', async () => {
      const r = await lote({ cantidad: 1 });
      const c = await consultarInvitacion(r.invitaciones[0].code);
      expect(c).toMatchObject({ valida: true, estado: 'valida', dias: 365, influencer: 'Creadora de Prueba' });
      expect(Object.keys(c).sort()).toEqual(['dias', 'estado', 'influencer', 'mensaje', 'valida']);
    });

    it('inexistente, mal escrita, canjeada, dada de baja o vencida: no sirve y dice por qué', async () => {
      expect((await consultarInvitacion('INF-AAAAAAAAAAAA')).estado).toBe('inexistente');
      expect((await consultarInvitacion('basura')).estado).toBe('inexistente');
      const r = await lote({ cantidad: 3 });
      const u = await nuevoUsuario();
      await canjearInvitacion(u.id, r.invitaciones[0].code);
      expect((await consultarInvitacion(r.invitaciones[0].code)).estado).toBe('canjeada');
      await darDeBajaInvitacion(r.invitaciones[1].id, 'prueba de baja', admin.id);
      expect((await consultarInvitacion(r.invitaciones[1].code)).estado).toBe('dada_de_baja');
      await InfluencerInvite.update({ expiresAt: new Date(Date.now() - DIA) } as any, { where: { id: r.invitaciones[2].id } });
      const vencida = await consultarInvitacion(r.invitaciones[2].code);
      expect(vencida.estado).toBe('vencida');
      expect(vencida.valida).toBe(false);
      expect((vencida as any).dias).toBeUndefined();
    });

    it('estadoDeLaInvitacion decide con el reloj que se le pase', () => {
      const base = { isActive: true, redeemedById: undefined, expiresAt: new Date('2027-01-01T00:00:00Z') } as any;
      expect(estadoDeLaInvitacion(base, new Date('2026-12-31T00:00:00Z'))).toBe('valida');
      expect(estadoDeLaInvitacion(base, new Date('2027-01-02T00:00:00Z'))).toBe('vencida');
      expect(estadoDeLaInvitacion({ ...base, isActive: false })).toBe('dada_de_baja');
      expect(estadoDeLaInvitacion({ ...base, redeemedById: 'x' })).toBe('canjeada'); // canjeada gana sobre baja
      expect(estadoDeLaInvitacion(null)).toBe('inexistente');
    });
  });

  describe('canjear', () => {
    it('deja la cuenta sin comisión por 365 días desde el canje, marca la invitación y anota el asiento', async () => {
      const r = await lote({ cantidad: 1 });
      const u = await nuevoUsuario();
      const antes = Date.now();
      const c = await canjearInvitacion(u.id, r.invitaciones[0].code);
      expect(c.ok).toBe(true);
      const hasta = (c as any).hasta as Date;
      expect(hasta.getTime()).toBeGreaterThanOrEqual(antes + 365 * DIA - 1000);
      expect(hasta.getTime()).toBeLessThanOrEqual(Date.now() + 365 * DIA + 1000);
      expect(calcularFinDelBeneficio(new Date('2026-10-12T00:00:00Z'), 365).toISOString()).toBe('2027-10-12T00:00:00.000Z');

      const user = await crudoDelUsuario(u.id);
      expect(new Date(user.commissionFreeUntil).getTime()).toBe(hasta.getTime());
      expect(user.influencerInviteId).toBe(r.invitaciones[0].id);
      const inv: any = await InfluencerInvite.findByPk(r.invitaciones[0].id);
      expect(inv.redeemedById).toBe(u.id);
      expect(new Date(inv.benefitEndsAt).getTime()).toBe(hasta.getTime());
      const asiento: any = await AuditLog.findOne({ where: { action: 'INFLUENCER_INVITE_REDEEMED', targetId: String(inv.id) } as any });
      expect(asiento).toBeTruthy();
      expect(asiento.actor).toBe(`user:${u.id}`);
    });

    it('es de UN solo uso: otra persona con el mismo enlace no puede', async () => {
      const r = await lote({ cantidad: 1 });
      const a = await nuevoUsuario();
      const b = await nuevoUsuario();
      expect((await canjearInvitacion(a.id, r.invitaciones[0].code)).ok).toBe(true);
      const segundo: any = await canjearInvitacion(b.id, r.invitaciones[0].code);
      expect(segundo.ok).toBe(false);
      expect(segundo.motivo).toBe('canjeada');
      expect((await crudoDelUsuario(b.id)).commissionFreeUntil).toBeNull();
    });

    it('dos personas canjeando el MISMO enlace a la vez: gana una sola', async () => {
      const r = await lote({ cantidad: 1 });
      const us = await Promise.all([nuevoUsuario(), nuevoUsuario(), nuevoUsuario(), nuevoUsuario()]);
      const resultados = await Promise.all(us.map((u) => canjearInvitacion(u.id, r.invitaciones[0].code)));
      expect(resultados.filter((x) => x.ok).length).toBe(1);
      const conBeneficio = (await Promise.all(us.map((u) => crudoDelUsuario(u.id)))).filter((u: any) => u.commissionFreeUntil);
      expect(conBeneficio).toHaveLength(1);
    });

    it('una cuenta canjea UNA sola: la segunda se rechaza y NO se gasta', async () => {
      const r = await lote({ cantidad: 2 });
      const u = await nuevoUsuario();
      expect((await canjearInvitacion(u.id, r.invitaciones[0].code)).ok).toBe(true);
      const otra: any = await canjearInvitacion(u.id, r.invitaciones[1].code);
      expect(otra.ok).toBe(false);
      expect(otra.motivo).toBe('ya_canjeo_una');
      const sigue: any = await InfluencerInvite.findByPk(r.invitaciones[1].id);
      expect(sigue.redeemedById).toBeNull(); // la invitación sigue disponible para otra persona
      expect((await consultarInvitacion(r.invitaciones[1].code)).valida).toBe(true);
    });

    it('una cuenta con Plan Familia no la canjea (ya no paga comisión) y la invitación no se gasta', async () => {
      const r = await lote({ cantidad: 1 });
      const familia = await nuevoUsuario({ hasFamilyPlan: true });
      const c: any = await canjearInvitacion(familia.id, r.invitaciones[0].code);
      expect(c.ok).toBe(false);
      expect(c.motivo).toBe('ya_sin_comision');
      expect((await consultarInvitacion(r.invitaciones[0].code)).valida).toBe(true);
    });

    it('dada de baja, vencida, inexistente o con usuario inexistente: no canjea y no cambia nada', async () => {
      const r = await lote({ cantidad: 3 });
      const u = await nuevoUsuario();
      await darDeBajaInvitacion(r.invitaciones[0].id, 'ya no va', admin.id);
      expect(((await canjearInvitacion(u.id, r.invitaciones[0].code)) as any).motivo).toBe('dada_de_baja');
      await InfluencerInvite.update({ expiresAt: new Date(Date.now() - 1000) } as any, { where: { id: r.invitaciones[1].id } });
      expect(((await canjearInvitacion(u.id, r.invitaciones[1].code)) as any).motivo).toBe('vencida');
      expect(((await canjearInvitacion(u.id, 'INF-AAAAAAAAAAAA')) as any).motivo).toBe('inexistente');
      expect(((await canjearInvitacion('00000000-0000-4000-8000-000000000000', r.invitaciones[2].code)) as any).motivo).toBe('usuario_inexistente');
      expect((await crudoDelUsuario(u.id)).commissionFreeUntil).toBeNull();
      expect((await consultarInvitacion(r.invitaciones[2].code)).valida).toBe(true);
    });
  });

  describe('la comisión', () => {
    it('fuera de la beta: con la invitación vigente es 0%; vencida, vuelve a la tasa normal; sin invitación, la normal', async () => {
      configurarFechasDeFase({ betaEndsAt: new Date(Date.now() - 400 * DIA), liveStartsAt: null }); // la beta ya terminó
      const normal = await nuevoUsuario();
      const conInvitacion = await nuevoUsuario();
      const vencida = await nuevoUsuario();
      const r = await lote({ cantidad: 1 });
      await canjearInvitacion(conInvitacion.id, r.invitaciones[0].code);
      await User.update({ commissionFreeUntil: new Date(Date.now() - DIA) } as any, { where: { id: vencida.id } });

      const cNormal = await calculateCommission(normal.id, 100000);
      expect(cNormal.rate).toBeGreaterThan(0);
      expect(cNormal.commission).toBeGreaterThan(0);

      const cInvitada = await calculateCommission(conInvitacion.id, 100000);
      expect(cInvitada.rate).toBe(0);
      expect(cInvitada.commission).toBe(0);
      expect(cInvitada.tierDescription).toMatch(/Invitación/);
      const tasa = await getUserCommissionRate(conInvitacion.id);
      expect(tasa.rate).toBe(0);

      const cVencida = await calculateCommission(vencida.id, 100000);
      expect(cVencida.rate).toBe(cNormal.rate);
      expect(cVencida.commission).toBe(cNormal.commission);
    });
  });

  describe('la ruta pública y el canje con sesión', () => {
    it('GET /api/invitaciones/:codigo no necesita sesión y no revela más que lo previsto', async () => {
      const r = await lote({ cantidad: 1 });
      const v = await request(app).get(`/api/invitaciones/${r.invitaciones[0].code}`);
      expect(v.status).toBe(200);
      expect(v.body).toMatchObject({ success: true, valida: true, dias: 365, influencer: 'Creadora de Prueba' });
      expect(JSON.stringify(v.body)).not.toMatch(/createdBy|redeemed|email|batch/i);
      const mala = await request(app).get('/api/invitaciones/xxx');
      expect(mala.body.valida).toBe(false);
    });

    it('POST /canjear exige sesión y canjea para quien la tiene', async () => {
      const r = await lote({ cantidad: 1 });
      const u = await nuevoUsuario();
      expect((await request(app).post('/api/invitaciones/canjear').send({ codigo: r.invitaciones[0].code })).status).toBe(401);
      const ok = await request(app).post('/api/invitaciones/canjear').set(sesion(u)).send({ codigo: r.invitaciones[0].code });
      expect(ok.status).toBe(200);
      expect(ok.body.dias).toBe(365);
      const otra = await request(app).post('/api/invitaciones/canjear').set(sesion(u)).send({ codigo: r.invitaciones[0].code });
      expect(otra.status).toBe(400);
    });

    it('al REGISTRARSE con el enlace, la cuenta nueva ya queda sin comisión', async () => {
      const r = await lote({ cantidad: 1 });
      const sufijo = Date.now().toString(36);
      const reg = await request(app).post('/api/auth/register').send({
        name: 'Persona Invitada', username: `inv${sufijo}`, email: `inv${sufijo}@test.local`, password: 'Clave12345!',
        phone: '+5491112345678', dni: String(Date.now()).slice(-8), termsAccepted: true, invitationCode: r.invitaciones[0].code,
      });
      expect(reg.status).toBe(201);
      expect(reg.body.invitacion?.aplicada).toBe(true);
      const creado: any = await User.findOne({ where: { email: `inv${sufijo}@test.local` } });
      usuarios.push(creado);
      expect(creado.commissionFreeUntil).toBeTruthy();
      expect(creado.influencerInviteId).toBe(r.invitaciones[0].id);
    });

    it('al registrarse con un enlace que ya no sirve, la cuenta se crea igual y se cuenta el motivo', async () => {
      const r = await lote({ cantidad: 1 });
      const otro = await nuevoUsuario();
      await canjearInvitacion(otro.id, r.invitaciones[0].code);
      const sufijo = Date.now().toString(36) + 'b';
      const reg = await request(app).post('/api/auth/register').send({
        name: 'Persona Tarde', username: `tar${sufijo}`, email: `tar${sufijo}@test.local`, password: 'Clave12345!',
        phone: '+5491112345679', dni: String(Date.now() + 7).slice(-8), termsAccepted: true, invitationCode: r.invitaciones[0].code,
      });
      expect(reg.status).toBe(201);
      expect(reg.body.invitacion).toMatchObject({ aplicada: false });
      expect(reg.body.invitacion.mensaje).toMatch(/ya fue usada/);
      const creado: any = await User.findOne({ where: { email: `tar${sufijo}@test.local` } });
      usuarios.push(creado);
      expect(creado.commissionFreeUntil).toBeNull();
    });
  });

  describe('el panel del owner', () => {
    it('sólo el owner emite, lista y da de baja (admin común, usuario común y sin sesión: no)', async () => {
      for (const quien of [admin, await nuevoUsuario(), null]) {
        let q = request(app).post('/api/admin/influencer-invites').send({ nombre: 'No debería' });
        if (quien) q = q.set(sesion(quien));
        const r = await q;
        expect([401, 403]).toContain(r.status);
      }
      expect((await request(app).get('/api/admin/influencer-invites').set(sesion(admin))).status).toBe(403);
    });

    it('el owner da de alta a un creador (5 enlaces), los lista con su estado y quién los canjeó', async () => {
      const alta = await request(app).post('/api/admin/influencer-invites').set(sesion(owner)).send({ nombre: 'Influencer del Panel', usuario: '@panel', notas: 'prueba' });
      expect(alta.status).toBe(201);
      expect(alta.body.data.invitaciones).toHaveLength(5);
      lotes.push(alta.body.data.batchId);
      const u = await nuevoUsuario();
      await canjearInvitacion(u.id, alta.body.data.invitaciones[0].code);

      const lista = await request(app).get('/api/admin/influencer-invites').set(sesion(owner));
      expect(lista.status).toBe(200);
      const l = lista.body.data.find((x: any) => x.batchId === alta.body.data.batchId);
      expect(l).toMatchObject({ influencer: 'Influencer del Panel', handle: '@panel', total: 5, canjeadas: 1 });
      const canjeada = l.invitaciones.find((i: any) => i.estado === 'canjeada');
      expect(canjeada.canjeadaPor.email).toBe(u.email);
      expect(l.invitaciones.filter((i: any) => i.estado === 'valida')).toHaveLength(4);
      expect(lista.body.politica).toEqual({ invitacionesPorCreador: 5, diasSinComision: 365 });
    });

    it('dar de baja pide motivo, no se puede si ya se canjeó, y queda anotado', async () => {
      const alta = await request(app).post('/api/admin/influencer-invites').set(sesion(owner)).send({ nombre: 'Para Baja', cantidad: 2 });
      lotes.push(alta.body.data.batchId);
      const [a, b] = alta.body.data.invitaciones;
      expect((await request(app).post(`/api/admin/influencer-invites/${a.id}/deactivate`).set(sesion(owner)).send({ motivo: 'x' })).status).toBe(400);
      const baja = await request(app).post(`/api/admin/influencer-invites/${a.id}/deactivate`).set(sesion(owner)).send({ motivo: 'la cuenta del creador se hackeó' });
      expect(baja.status).toBe(200);
      expect((await consultarInvitacion(a.code)).estado).toBe('dada_de_baja');
      const asiento: any = await AuditLog.findOne({ where: { action: 'INFLUENCER_INVITE_DEACTIVATED', targetId: String(a.id) } as any });
      expect(asiento?.metadata ? JSON.stringify(asiento.metadata) : '').toContain('hackeó');

      const u = await nuevoUsuario();
      await canjearInvitacion(u.id, b.code);
      const tarde = await request(app).post(`/api/admin/influencer-invites/${b.id}/deactivate`).set(sesion(owner)).send({ motivo: 'ya canjeada, no debería' });
      expect(tarde.status).toBe(400);
      expect((await crudoDelUsuario(u.id)).commissionFreeUntil).toBeTruthy(); // el beneficio ya otorgado no se quita
    });

    it('la fecha límite tiene que ser futura', async () => {
      const r = await request(app).post('/api/admin/influencer-invites').set(sesion(owner)).send({ nombre: 'Fecha mala', venceEl: '2020-01-01' });
      expect(r.status).toBe(400);
    });

    it('listarLotes agrupa por creador', async () => {
      const a = await lote({ nombre: 'Agrupada', cantidad: 2 });
      const todos = await listarLotes();
      const mio = todos.find((x) => x.batchId === a.batchId)!;
      expect(mio.total).toBe(2);
      expect(mio.invitaciones.map((i) => i.code).sort()).toEqual(a.invitaciones.map((i) => i.code).sort());
    });
  });
});
