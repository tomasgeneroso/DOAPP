import { describe, it, expect, afterAll, jest } from '@jest/globals';
import { Op } from 'sequelize';

/**
 * Contratos LIBRES DE COMISIÓN (no gratuitos): se exime la comisión de DOAPP, pero el costo del trabajo y el del medio de pago se pagan.
 *
 * Antes, con un cupo libre de comisión el servidor publicaba el trabajo sin cobrar nada y lo marcaba como pagado: el costo del trabajo no
 * se cobraba nunca. Acá se prueba la cuenta (sin beta, que es cuando la comisión existe), que el cupo se gasta UNA vez por trabajo y quién lo recibe.
 *
 * Regla del dueño (2026-11-06; reemplaza a «1 por mes durante 12 meses para las primeras 1000 cuentas»): las primeras 2000 PERSONAS VERIFICADAS
 * (registro completo con el documento aprobado por Didit) tienen UN contrato libre de comisión —una sola vez— y 1 mes de PRO gratis; las siguientes, ninguno
 * de los dos. Una persona recibe el beneficio una sola vez aunque tenga dos cuentas. Aparte queda el contador de premios (referidos), que se suma al mismo
 * contador. La membresía PRO también tiene 1 contrato libre por mes y paga una comisión menor en los demás (regla del dueño, 2026-10-25; T&C 8.1).
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
import { Membership } from '../../server/models/sql/Membership.model.js';
import { Notification } from '../../server/models/sql/Notification.model.js';
import { POLITICAS } from '../../shared/constants/policies.js';
import { COMMISSION_RATES } from '../../shared/constants/membershipPricing.js';
import { crearUsuario, crearTrabajo } from '../helpers/fixtures.js';
import {
  asignarContratosLibresAExistentes,
  comisionDePublicacion,
  contratosLibresDisponibles,
  cupoDeLaMembresiaDisponible,
  devolverCupoDeExencion,
  gastarCupoDeExencion,
  inicioDelMes,
  otorgarContratosLibres,
  reclamarContratoLibre,
  reclamarCupoDeLaMembresia,
} from '../../server/services/exencionDeComision.js';
import { vencerElProDeLanzamiento } from '../../server/jobs/vencerElProDeLanzamiento.js';

const DIA = 86_400_000;
const MES = 31 * DIA;

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

/** Cuántas cuentas ya recibieron el beneficio de lanzamiento (ocupan un lugar del tope). */
const conBeneficio = () => User.count({ where: { launchBenefitGrantedAt: { [Op.ne]: null }, mergedIntoId: null } as any });

