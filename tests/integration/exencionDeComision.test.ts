import { describe, it, expect, afterAll, jest } from '@jest/globals';

/**
 * Contratos LIBRES DE COMISIÓN (no gratuitos): se exime la comisión de DOAPP, pero el costo del trabajo y el del medio de pago se pagan.
 *
 * Antes, con un cupo libre de comisión el servidor publicaba el trabajo sin cobrar nada y lo marcaba como pagado: el costo del trabajo no
 * se cobraba nunca. Acá se prueba la cuenta (sin beta, que es cuando la comisión existe), que el cupo se gasta UNA vez por trabajo y quién lo recibe.
 *
 * Regla del dueño (2026-10-24): las primeras 2000 cuentas reciben 6 contratos libres de comisión (POLITICAS.CONTRATOS_LIBRES_DE_COMISION y
 * PRIMEROS_USUARIOS_CON_CONTRATOS_LIBRES). La membresía NO tiene cupo propio: no modifica la comisión (T&C 7.3 y 8.1). Antes toda cuenta nacía con 3,
 * PRO tenía 1 por mes (SUPER PRO 2) y un cron mensual lo reseteaba y regalaba un bonus.
 */

jest.mock('../../server/services/platformPhase.js', () => ({
  __esModule: true,
  isBetaPhase: async () => false,
  getEffectiveTier: async (tier: string | null | undefined) => tier || 'free',
  getPhaseInfo: async () => ({ phase: 'real', isBeta: false }),
}));

import { sequelize } from '../../server/config/database.js';
import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { POLITICAS } from '../../shared/constants/policies.js';
import { crearUsuario, crearTrabajo } from '../helpers/fixtures.js';
import {
  asignarContratosLibresAExistentes,
  comisionDePublicacion,
  gastarCupoDeExencion,
  otorgarContratosLibres,
} from '../../server/services/exencionDeComision.js';

/** Cambia el tope de cuentas mientras dura la prueba (el valor real es 2000: no se pueden crear tantas cuentas). */
const conTope = async (tope: number, f: () => Promise<void>) => {
  const original = POLITICAS.PRIMEROS_USUARIOS_CON_CONTRATOS_LIBRES;
  (POLITICAS as any).PRIMEROS_USUARIOS_CON_CONTRATOS_LIBRES = tope;
  try {
    await f();
  } finally {
    (POLITICAS as any).PRIMEROS_USUARIOS_CON_CONTRATOS_LIBRES = original;
  }
};

