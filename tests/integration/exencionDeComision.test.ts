import { describe, it, expect, afterAll, jest } from '@jest/globals';

/**
 * Contratos LIBRES DE COMISIÓN (no gratuitos): se exime la comisión de DOAPP, pero el costo del trabajo y el del medio de pago se pagan.
 *
 * Antes, con un cupo libre de comisión el servidor publicaba el trabajo sin cobrar nada y lo marcaba como pagado: el costo del trabajo no
 * se cobraba nunca. Acá se prueba la cuenta (sin beta, que es cuando la comisión existe), que el cupo se gasta UNA vez por trabajo y quién lo recibe.
 *
 * Regla del dueño (2026-10-24, segunda versión): las primeras 1000 cuentas (con el registro completo) tienen 1 contrato libre de comisión por mes durante
 * 12 meses (POLITICAS.CONTRATOS_LIBRES_POR_MES / MESES_DE_CONTRATOS_LIBRES / PRIMEROS_USUARIOS_CON_CONTRATOS_LIBRES), con cualquier plan; el mes que no se
 * usa se pierde. Aparte queda el contador de premios (referidos). La membresía NO tiene cupo propio: no modifica la comisión (T&C 7.3 y 8.1).
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
  contratosLibresDisponibles,
  cupoMensualDisponible,
  devolverCupoDeExencion,
  gastarCupoDeExencion,
  inicioDelMes,
  otorgarContratosLibres,
  reclamarContratoLibre,
  reclamarCupoMensual,
  ventanaDelBeneficio,
} from '../../server/services/exencionDeComision.js';

/** Cambia el tope de cuentas mientras dura la prueba (el valor real es 1000: no se pueden crear tantas cuentas). */
const conTope = async (tope: number, f: () => Promise<void>) => {
  const original = POLITICAS.PRIMEROS_USUARIOS_CON_CONTRATOS_LIBRES;
  (POLITICAS as any).PRIMEROS_USUARIOS_CON_CONTRATOS_LIBRES = tope;
  try {
    await f();
  } finally {
    (POLITICAS as any).PRIMEROS_USUARIOS_CON_CONTRATOS_LIBRES = original;
  }
};

const MES = 31 * 24 * 3_600_000;