describe('comisionDePublicacion y cupos libres de comisión', () => {
  const usuarios: string[] = [];
  const trabajos: string[] = [];
  const cuenta = async (over: Record<string, unknown> = {}) => {
    const u: any = await crearUsuario({ role: 'client', freeContractsRemaining: 0, ...over });
    usuarios.push(u.id);
    return u;
  };
  /** Una persona con el registro completo y el documento aprobado: la única que puede recibir el beneficio de lanzamiento. */
  const verificada = (over: Record<string, unknown> = {}) => cuenta({ dniVerified: true, registrationPending: false, ...over });
  const trabajo = async (clientId: string, over: Record<string, unknown> = {}) => {
    const t: any = await crearTrabajo(clientId, { status: 'pending_payment', price: 100000, ...over });
    trabajos.push(t.id);
    return t;
  };
  const leer = async (id: string) => (await User.findByPk(id)) as any;
  const proVigente = (dias = 20) => ({ membershipTier: 'pro', hasMembership: true, membershipExpiresAt: new Date(Date.now() + dias * DIA) });

  afterAll(async () => {
    try {
      await Membership.destroy({ where: { userId: usuarios }, force: true });
      await Notification.destroy({ where: { recipientId: usuarios }, force: true });
      await Job.destroy({ where: { id: trabajos }, force: true });
      await User.destroy({ where: { id: usuarios }, force: true });
    } catch { /* la limpieza no puede hacer fallar el test */ }
  });

  it('las constantes de la regla: 1 contrato libre una vez, 1 mes de PRO, para las primeras 2000 personas verificadas', () => {
    expect([POLITICAS.CONTRATOS_LIBRES_DE_LANZAMIENTO, POLITICAS.MESES_DE_PRO_DE_LANZAMIENTO, POLITICAS.PRIMEROS_USUARIOS_CON_CONTRATOS_LIBRES]).toEqual([1, 1, 2000]);
    expect((POLITICAS as any).MESES_DE_CONTRATOS_LIBRES).toBeUndefined(); // el «1 por mes durante 12 meses» ya no existe
  });

  it('una cuenta nueva no nace con contratos libres ni con el beneficio: lo da otorgarContratosLibres, solo a las primeras verificadas', async () => {
    const u = await cuenta();
    const leida = await leer(u.id);
    expect([leida.freeContractsRemaining, leida.isEarlyUser, leida.launchBenefitGrantedAt]).toEqual([0, false, null]);
  });

  describe('qué se paga', () => {
    it('sin cupos: se paga la comisión de siempre y no se gasta nada', async () => {
      const u = await cuenta({ membershipTier: 'free' });
      const r = await comisionDePublicacion(u, await trabajo(u.id), 100000);
      expect(r.comision.commission).toBeGreaterThan(0);
      expect(r.gastar).toBeNull();
    });

    it('con un contrato en el contador (lanzamiento o premio): comisión 0, y se gasta uno', async () => {
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

    it('PRO tiene su contrato libre de comisión por mes y paga la comisión de PRO en los demás; una cuenta con la membresía vencida no tiene nada de eso', async () => {
      const vigente = await cuenta(proVigente());
      const t1 = await trabajo(vigente.id);
      const r1 = await comisionDePublicacion(vigente, t1, 100000);
      expect([r1.comision.commission, r1.gastar]).toEqual([0, 'pro']);
      expect(await gastarCupoDeExencion(vigente, t1, 'pro')).toBe(true);
      expect((await leer(vigente.id)).freeMonthlyProUsedAt).toBeTruthy();
      // el mes que viene no se suma: este mes ya lo usó, y la segunda publicación paga la tasa reducida de PRO
      // (con un precio alto, para que no mande el piso de la comisión: EUR 2)
      const r2 = await comisionDePublicacion(await leer(vigente.id), await trabajo(vigente.id, { price: 1_000_000 }), 1_000_000);
      expect(r2.gastar).toBeNull();
      expect(r2.comision.rate).toBe(COMMISSION_RATES.pro);
      expect(r2.comision.commission).toBeCloseTo(1_000_000 * (COMMISSION_RATES.pro / 100), 2);

      for (const [tier, vence] of [['pro', -2], ['free', 20]] as const) {
        const u = await cuenta({ membershipTier: tier, hasMembership: tier === 'pro', membershipExpiresAt: new Date(Date.now() + vence * DIA) });
        const r = await comisionDePublicacion(u, await trabajo(u.id), 100000);
        expect([tier, r.comision.commission > 0, r.gastar]).toEqual([tier, true, null]);
      }
    });

    it('PRO y un contrato del contador se SUMAN: son dos, cada uno una sola vez; el tercero del mes paga la comisión de PRO', async () => {
      const u = await cuenta({ ...proVigente(), freeContractsRemaining: 1 });
      expect(contratosLibresDisponibles(await leer(u.id))).toMatchObject({ membresia: 1, bono: 1, total: 2 });
      const [t1, t2, t3] = [await trabajo(u.id), await trabajo(u.id), await trabajo(u.id)];
      const r1 = await comisionDePublicacion(await leer(u.id), t1, 100000);
      expect(r1.gastar).toBe('pro'); // primero el de la membresía (vence a fin de mes)
      expect(await gastarCupoDeExencion(await leer(u.id), t1, 'pro')).toBe(true);
      const r2 = await comisionDePublicacion(await leer(u.id), t2, 100000);
      expect([r2.comision.commission, r2.gastar]).toEqual([0, 'bono']); // y después el del contador
      expect(await gastarCupoDeExencion(await leer(u.id), t2, 'bono')).toBe(true);
      const r3 = await comisionDePublicacion(await leer(u.id), t3, 1_000_000);
      expect(r3.gastar).toBeNull();
      expect(r3.comision.commission).toBeGreaterThan(0);
      expect(contratosLibresDisponibles(await leer(u.id))).toMatchObject({ membresia: 0, bono: 0, total: 0 });
    });

    it('el de la membresía se reclama una sola vez aunque lleguen pagos a la vez', async () => {
      const u = await cuenta(proVigente());
      const r = await Promise.all([reclamarCupoDeLaMembresia(u.id), reclamarCupoDeLaMembresia(u.id), reclamarCupoDeLaMembresia(u.id)]);
      expect(r.filter(Boolean)).toHaveLength(1);
      expect(cupoDeLaMembresiaDisponible(await leer(u.id))).toBe(false);
    });

    it('una cuenta sin PRO vigente no puede reclamar el de la membresía', async () => {
      const sinPro = await cuenta({ membershipTier: 'free' });
      const vencida = await cuenta({ membershipTier: 'pro', hasMembership: true, membershipExpiresAt: new Date(Date.now() - 2 * DIA) });
      expect(await reclamarCupoDeLaMembresia(sinPro.id)).toBe(false);
      expect(await reclamarCupoDeLaMembresia(vencida.id)).toBe(false);
    });

    it('el contrato libre no es gratis: el trabajo y el medio de pago se pagan igual (solo se exime la comisión)', async () => {
      const u = await cuenta({ membershipTier: 'free', freeContractsRemaining: 1 });
      const r = await comisionDePublicacion(u, await trabajo(u.id), 100000);
      expect([r.comision.commission, r.comision.vat, r.comision.totalFee, r.comision.isFreeContract]).toEqual([0, 0, 0, true]);
    });
  });

  describe('gastar y devolver un cupo', () => {
    it('se gasta UNA vez por trabajo: el siguiente trabajo, sin cupo, paga la comisión', async () => {
      const u = await cuenta({ membershipTier: 'free', freeContractsRemaining: 1 });
      const t1 = await trabajo(u.id);
      const r1 = await comisionDePublicacion(u, t1, 100000);
      expect(r1.gastar).toBe('bono');
      expect(await gastarCupoDeExencion(u, t1, 'bono')).toBe(true);
      expect(((await Job.findByPk(t1.id)) as any).commissionFreeApplied).toBe(true);
      expect((await leer(u.id)).freeContractsRemaining).toBe(0);

      const t2 = await trabajo(u.id);
      const r2 = await comisionDePublicacion(await leer(u.id), t2, 100000);
      expect(r2.comision.commission).toBeGreaterThan(0);
      expect(r2.gastar).toBeNull();
    });

    it('la misma publicación sigue libre de comisión después de gastarlo, sin gastar otro', async () => {
      const u = await cuenta({ membershipTier: 'free', freeContractsRemaining: 2 });
      const t = await trabajo(u.id);
      await gastarCupoDeExencion(u, t, 'bono');
      const recargado: any = await Job.findByPk(t.id);
      const otra = await comisionDePublicacion(await leer(u.id), recargado, 100000);
      expect(otra.comision.commission).toBe(0);
      expect(otra.gastar).toBeNull();
      expect((await leer(u.id)).freeContractsRemaining).toBe(1); // se gastó uno solo
    });

    it('el mes cambia a medianoche de Argentina: a las 23:00 del 31/10 todavía es octubre', () => {
      expect(inicioDelMes(new Date('2026-11-01T02:00:00Z')).toISOString()).toBe('2026-10-01T03:00:00.000Z');
      expect(inicioDelMes(new Date('2026-11-01T03:00:00Z')).toISOString()).toBe('2026-11-01T03:00:00.000Z');
    });

    it('el de la membresía que no se usó el mes pasado no se acumula: este mes hay UNO, no dos', async () => {
      const u = await cuenta(proVigente(40));
      await sequelize.query('UPDATE users SET free_monthly_pro_used_at = :d WHERE id = :id', { replacements: { d: new Date(Date.now() - MES), id: u.id } });
      expect(cupoDeLaMembresiaDisponible(await leer(u.id))).toBe(true);
      expect(await reclamarCupoDeLaMembresia(u.id)).toBe(true);
      expect(await reclamarCupoDeLaMembresia(u.id)).toBe(false);
    });

    it('si otro pago ya gastó el de la membresía, gastarCupoDeExencion devuelve false y no marca el trabajo', async () => {
      const u = await cuenta(proVigente());
      expect(await reclamarCupoDeLaMembresia(u.id)).toBe(true);
      const t = await trabajo(u.id);
      expect(await gastarCupoDeExencion(await leer(u.id), t, 'pro')).toBe(false);
      expect(((await Job.findByPk(t.id)) as any).commissionFreeApplied).toBe(false);
    });

    it('devolverCupoDeExencion lo deshace si el pago no se completó (los dos cupos)', async () => {
      const u = await cuenta({ ...proVigente(), freeContractsRemaining: 1 });
      const t = await trabajo(u.id);
      await gastarCupoDeExencion(u, t, 'pro');
      await devolverCupoDeExencion(u, t, 'pro');
      expect((await leer(u.id)).freeMonthlyProUsedAt).toBeNull();
      expect(((await Job.findByPk(t.id)) as any).commissionFreeApplied).toBe(false);
      expect(await reclamarCupoDeLaMembresia(u.id)).toBe(true);

      const t2 = await trabajo(u.id);
      await gastarCupoDeExencion(await leer(u.id), t2, 'bono');
      expect((await leer(u.id)).freeContractsRemaining).toBe(0);
      await devolverCupoDeExencion(await leer(u.id), t2, 'bono');
      expect((await leer(u.id)).freeContractsRemaining).toBe(1);
    });

    it('gastar un contrato del contador nunca baja de cero', async () => {
      const u = await cuenta({ freeContractsRemaining: 0 });
      await gastarCupoDeExencion(u, await trabajo(u.id), 'bono');
      expect((await leer(u.id)).freeContractsRemaining).toBe(0);
    });

    it('lo que se le muestra a la persona: el de la membresía + los del contador', async () => {
      const u = await cuenta({ ...proVigente(), freeContractsRemaining: 2 });
      const d = contratosLibresDisponibles(await leer(u.id));
      expect([d.membresia, d.bono, d.total]).toEqual([1, 2, 3]);
      await reclamarCupoDeLaMembresia(u.id);
      expect(contratosLibresDisponibles(await leer(u.id)).total).toBe(2);
      const comun = contratosLibresDisponibles(await leer((await cuenta()).id));
      expect([comun.membresia, comun.bono, comun.total]).toEqual([0, 0, 0]);
    });

    it('reclamarContratoLibre (rutas con useFreeContract): gasta primero el de la membresía, después uno del contador, y después nada', async () => {
      const u = await cuenta({ ...proVigente(), freeContractsRemaining: 1 });
      expect(await reclamarContratoLibre(u.id)).toBe('pro');
      expect(await reclamarContratoLibre(u.id)).toBe('bono');
      expect(await reclamarContratoLibre(u.id)).toBeNull();
      expect((await leer(u.id)).freeContractsRemaining).toBe(0); // nunca baja de cero
    });
  });

  describe('otorgarContratosLibres: el beneficio de lanzamiento', () => {
    it('a una persona verificada le da UN contrato libre y un mes de PRO, la numera y le avisa', async () => {
      const antes = await conBeneficio();
      await conTope(antes + 5, async () => {
        const a = await verificada();
        const ahora = new Date();
        const r = await otorgarContratosLibres(a.id, ahora);
        expect(r.otorgado).toBe(true);
        const ua = await leer(a.id);
        expect(ua.isEarlyUser).toBe(true);
        expect(ua.earlyUserNumber).toBe(r.numero);
        expect(ua.launchBenefitGrantedAt).toBeTruthy();
        expect(ua.freeContractsRemaining).toBe(POLITICAS.CONTRATOS_LIBRES_DE_LANZAMIENTO);
        expect([ua.membershipTier, ua.hasMembership]).toEqual(['pro', true]);
        const dias = (new Date(ua.membershipExpiresAt).getTime() - ahora.getTime()) / DIA;
        expect(dias).toBeGreaterThan(27);
        expect(dias).toBeLessThan(32);
        const avisos = await Notification.count({ where: { recipientId: a.id } as any });
        expect(avisos).toBe(1);
      });
    });

    it('el contrato libre se usa UNA vez: gastado, el siguiente trabajo paga la comisión de PRO, y vencido el mes, la de siempre', async () => {
      const antes = await conBeneficio();
      await conTope(antes + 5, async () => {
        const a = await verificada();
        await otorgarContratosLibres(a.id);
        const t1 = await trabajo(a.id);
        const r1 = await comisionDePublicacion(await leer(a.id), t1, 1_000_000);
        // Con PRO vigente primero va el contrato libre de PRO del mes; después el del lanzamiento: dos libres el primer mes.
        expect([r1.comision.commission, r1.gastar]).toEqual([0, 'pro']);
        await gastarCupoDeExencion(await leer(a.id), t1, 'pro');
        const t2 = await trabajo(a.id);
        const r2 = await comisionDePublicacion(await leer(a.id), t2, 1_000_000);
        expect([r2.comision.commission, r2.gastar]).toEqual([0, 'bono']);
        await gastarCupoDeExencion(await leer(a.id), t2, 'bono');
        const t3 = await trabajo(a.id);
        const r3 = await comisionDePublicacion(await leer(a.id), t3, 1_000_000);
        expect(r3.gastar).toBeNull();
        expect(r3.comision.rate).toBe(COMMISSION_RATES.pro); // todavía tiene el mes de PRO

        // Se termina el mes de PRO gratis: vuelve a su plan y paga la comisión general.
        await sequelize.query(`UPDATE users SET membership_expires_at = :d WHERE id = :id`, { replacements: { d: new Date(Date.now() - DIA), id: a.id } });
        expect(await vencerElProDeLanzamiento()).toBeGreaterThanOrEqual(1);
        const t4 = await trabajo(a.id);
        const r4 = await comisionDePublicacion(await leer(a.id), t4, 1_000_000);
        expect(r4.gastar).toBeNull();
        expect(r4.comision.rate).toBe(COMMISSION_RATES.free);
      });
    });

    it('una cuenta sin verificar el documento no ocupa un lugar; cuando se verifica, sí', async () => {
      const antes = await conBeneficio();
      await conTope(antes + 5, async () => {
        const a = await cuenta({ dniVerified: false, registrationPending: false });
        expect((await otorgarContratosLibres(a.id)).otorgado).toBe(false);
        const sin = await leer(a.id);
        expect([sin.isEarlyUser, sin.launchBenefitGrantedAt, sin.freeContractsRemaining]).toEqual([false, null, 0]);
        await User.update({ dniVerified: true } as any, { where: { id: a.id } });
        expect((await otorgarContratosLibres(a.id)).otorgado).toBe(true);
      });
    });

    it('una cuenta con el registro a medias (paso 1 sin terminar) no ocupa un lugar; cuando lo completa, sí', async () => {
      const antes = await conBeneficio();
      await conTope(antes + 5, async () => {
        const a = await cuenta({ dniVerified: true, registrationPending: true });
        expect((await otorgarContratosLibres(a.id)).otorgado).toBe(false);
        await User.update({ registrationPending: false } as any, { where: { id: a.id } });
        expect((await otorgarContratosLibres(a.id)).otorgado).toBe(true);
      });
    });

    it('la que llega con el tope completo no lo recibe: ni contrato libre ni PRO, y paga la comisión desde el primer contrato', async () => {
      const antes = await conBeneficio();
      await conTope(antes + 2, async () => {
        const a = await verificada();
        const b = await verificada();
        const c = await verificada({ membershipTier: 'free' });
        const ra = await otorgarContratosLibres(a.id);
        const rb = await otorgarContratosLibres(b.id);
        const rc = await otorgarContratosLibres(c.id);
        expect([ra.otorgado, rb.otorgado, rc.otorgado]).toEqual([true, true, false]);
        expect(rb.numero).toBe((ra.numero as number) + 1);
        const uc = await leer(c.id);
        expect([uc.isEarlyUser, uc.launchBenefitGrantedAt, uc.freeContractsRemaining, uc.membershipTier, uc.hasMembership]).toEqual([false, null, 0, 'free', false]);
        const r = await comisionDePublicacion(uc, await trabajo(c.id), 100000);
        expect(r.comision.commission).toBeGreaterThan(0);
        expect(r.gastar).toBeNull();
      });
    });

    it('no lo da dos veces a la misma cuenta y SUMA al contador sin pisar lo que ya tenía (por ejemplo un premio de referidos)', async () => {
      const antes = await conBeneficio();
      await conTope(antes + 5, async () => {
        const a = await verificada({ freeContractsRemaining: 1 });
        expect((await otorgarContratosLibres(a.id)).otorgado).toBe(true);
        expect((await leer(a.id)).freeContractsRemaining).toBe(1 + POLITICAS.CONTRATOS_LIBRES_DE_LANZAMIENTO);
        expect((await otorgarContratosLibres(a.id)).otorgado).toBe(false);
        expect((await leer(a.id)).freeContractsRemaining).toBe(1 + POLITICAS.CONTRATOS_LIBRES_DE_LANZAMIENTO);
      });
    });

    it('a quien ya paga PRO no le toca la membresía (ni el vencimiento) y recibe el contrato libre', async () => {
      const antes = await conBeneficio();
      await conTope(antes + 5, async () => {
        const vence = new Date(Date.now() + 200 * DIA);
        const a = await verificada({ membershipTier: 'pro', hasMembership: true, membershipExpiresAt: vence });
        expect((await otorgarContratosLibres(a.id)).otorgado).toBe(true);
        const ua = await leer(a.id);
        expect(new Date(ua.membershipExpiresAt).getTime()).toBe(vence.getTime());
        expect(ua.freeContractsRemaining).toBe(1);
      });
    });

    it('una persona con dos cuentas (misma clave de identidad) recibe el beneficio una sola vez', async () => {
      const antes = await conBeneficio();
      await conTope(antes + 5, async () => {
        const clave = `clave-de-prueba-${Date.now().toString(36)}`;
        const argentina = await verificada({ identityKey: clave });
        const italiana = await verificada({ identityKey: clave });
        expect((await otorgarContratosLibres(argentina.id)).otorgado).toBe(true);
        expect((await otorgarContratosLibres(italiana.id)).otorgado).toBe(false);
        const ui = await leer(italiana.id);
        expect([ui.launchBenefitGrantedAt, ui.freeContractsRemaining]).toEqual([null, 0]);
      });
    });

    it('una cuenta unida a otra (la secundaria) no recibe nada', async () => {
      const antes = await conBeneficio();
      await conTope(antes + 5, async () => {
        const principal = await verificada();
        const secundaria = await verificada({ mergedIntoId: principal.id });
        expect((await otorgarContratosLibres(secundaria.id)).otorgado).toBe(false);
      });
    });

    it('bajo altas simultáneas el tope se respeta exacto, sin números repetidos', async () => {
      const antes = await conBeneficio();
      await conTope(antes + 3, async () => {
        const cuentas = await Promise.all([verificada(), verificada(), verificada(), verificada(), verificada(), verificada()]);
        const r = await Promise.all(cuentas.map((u) => otorgarContratosLibres(u.id)));
        expect(r.filter((x) => x.otorgado)).toHaveLength(3);
        expect(await conBeneficio()).toBe(antes + 3);
        const numeros = r.filter((x) => x.otorgado).map((x) => x.numero);
        expect(new Set(numeros).size).toBe(3);
      });
    });

    it('si falla no tira error: la cuenta queda creada sin el beneficio', async () => {
      const r = await otorgarContratosLibres('no-es-un-uuid');
      expect(r.otorgado).toBe(false);
    });
  });

  describe('vencerElProDeLanzamiento: el mes de PRO gratis se termina', () => {
    it('devuelve a su plan solo a quien recibió el beneficio, tiene el PRO vencido y no paga una membresía', async () => {
      const ayer = new Date(Date.now() - DIA);
      const delLanzamiento = await cuenta({ membershipTier: 'pro', hasMembership: true, membershipExpiresAt: ayer, launchBenefitGrantedAt: new Date(Date.now() - 32 * DIA) });
      const quePaga = await cuenta({ membershipTier: 'pro', hasMembership: true, membershipExpiresAt: ayer, launchBenefitGrantedAt: new Date(Date.now() - 32 * DIA) });
      await Membership.create({
        userId: quePaga.id, plan: 'PRO', status: 'active', startDate: new Date(Date.now() - 10 * DIA), endDate: new Date(Date.now() + 20 * DIA),
        priceUSD: 1, priceARS: 1, exchangeRateAtPurchase: 1,
      } as any);
      const sinBeneficio = await cuenta({ membershipTier: 'pro', hasMembership: true, membershipExpiresAt: ayer }); // vencida por otra razón: no es de este barrido
      const vigente = await cuenta({ ...proVigente(10), launchBenefitGrantedAt: new Date(Date.now() - 20 * DIA) });

      await vencerElProDeLanzamiento();

      const [a, b, c, d] = [await leer(delLanzamiento.id), await leer(quePaga.id), await leer(sinBeneficio.id), await leer(vigente.id)];
      expect([a.membershipTier, a.hasMembership]).toEqual(['free', false]);
      expect([b.membershipTier, b.hasMembership]).toEqual(['pro', true]);
      expect([c.membershipTier, c.hasMembership]).toEqual(['pro', true]);
      expect([d.membershipTier, d.hasMembership]).toEqual(['pro', true]);
    });
  });

  describe('asignarContratosLibresAExistentes: las cuentas que ya estaban', () => {
    it('vista previa no escribe; aplicar da el beneficio a las más antiguas verificadas, desmarca a las no verificadas y repetirlo no hace nada', async () => {
      const antes = await conBeneficio();
      // Cuentas "antiguas": las más viejas de la base, así que son las que el reparto toma primero.
      const A = await verificada();
      const P = await verificada({ registrationPending: true }); // registro a medias: no entra
      const B = await verificada({ freeContractsRemaining: 2 });
      const C = await verificada();
      const N = await cuenta({ isEarlyUser: true, dniVerified: false }); // marcada por la regla anterior, sin verificar
      for (const [i, u] of [A, P, B, C, N].entries()) {
        await sequelize.query('UPDATE users SET created_at = :d WHERE id = :id', { replacements: { d: new Date(Date.UTC(2000, 0, 1 + i)), id: u.id } });
      }

      await conTope(antes + 3, async () => {
        const lineas: string[] = [];
        const vista = await asignarContratosLibresAExistentes({ aplicar: false }, (t) => lineas.push(t));
        expect([vista.cuentas, vista.aplicado]).toEqual([3, false]);
        expect(vista.desmarcadas).toBeGreaterThanOrEqual(1);
        expect(lineas.join('\n')).toMatch(/falta --aplicar/);
        expect((await leer(A.id)).launchBenefitGrantedAt).toBeNull(); // la vista previa no escribió nada
        expect((await leer(N.id)).isEarlyUser).toBe(true);

        const r = await asignarContratosLibresAExistentes({ aplicar: true }, () => undefined);
        expect([r.cuentas, r.aplicado]).toEqual([3, true]);
        const [a, p, b, c, n] = [await leer(A.id), await leer(P.id), await leer(B.id), await leer(C.id), await leer(N.id)];
        expect([a.launchBenefitGrantedAt, p.launchBenefitGrantedAt, b.launchBenefitGrantedAt, c.launchBenefitGrantedAt].map(Boolean)).toEqual([true, false, true, true]);
        expect([a.freeContractsRemaining, b.freeContractsRemaining]).toEqual([1, 3]); // suma al contador, sin pisar lo que tenía
        expect([n.isEarlyUser, n.launchBenefitGrantedAt]).toEqual([false, null]); // sin verificar: pierde la marca
        expect([b.earlyUserNumber, c.earlyUserNumber]).toEqual([a.earlyUserNumber + 1, a.earlyUserNumber + 2]);

        const otraVez = await asignarContratosLibresAExistentes({ aplicar: true }, () => undefined);
        expect(otraVez.cuentas).toBe(0); // el tope ya está completo
      });
    });
  });
});
