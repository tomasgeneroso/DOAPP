import { describe, it, expect, beforeAll, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * `GET /api/admin/hubs/pendientes`: lo que el administrador tiene que hacer, ordenado por urgencia y filtrado por rol.
 *
 * Qué motivó esto: el panel abría con estadísticas y los pendientes (retiros, publicaciones, disputas…) quedaban repartidos en una pantalla por
 * tipo; había que entrar a cada una para saber si había trabajo esperando. Y un trabajo «en curso» cuya fecha de fin ya había pasado no figuraba
 * en ningún lado.
 */

jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('../../server/services/email.js', () => ({
  __esModule: true,
  default: new Proxy({}, { get: () => async () => true }),
}));

import { Op } from 'sequelize';
import { sequelize } from '../../server/config/database.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { User } from '../../server/models/sql/User.model.js';
import { POLITICAS } from '../../shared/constants/policies.js';
import { isBetaPhase } from '../../server/services/platformPhase.js';
import { WithdrawalRequest } from '../../server/models/sql/WithdrawalRequest.model.js';
import { conSistema } from '../../server/db/contextoRls.js';
import { crearUsuario, crearTrabajo } from '../helpers/fixtures.js';

const CBU = '0000003100012345678901';
const haceHoras = (h: number) => new Date(Date.now() - h * 3_600_000);

describe('GET /api/admin/hubs/pendientes', () => {
  let app: Express;
  let admin: any, soporte: any, superAdmin: any, marketing: any, cliente: any;
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const pedir = (u?: any) => (u ? request(app).get('/api/admin/hubs/pendientes').set(con(u)) : request(app).get('/api/admin/hubs/pendientes'));
  const clave = (r: any, k: string) => (r.body.tareas as any[]).find((t) => t.clave === k);

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/admin/hubs', (await import('../../server/routes/admin/hubs.js')).default);
    admin = await crearUsuario({ role: 'admin', adminRole: 'admin' });
    soporte = await crearUsuario({ role: 'admin', adminRole: 'support' });
    superAdmin = await crearUsuario({ role: 'admin', adminRole: 'super_admin' });
    marketing = await crearUsuario({ role: 'admin', adminRole: 'marketing' });
    cliente = await crearUsuario({ role: 'client' });
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sin nada pendiente dice que no hay trabajo (y no inventa uno)', async () => {
    const r = await pedir(admin);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ success: true, tareas: [], fallos: [] });
  });

  it('sin sesión es 401, y un rol de administración sin tareas (marketing) es 403', async () => {
    expect((await pedir()).status).toBe(401);
    expect((await pedir(marketing)).status).toBe(403);
  });

  describe('con trabajo esperando', () => {
    beforeAll(async () => {
      // Un retiro que hace 3 días espera: pasa las 48 h y es urgente.
      const retiro: any = await conSistema(() =>
        WithdrawalRequest.create({
          userId: cliente.id, amount: 1000, bankingInfo: { accountHolder: 'Persona de Prueba', bankName: 'Mercado Pago', cbu: CBU, accountType: 'savings' }, status: 'pending',
          balanceBeforeWithdrawal: 1000, balanceAfterWithdrawal: 0, metadata: {},
        } as any),
      );
      await sequelize.query('UPDATE withdrawal_requests SET created_at = :cuando WHERE id = :id', { replacements: { cuando: haceHoras(72), id: retiro.id } });

      // Una publicación pagada que hace 7 h espera revisión: pasa las 6 h y es importante.
      const publicacion = await crearTrabajo(cliente.id, { status: 'pending_approval', title: 'Para aprobar' });
      await sequelize.query('UPDATE jobs SET updated_at = :cuando WHERE id = :id', { replacements: { cuando: haceHoras(7), id: publicacion.id } });

      // El caso de la pantalla: «en curso» y su fecha de fin pasó hace 10 días. Se cierra solo a las 24 h; a las 48 h es que algo lo frenó.
      await crearTrabajo(cliente.id, { status: 'in_progress', title: 'try', startDate: haceHoras(24 * 12), endDate: haceHoras(24 * 10) });
      // Uno que terminó hace 5 horas todavía está dentro del plazo normal de cierre: NO figura.
      await crearTrabajo(cliente.id, { status: 'in_progress', title: 'recién terminado', startDate: haceHoras(48), endDate: haceHoras(5) });
    });

    it('el retiro que espera hace 3 días es urgente y la publicación de hace 7 horas, importante', async () => {
      const r = await pedir(admin);
      expect(r.status).toBe(200);
      expect(clave(r, 'retiros')).toMatchObject({ urgencia: 'urgente', categoria: 'dinero', cantidad: 1, ruta: '/admin/withdrawals' });
      expect(clave(r, 'retiros').detalle).toMatch(/1 retiro .*hace 3 días/);
      expect(clave(r, 'publicaciones')).toMatchObject({ urgencia: 'importante', categoria: 'publicaciones', cantidad: 1, ruta: '/admin/jobs' });
    });

    it('un trabajo «en curso» con la fecha de fin vencida hace 10 días figura como urgente; uno que terminó hace 5 horas, no', async () => {
      const r = await pedir(admin);
      expect(clave(r, 'trabajosVencidos')).toMatchObject({ urgencia: 'urgente', cantidad: 1 });
      expect(clave(r, 'trabajosVencidos').detalle).toMatch(/hace 10 días/);
    });

    it('viene ordenado: primero lo urgente, y lo más viejo antes', async () => {
      const r = await pedir(admin);
      const niveles = (r.body.tareas as any[]).map((t) => t.urgencia);
      const peso = { urgente: 0, importante: 1, normal: 2 } as Record<string, number>;
      expect(niveles.map((n) => peso[n])).toEqual([...niveles.map((n) => peso[n])].sort((a, b) => a - b));
      expect(r.body.tareas[0].urgencia).toBe('urgente');
      const urgentes = (r.body.tareas as any[]).filter((t) => t.urgencia === 'urgente' && t.esperaHoras !== null);
      expect(urgentes.map((t) => t.esperaHoras)).toEqual([...urgentes.map((t) => t.esperaHoras)].sort((a, b) => b - a));
    });

    it('cada rol ve lo suyo: soporte no ve el dinero pero sí las publicaciones; el super administrador ve todo', async () => {
      const deSoporte = await pedir(soporte);
      expect(deSoporte.status).toBe(200);
      expect(clave(deSoporte, 'retiros')).toBeUndefined();
      expect(clave(deSoporte, 'publicaciones')).toBeDefined();

      const deSuper = await pedir(superAdmin);
      expect(deSuper.status).toBe(200);
      expect(clave(deSuper, 'retiros')).toBeDefined();
    });

    it('si una fuente no se puede leer, lo dice (fallos) y el resto sigue: no muestra «todo al día» sobre algo que no miró', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      jest.spyOn(Job, 'count').mockRejectedValue(new Error('la base no respondió'));
      const r = await pedir(admin);
      expect(r.status).toBe(200);
      expect(r.body.fallos).toEqual(expect.arrayContaining(['Publicaciones por aprobar']));
      expect(clave(r, 'publicaciones')).toBeUndefined();
      expect(clave(r, 'retiros')).toBeDefined();
    });
  });

  describe('aviso de los lugares del beneficio de lanzamiento', () => {
    /** Baja el tope a lo que ya se entregó (el real es 2000: no se pueden crear tantas cuentas) mientras dura la prueba. */
    const conTope = async (f: (entregados: number) => Promise<void>, margen = 0) => {
      const entregados = await User.count({ where: { launchBenefitGrantedAt: { [Op.ne]: null }, mergedIntoId: { [Op.is]: null } } as any });
      const original = POLITICAS.PRIMEROS_USUARIOS_CON_CONTRATOS_LIBRES;
      (POLITICAS as any).PRIMEROS_USUARIOS_CON_CONTRATOS_LIBRES = entregados + margen;
      try {
        await f(entregados);
      } finally {
        (POLITICAS as any).PRIMEROS_USUARIOS_CON_CONTRATOS_LIBRES = original;
      }
    };

    it('con los lugares completos y la plataforma en beta, el DUEÑO ve el aviso (lleva a la fase); el administrador común y soporte no', async () => {
      const dueno = await crearUsuario({ role: 'admin', adminRole: 'owner' });
      await crearUsuario({ role: 'client', dniVerified: true, launchBenefitGrantedAt: haceHoras(20) });
      const esBeta = await isBetaPhase(); // con la fase estable ya se cobra y no hay nada que decidir
      await conTope(async () => {
        const r = await pedir(dueno);
        expect(r.status).toBe(200);
        if (!esBeta) return expect(clave(r, 'lugaresDelLanzamiento')).toBeUndefined();
        expect(clave(r, 'lugaresDelLanzamiento')).toMatchObject({ categoria: 'dinero', cantidad: 1, ruta: '/admin/platform', urgencia: 'importante' }); // espera 20 h: pasó las 12 h
        expect((await pedir(admin)).body.tareas.find((t: any) => t.clave === 'lugaresDelLanzamiento')).toBeUndefined();
        expect((await pedir(soporte)).body.tareas.find((t: any) => t.clave === 'lugaresDelLanzamiento')).toBeUndefined();
      });
    });

    it('si todavía quedan lugares no hay aviso (no se inventa trabajo)', async () => {
      const dueno = await crearUsuario({ role: 'admin', adminRole: 'owner' });
      await conTope(async () => {
        expect(clave(await pedir(dueno), 'lugaresDelLanzamiento')).toBeUndefined();
      }, 1);
    });
  });
});
