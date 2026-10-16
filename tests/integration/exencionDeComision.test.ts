import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';

/**
 * Contratos LIBRES DE COMISIÓN (no gratuitos): se exime la comisión de DOAPP, pero el costo del trabajo y el del medio de pago se pagan.
 *
 * Antes, con un cupo libre de comisión el servidor publicaba el trabajo sin cobrar nada y lo marcaba como pagado: el costo del trabajo no
 * se cobraba nunca. Acá se prueba la cuenta (sin beta, que es cuando la comisión existe) y que cada cupo se gasta UNA vez por trabajo.
 */

jest.mock('../../server/services/platformPhase.js', () => ({
  __esModule: true,
  isBetaPhase: async () => false,
  getEffectiveTier: async (tier: string | null | undefined) => tier || 'free',
  getPhaseInfo: async () => ({ phase: 'real', isBeta: false }),
}));

import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { crearUsuario, crearTrabajo } from '../helpers/fixtures.js';
import { comisionDePublicacion, gastarCupoDeExencion } from '../../server/services/exencionDeComision.js';

describe('comisionDePublicacion y cupos libres de comisión', () => {
  const usuarios: string[] = [];
  const trabajos: string[] = [];
  const cuenta = async (over: Record<string, unknown> = {}) => {
    const u: any = await crearUsuario({ role: 'client', freeContractsRemaining: 0, proContractsUsedThisMonth: 0, ...over });
    usuarios.push(u.id);
    return u;
  };
  const trabajo = async (clientId: string) => {
    const t: any = await crearTrabajo(clientId, { status: 'pending_payment', price: 100000 });
    trabajos.push(t.id);
    return t;
  };

  afterAll(async () => {
    try {
      await Job.destroy({ where: { id: trabajos }, force: true });
      await User.destroy({ where: { id: usuarios }, force: true });
    } catch { /* la limpieza no puede hacer fallar el test */ }
  });

  it('sin cupos: se paga la comisión de siempre y no se gasta nada', async () => {
    const u = await cuenta({ membershipTier: 'free' });
    const r = await comisionDePublicacion(u, await trabajo(u.id), 100000);
    expect(r.comision.commission).toBeGreaterThan(0);
    expect(r.gastar).toBeNull();
  });

  it('cupo inicial: comisión 0, y se gasta el inicial', async () => {
    const u = await cuenta({ membershipTier: 'free', freeContractsRemaining: 3 });
    const r = await comisionDePublicacion(u, await trabajo(u.id), 100000);
    expect(r.comision.commission).toBe(0);
    expect(r.gastar).toBe('inicial');
  });

  it('cupo mensual de la membresía PRO: comisión 0, y se gasta el mensual', async () => {
    const u = await cuenta({ membershipTier: 'pro', proContractsUsedThisMonth: 0 });
    const r = await comisionDePublicacion(u, await trabajo(u.id), 100000);
    expect(r.comision.commission).toBe(0);
    expect(r.gastar).toBe('mensual');
  });

  it('PRO con el cupo mensual agotado paga la comisión', async () => {
    const u = await cuenta({ membershipTier: 'pro', proContractsUsedThisMonth: 1 });
    const r = await comisionDePublicacion(u, await trabajo(u.id), 100000);
    expect(r.comision.commission).toBeGreaterThan(0);
    expect(r.gastar).toBeNull();
  });

  it('el cupo se gasta UNA vez por trabajo: después sigue libre de comisión pero sin gastar otro', async () => {
    const u = await cuenta({ membershipTier: 'free', freeContractsRemaining: 2 });
    const t = await trabajo(u.id);
    const primera = await comisionDePublicacion(u, t, 100000);
    expect(primera.gastar).toBe('inicial');
    await gastarCupoDeExencion(u, t, 'inicial');
    expect(((await User.findByPk(u.id)) as any).freeContractsRemaining).toBe(1);
    expect(((await Job.findByPk(t.id)) as any).commissionFreeApplied).toBe(true);

    const recargado: any = await Job.findByPk(t.id);
    const segunda = await comisionDePublicacion((await User.findByPk(u.id)) as any, recargado, 100000);
    expect(segunda.comision.commission).toBe(0); // sigue libre de comisión
    expect(segunda.gastar).toBeNull(); // pero no gasta otro cupo
  });

  it('gastar un cupo mensual suma uno al contador del mes', async () => {
    const u = await cuenta({ membershipTier: 'pro', proContractsUsedThisMonth: 0 });
    const t = await trabajo(u.id);
    await gastarCupoDeExencion(u, t, 'mensual');
    expect(((await User.findByPk(u.id)) as any).proContractsUsedThisMonth).toBe(1);
  });
});