describe('comisionDePublicacion y cupos libres de comisión', () => {
  const usuarios: string[] = [];
  const trabajos: string[] = [];
  const cuenta = async (over: Record<string, unknown> = {}) => {
    const u: any = await crearUsuario({ role: 'client', freeContractsRemaining: 0, ...over });
    usuarios.push(u.id);
    return u;
  };
  /** Una de las primeras cuentas, con el beneficio mensual vigente. */
  const primera = (over: Record<string, unknown> = {}) => cuenta({ isEarlyUser: true, ...over });
  const trabajo = async (clientId: string, over: Record<string, unknown> = {}) => {
    const t: any = await crearTrabajo(clientId, { status: 'pending_payment', price: 100000, ...over });
    trabajos.push(t.id);
    return t;
  };
  const leer = async (id: string) => (await User.findByPk(id)) as any;
  const retroceder = (id: string, ms: number) =>
    sequelize.query('UPDATE users SET created_at = :d WHERE id = :id', { replacements: { d: new Date(Date.now() - ms), id } });

  afterAll(async () => {
    try {
      await Job.destroy({ where: { id: trabajos }, force: true });
      await User.destroy({ where: { id: usuarios }, force: true });
    } catch { /* la limpieza no puede hacer fallar el test */ }
  });

  it('las constantes de la regla: 1 contrato por mes, durante 12 meses, para las primeras 1000 cuentas', () => {
    expect([POLITICAS.CONTRATOS_LIBRES_POR_MES, POLITICAS.MESES_DE_CONTRATOS_LIBRES, POLITICAS.PRIMEROS_USUARIOS_CON_CONTRATOS_LIBRES]).toEqual([1, 12, 1000]);
  });

  it('una cuenta nueva no nace con contratos libres ni marcada: la marca y el beneficio los da otorgarContratosLibres, solo a las primeras', async () => {
    const u = await cuenta();
    const leida = await leer(u.id);
    expect([leida.freeContractsRemaining, leida.isEarlyUser, leida.freeMonthlyUsedAt]).toEqual([0, false, null]);
  });

  describe('qué se paga', () => {
    it('sin cupos: se paga la comisión de siempre y no se gasta nada', async () => {
      const u = await cuenta({ membershipTier: 'free' });
      const r = await comisionDePublicacion(u, await trabajo(u.id), 100000);
      expect(r.comision.commission).toBeGreaterThan(0);
      expect(r.gastar).toBeNull();
    });

    it('con premios en el contador: comisión 0, y se gasta uno', async () => {
      const u = await cuenta({ membershipTier: 'free', freeContractsRemaining: 3 });
      const r = await comisionDePublicacion(u, await trabajo(u.id), 100000);
      expect(r.comision.commission).toBe(0);
      expect(r.gastar).toBe('bono');
    });

    it('una cuenta PRO usa el mismo contador (antes no podía: el cálculo solo miraba las cuentas FREE)', async () => {
      const u = await cuenta({ membershipTier: 'pro', freeContractsRemaining: 2 });
      const r = await comisionDePublicacion(u, await trabajo(u.id), 100000);
      expect(r.comision.commission).toBe(0);
      expect(r.gastar).toBe('bono');
    });

    it('la membresía NO da un cupo mensual: una cuenta PRO que no es de las primeras paga la comisión', async () => {
      for (const tier of ['pro', 'super_pro']) {
        const u = await cuenta({ membershipTier: tier, proContractsUsedThisMonth: 0 });
        const r = await comisionDePublicacion(u, await trabajo(u.id), 100000);
        expect([tier, r.comision.commission > 0, r.gastar]).toEqual([tier, true, null]);
      }
    });

    it('una de las primeras cuentas tiene el contrato libre del mes: comisión 0 y se gasta el del mes', async () => {
      const u = await primera({ membershipTier: 'free' });
      const r = await comisionDePublicacion(u, await trabajo(u.id), 100000);
      expect(r.comision.commission).toBe(0);
      expect(r.gastar).toBe('mensual');
    });

    it('el del mes vale con cualquier plan, y el trabajo y el medio de pago se pagan igual (solo se exime la comisión)', async () => {
      const u = await primera({ membershipTier: 'pro' });
      const r = await comisionDePublicacion(u, await trabajo(u.id), 100000);
      expect([r.comision.commission, r.comision.vat, r.comision.totalFee, r.comision.isFreeContract]).toEqual([0, 0, 0, true]);
    });
  });

  describe('el contrato libre del mes', () => {
    it('se gasta UNA vez por mes: la segunda publicación del mes paga la comisión', async () => {
      const u = await primera();
      const t1 = await trabajo(u.id);
      const r1 = await comisionDePublicacion(u, t1, 100000);
      expect(r1.gastar).toBe('mensual');
      expect(await gastarCupoDeExencion(u, t1, 'mensual')).toBe(true);
      expect(((await Job.findByPk(t1.id)) as any).commissionFreeApplied).toBe(true);
      expect((await leer(u.id)).freeMonthlyUsedAt).toBeTruthy();

      const t2 = await trabajo(u.id);
      const r2 = await comisionDePublicacion(await leer(u.id), t2, 100000);
      expect(r2.comision.commission).toBeGreaterThan(0);
      expect(r2.gastar).toBeNull();
    });

    it('la misma publicación sigue libre de comisión después de gastarlo, sin gastar otro', async () => {
      const u = await primera();
      const t = await trabajo(u.id);
      await gastarCupoDeExencion(u, t, 'mensual');
      const recargado: any = await Job.findByPk(t.id);
      const otra = await comisionDePublicacion(await leer(u.id), recargado, 100000);
      expect(otra.comision.commission).toBe(0);
      expect(otra.gastar).toBeNull();
    });

    it('el mes que no se usa se pierde: el mes siguiente hay UNO, no dos', async () => {
      const u = await primera();
      // Lo usó el mes pasado.
      await sequelize.query('UPDATE users SET free_monthly_used_at = :d WHERE id = :id', { replacements: { d: new Date(Date.now() - MES), id: u.id } });
      expect(cupoMensualDisponible(await leer(u.id))).toBe(true);
      expect(await reclamarCupoMensual(u.id)).toBe(true);
      expect(await reclamarCupoMensual(u.id)).toBe(false); // no se acumula
      expect(cupoMensualDisponible(await leer(u.id))).toBe(false);
    });

    it('el mes cambia a medianoche de Argentina: a las 23:00 del 31/10 todavía es octubre', () => {
      expect(inicioDelMes(new Date('2026-11-01T02:00:00Z')).toISOString()).toBe('2026-10-01T03:00:00.000Z');
      expect(inicioDelMes(new Date('2026-11-01T03:00:00Z')).toISOString()).toBe('2026-11-01T03:00:00.000Z');
    });

    it('dos pagos simultáneos no gastan el mismo: solo uno lo reclama', async () => {
      const u = await primera();
      const r = await Promise.all([reclamarCupoMensual(u.id), reclamarCupoMensual(u.id), reclamarCupoMensual(u.id)]);
      expect(r.filter(Boolean)).toHaveLength(1);
    });

    it('si otro pago ya lo gastó, gastarCupoDeExencion devuelve false y no marca el trabajo', async () => {
      const u = await primera();
      expect(await reclamarCupoMensual(u.id)).toBe(true);
      const t = await trabajo(u.id);
      expect(await gastarCupoDeExencion(await leer(u.id), t, 'mensual')).toBe(false);
      expect(((await Job.findByPk(t.id)) as any).commissionFreeApplied).toBe(false);
    });

    it('devolverCupoDeExencion lo deshace si el pago no se completó', async () => {
      const u = await primera();
      const t = await trabajo(u.id);
      await gastarCupoDeExencion(u, t, 'mensual');
      await devolverCupoDeExencion(u, t, 'mensual');
      expect((await leer(u.id)).freeMonthlyUsedAt).toBeNull();
      expect(((await Job.findByPk(t.id)) as any).commissionFreeApplied).toBe(false);
      expect(await reclamarCupoMensual(u.id)).toBe(true);
    });

    it('va antes que el contador de premios (vence a fin de mes); gastado, sigue el contador', async () => {
      const u = await primera({ freeContractsRemaining: 2 });
      const t1 = await trabajo(u.id);
      expect((await comisionDePublicacion(u, t1, 100000)).gastar).toBe('mensual');
      await gastarCupoDeExencion(u, t1, 'mensual');
      expect((await leer(u.id)).freeContractsRemaining).toBe(2); // el contador no se tocó

      const t2 = await trabajo(u.id);
      const r2 = await comisionDePublicacion(await leer(u.id), t2, 100000);
      expect([r2.comision.commission, r2.gastar]).toEqual([0, 'bono']);
    });
  });

  describe('el año del beneficio', () => {
    it('una cuenta de hace 11 meses todavía lo tiene; una de hace 13, no', async () => {
      const dentro = await primera();
      const fuera = await primera();
      await retroceder(dentro.id, 11 * MES);
      await retroceder(fuera.id, 13 * MES);
      expect(cupoMensualDisponible(await leer(dentro.id))).toBe(true);
      expect(cupoMensualDisponible(await leer(fuera.id))).toBe(false);
      expect(await reclamarCupoMensual(fuera.id)).toBe(false); // el servidor también lo comprueba, no solo la vista
      const r = await comisionDePublicacion(await leer(fuera.id), await trabajo(fuera.id), 100000);
      expect([r.comision.commission > 0, r.gastar]).toEqual([true, null]);
    });

    it('el año arranca cuando empieza a cobrarse comisión (fin de la beta); si la cuenta se crea después, el día del alta', () => {
      const alta = new Date('2026-10-01T12:00:00Z');
      const cobro = new Date('2027-01-01T03:00:00Z');
      const v = ventanaDelBeneficio({ createdAt: alta }, cobro)!;
      expect(v.desde.toISOString()).toBe('2027-01-01T03:00:00.000Z');
      expect(v.hasta.toISOString()).toBe('2028-01-01T03:00:00.000Z');
      // Durante la beta (antes del cobro) todavía no corre.
      expect(cupoMensualDisponible({ id: 'x', isEarlyUser: true, createdAt: alta }, new Date('2026-12-15T00:00:00Z'), cobro)).toBe(false);
      expect(cupoMensualDisponible({ id: 'x', isEarlyUser: true, createdAt: alta }, new Date('2027-01-02T00:00:00Z'), cobro)).toBe(true);
      // Una cuenta creada después del cobro cuenta desde su alta.
      const tarde = new Date('2027-03-10T00:00:00Z');
      expect(ventanaDelBeneficio({ createdAt: tarde }, cobro)!.desde.toISOString()).toBe(tarde.toISOString());
      // Fin del año: el último día entra, el siguiente no.
      expect(cupoMensualDisponible({ id: 'x', isEarlyUser: true, createdAt: alta }, new Date('2027-12-31T23:00:00Z'), cobro)).toBe(true);
      expect(cupoMensualDisponible({ id: 'x', isEarlyUser: true, createdAt: alta }, new Date('2028-01-01T03:00:00Z'), cobro)).toBe(false);
    });

    it('lo que se le muestra a la persona: el del mes + los premios, y hasta cuándo dura', async () => {
      const u = await primera({ freeContractsRemaining: 2 });
      const d = contratosLibresDisponibles(await leer(u.id));
      expect([d.mensual, d.bono, d.total]).toEqual([1, 2, 3]);
      expect(d.hasta).toBeTruthy();
      await reclamarCupoMensual(u.id);
      expect(contratosLibresDisponibles(await leer(u.id)).total).toBe(2);
      const comun = contratosLibresDisponibles(await leer((await cuenta()).id));
      expect([comun.mensual, comun.total, comun.hasta]).toEqual([0, 0, null]);
    });
  });

  describe('reclamarContratoLibre (las rutas que crean un contrato con useFreeContract)', () => {
    it('gasta primero el del mes, después uno del contador, y después nada', async () => {
      const u = await primera({ freeContractsRemaining: 1 });
      expect(await reclamarContratoLibre(u.id)).toBe('mensual');
      expect(await reclamarContratoLibre(u.id)).toBe('bono');
      expect(await reclamarContratoLibre(u.id)).toBeNull();
      expect((await leer(u.id)).freeContractsRemaining).toBe(0); // nunca baja de cero
    });
  });

  it('gastar un premio del contador nunca baja de cero', async () => {
    const u = await cuenta({ freeContractsRemaining: 0 });
    await gastarCupoDeExencion(u, await trabajo(u.id), 'bono');
    expect((await leer(u.id)).freeContractsRemaining).toBe(0);
  });

  describe('otorgarContratosLibres: las primeras cuentas', () => {
    it('marca a cada una de las primeras con su número, y la que llega con el tope completo no se marca', async () => {
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
        expect([ua.isEarlyUser, ub.isEarlyUser, uc.isEarlyUser]).toEqual([true, true, false]);
        expect(ua.earlyUserNumber).toBe(ra.numero);
        // La marca no regala contratos sueltos: el beneficio es el del mes.
        expect([ua.freeContractsRemaining, ub.freeContractsRemaining, uc.freeContractsRemaining]).toEqual([0, 0, 0]);
      });
    });

    it('una cuenta con el registro a medias (paso 1 sin terminar) no ocupa un lugar; cuando lo completa, sí', async () => {
      const marcadas = await User.count({ where: { isEarlyUser: true } });
      await conTope(marcadas + 5, async () => {
        const a = await cuenta({ registrationPending: true });
        expect((await otorgarContratosLibres(a.id)).otorgado).toBe(false);
        expect((await leer(a.id)).isEarlyUser).toBe(false);
        await User.update({ registrationPending: false } as any, { where: { id: a.id } });
        expect((await otorgarContratosLibres(a.id)).otorgado).toBe(true);
      });
    });

    it('no marca dos veces a la misma cuenta y no toca lo que ya tenía (por ejemplo un premio de referidos)', async () => {
      const marcadas = await User.count({ where: { isEarlyUser: true } });
      await conTope(marcadas + 5, async () => {
        const a = await cuenta({ freeContractsRemaining: 1 });
        expect((await otorgarContratosLibres(a.id)).otorgado).toBe(true);
        expect((await otorgarContratosLibres(a.id)).otorgado).toBe(false);
        expect((await leer(a.id)).freeContractsRemaining).toBe(1);
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

    it('si falla no tira error: la cuenta queda creada sin el beneficio', async () => {
      const r = await otorgarContratosLibres('no-es-un-uuid');
      expect(r.otorgado).toBe(false);
    });
  });

  describe('asignarContratosLibresAExistentes: las cuentas que ya estaban', () => {
    it('vista previa no escribe; aplicar marca a las más antiguas con el registro completo (sin tocar lo que tenían) y repetirlo no hace nada', async () => {
      const marcadas = await User.count({ where: { isEarlyUser: true } });
      // Cuatro cuentas "antiguas": las más viejas de la base, así que son las que el reparto toma primero. La del medio tiene el registro a medias.
      const A = await cuenta({ freeContractsRemaining: 0 });
      const P = await cuenta({ freeContractsRemaining: 0, registrationPending: true });
      const B = await cuenta({ freeContractsRemaining: 2 });
      const C = await cuenta({ freeContractsRemaining: 9 });
      for (const [i, u] of [A, P, B, C].entries()) {
        await sequelize.query('UPDATE users SET created_at = :d WHERE id = :id', { replacements: { d: new Date(Date.UTC(2000, 0, 1 + i)), id: u.id } });
      }

      await conTope(marcadas + 3, async () => {
        const lineas: string[] = [];
        const vista = await asignarContratosLibresAExistentes({ aplicar: false }, (t) => lineas.push(t));
        expect([vista.cuentas, vista.aplicado]).toEqual([3, false]);
        expect(lineas.join('\n')).toMatch(/falta --aplicar/);
        expect((await leer(A.id)).isEarlyUser).toBe(false); // la vista previa no escribió nada

        const r = await asignarContratosLibresAExistentes({ aplicar: true }, () => undefined);
        expect([r.cuentas, r.aplicado]).toEqual([3, true]);
        const [a, p, b, c] = [await leer(A.id), await leer(P.id), await leer(B.id), await leer(C.id)];
        expect([a.isEarlyUser, p.isEarlyUser, b.isEarlyUser, c.isEarlyUser]).toEqual([true, false, true, true]);
        expect([a.freeContractsRemaining, b.freeContractsRemaining, c.freeContractsRemaining]).toEqual([0, 2, 9]); // no se toca el contador
        expect([b.earlyUserNumber, c.earlyUserNumber]).toEqual([a.earlyUserNumber + 1, a.earlyUserNumber + 2]);

        const otraVez = await asignarContratosLibresAExistentes({ aplicar: true }, () => undefined);
        expect(otraVez.cuentas).toBe(0); // el tope ya está completo
      });
    });

    it('avisa de las cuentas marcadas con el cupo de la regla anterior (6 o más en el contador) y no las toca', async () => {
      const marcadas = await User.count({ where: { isEarlyUser: true } });
      const vieja = await cuenta({ isEarlyUser: true, freeContractsRemaining: 6 });
      await conTope(marcadas + 1, async () => {
        const lineas: string[] = [];
        const r = await asignarContratosLibresAExistentes({ aplicar: false }, (t) => lineas.push(t));
        expect(r.conCupoDeLaReglaAnterior).toBeGreaterThanOrEqual(1);
        expect(lineas.join('\n')).toMatch(/regla anterior/);
      });
      expect((await leer(vieja.id)).freeContractsRemaining).toBe(6);
    });
  });
});