describe('comisionDePublicacion y cupos libres de comisión', () => {
  const usuarios: string[] = [];
  const trabajos: string[] = [];
  const cuenta = async (over: Record<string, unknown> = {}) => {
    const u: any = await crearUsuario({ role: 'client', freeContractsRemaining: 0, ...over });
    usuarios.push(u.id);
    return u;
  };
  const trabajo = async (clientId: string, over: Record<string, unknown> = {}) => {
    const t: any = await crearTrabajo(clientId, { status: 'pending_payment', price: 100000, ...over });
    trabajos.push(t.id);
    return t;
  };
  const leer = async (id: string) => (await User.findByPk(id)) as any;

  afterAll(async () => {
    try {
      await Job.destroy({ where: { id: trabajos }, force: true });
      await User.destroy({ where: { id: usuarios }, force: true });
    } catch { /* la limpieza no puede hacer fallar el test */ }
  });

  it('las constantes de la regla: 6 contratos para las primeras 2000 cuentas', () => {
    expect([POLITICAS.CONTRATOS_LIBRES_DE_COMISION, POLITICAS.PRIMEROS_USUARIOS_CON_CONTRATOS_LIBRES]).toEqual([6, 2000]);
  });

  it('una cuenta nueva ya no nace con contratos libres: los recibe solo si está entre las primeras', async () => {
    const u: any = await crearUsuario({ role: 'client' });
    usuarios.push(u.id);
    expect((await leer(u.id)).freeContractsRemaining).toBe(0);
  });

  it('sin cupos: se paga la comisión de siempre y no se gasta nada', async () => {
    const u = await cuenta({ membershipTier: 'free' });
    const r = await comisionDePublicacion(u, await trabajo(u.id), 100000);
    expect(r.comision.commission).toBeGreaterThan(0);
    expect(r.gastar).toBeNull();
  });

  it('con cupo: comisión 0, y se gasta el cupo', async () => {
    const u = await cuenta({ membershipTier: 'free', freeContractsRemaining: 3 });
    const r = await comisionDePublicacion(u, await trabajo(u.id), 100000);
    expect(r.comision.commission).toBe(0);
    expect(r.gastar).toBe('inicial');
  });

  it('una cuenta PRO usa el mismo cupo (antes no podía: el cálculo solo miraba las cuentas FREE)', async () => {
    const u = await cuenta({ membershipTier: 'pro', freeContractsRemaining: 2 });
    const r = await comisionDePublicacion(u, await trabajo(u.id), 100000);
    expect(r.comision.commission).toBe(0);
    expect(r.gastar).toBe('inicial');
  });

  it('la membresía NO da un cupo mensual: una cuenta PRO sin contratos libres paga la comisión', async () => {
    for (const tier of ['pro', 'super_pro']) {
      const u = await cuenta({ membershipTier: tier, proContractsUsedThisMonth: 0 });
      const r = await comisionDePublicacion(u, await trabajo(u.id), 100000);
      expect([tier, r.comision.commission > 0, r.gastar]).toEqual([tier, true, null]);
    }
  });

  it('el cupo se gasta UNA vez por trabajo: después sigue libre de comisión pero sin gastar otro', async () => {
    const u = await cuenta({ membershipTier: 'free', freeContractsRemaining: 2 });
    const t = await trabajo(u.id);
    const primera = await comisionDePublicacion(u, t, 100000);
    expect(primera.gastar).toBe('inicial');
    await gastarCupoDeExencion(u, t, 'inicial');
    expect((await leer(u.id)).freeContractsRemaining).toBe(1);
    expect(((await Job.findByPk(t.id)) as any).commissionFreeApplied).toBe(true);

    const recargado: any = await Job.findByPk(t.id);
    const segunda = await comisionDePublicacion(await leer(u.id), recargado, 100000);
    expect(segunda.comision.commission).toBe(0); // sigue libre de comisión
    expect(segunda.gastar).toBeNull(); // pero no gasta otro cupo
  });

  it('gastar el cupo nunca baja de cero', async () => {
    const u = await cuenta({ freeContractsRemaining: 0 });
    await gastarCupoDeExencion(u, await trabajo(u.id), 'inicial');
    expect((await leer(u.id)).freeContractsRemaining).toBe(0);
  });

  describe('otorgarContratosLibres: las primeras cuentas', () => {
    it('cada una de las primeras recibe 6, queda marcada con su número, y la que llega con el tope completo no recibe nada', async () => {
      const marcadas = await User.count({ where: { isEarlyUser: true } });
      await conTope(marcadas + 2, async () => {
        const a = await cuenta();
        const b = await cuenta();
        const c = await cuenta();

        const ra = await otorgarContratosLibres(a.id);
        const rb = await otorgarContratosLibres(b.id);
        const rc = await otorgarContratosLibres(c.id);

        expect([ra.otorgado, rb.otorgado, rc.otorgado]).toEqual([true, true, false]);
        expect(rb.numero).toBe((ra.numero as number) + 1);
        const [ua, ub, uc] = [await leer(a.id), await leer(b.id), await leer(c.id)];
        expect([ua.freeContractsRemaining, ub.freeContractsRemaining, uc.freeContractsRemaining]).toEqual([6, 6, 0]);
        expect([ua.isEarlyUser, ub.isEarlyUser, uc.isEarlyUser]).toEqual([true, true, false]);
        expect(ua.earlyUserNumber).toBe(ra.numero);
      });
    });

    it('no da dos veces a la misma cuenta', async () => {
      const marcadas = await User.count({ where: { isEarlyUser: true } });
      await conTope(marcadas + 5, async () => {
        const a = await cuenta();
        expect((await otorgarContratosLibres(a.id)).otorgado).toBe(true);
        expect((await otorgarContratosLibres(a.id)).otorgado).toBe(false);
        expect((await leer(a.id)).freeContractsRemaining).toBe(6);
      });
    });

    it('suma a lo que la cuenta ya tenía (por ejemplo, el contrato que da un código de referido)', async () => {
      const marcadas = await User.count({ where: { isEarlyUser: true } });
      await conTope(marcadas + 5, async () => {
        const a = await cuenta({ freeContractsRemaining: 1 });
        await otorgarContratosLibres(a.id);
        expect((await leer(a.id)).freeContractsRemaining).toBe(7);
      });
    });

    it('bajo altas simultáneas el tope se respeta exacto', async () => {
      const marcadas = await User.count({ where: { isEarlyUser: true } });
      await conTope(marcadas + 3, async () => {
        const cuentas = await Promise.all([cuenta(), cuenta(), cuenta(), cuenta(), cuenta(), cuenta()]);
        const r = await Promise.all(cuentas.map((u) => otorgarContratosLibres(u.id)));
        expect(r.filter((x) => x.otorgado)).toHaveLength(3);
        expect(await User.count({ where: { isEarlyUser: true } })).toBe(marcadas + 3);
        const numeros = r.filter((x) => x.otorgado).map((x) => x.numero);
        expect(new Set(numeros).size).toBe(3); // sin números repetidos
      });
    });

    it('si falla no tira error: la cuenta queda creada sin cupo', async () => {
      const r = await otorgarContratosLibres('no-es-un-uuid');
      expect(r.otorgado).toBe(false);
    });
  });

  describe('asignarContratosLibresAExistentes: las cuentas que ya estaban', () => {
    it('vista previa no escribe; aplicar deja a cada una en 6 menos lo gastado (sin bajar lo que tenía de más) y repetirlo no hace nada', async () => {
      const marcadas = await User.count({ where: { isEarlyUser: true } });
      // Tres cuentas "antiguas": las más viejas de la base, así que son las que el reparto toma primero.
      const A = await cuenta({ freeContractsRemaining: 0 });
      const B = await cuenta({ freeContractsRemaining: 2 });
      const C = await cuenta({ freeContractsRemaining: 9 });
      for (const [i, u] of [A, B, C].entries()) {
        await sequelize.query('UPDATE users SET created_at = :d WHERE id = :id', { replacements: { d: new Date(Date.UTC(2000, 0, 1 + i)), id: u.id } });
      }
      // A ya gastó un contrato libre en un trabajo.
      await trabajo(A.id, { status: 'open', commissionFreeApplied: true });

      await conTope(marcadas + 3, async () => {
        const lineas: string[] = [];
        const vista = await asignarContratosLibresAExistentes({ aplicar: false }, (t) => lineas.push(t));
        expect([vista.cuentas, vista.conCambio, vista.contratosSumados, vista.aplicado]).toEqual([3, 2, 5 + 4, false]);
        expect(lineas.join('\n')).toMatch(/falta --aplicar/);
        expect((await leer(A.id)).isEarlyUser).toBe(false); // la vista previa no escribió nada
        expect((await leer(A.id)).freeContractsRemaining).toBe(0);

        const r = await asignarContratosLibresAExistentes({ aplicar: true }, () => undefined);
        expect([r.cuentas, r.aplicado]).toEqual([3, true]);
        const [a, b, c] = [await leer(A.id), await leer(B.id), await leer(C.id)];
        expect([a.freeContractsRemaining, b.freeContractsRemaining, c.freeContractsRemaining]).toEqual([5, 6, 9]);
        expect([a.isEarlyUser, b.isEarlyUser, c.isEarlyUser]).toEqual([true, true, true]);
        expect([b.earlyUserNumber, c.earlyUserNumber]).toEqual([a.earlyUserNumber + 1, a.earlyUserNumber + 2]);

        const otraVez = await asignarContratosLibresAExistentes({ aplicar: true }, () => undefined);
        expect(otraVez.cuentas).toBe(0); // el tope ya está completo
      });
    });
  });
});
