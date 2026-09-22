import { sequelize } from '../../../server/config/database.js';
import { User } from '../../../server/models/sql/User.model.js';
import { calculateCommission } from '../../../server/services/commissionService.js';
import {
  setPlatformPhase,
  getPlatformPhase,
  __resetPhaseCache,
} from '../../../server/services/platformPhase.js';
import { splitFees } from '../../../shared/pricing/processingCost.js';
import { COMMISSION_RATES } from '../../../shared/constants/membershipPricing.js';

/**
 * El flujo de plata completo, en las dos fases.
 *
 * Por que existe: el 31/12/2026 la plataforma pasa de beta a estable y de un
 * dia para otro empieza a cobrar comision. Para entonces la app va a estar en
 * uso, con contratos abiertos y plata de terceros adentro. Un error ahi no es
 * un bug: es plata que no cierra.
 *
 * Lo que se verifica no es que los numeros sean unos numeros particulares, sino
 * que la CUENTA CIERRE: que lo que paga el cliente sea exactamente lo que se
 * reparten la pasarela (tarifa + su IVA), el trabajador y la plataforma. Esa
 * invariante tiene que valer en las dos fases y en cualquier precio.
 */

const TICKETS = [5000, 20000, 40000, 100000, 300000];
const FEE_RATE = 0.0419; // tarjeta de credito, liberacion a 10 dias, sin IVA

let userId: string;
let faseOriginal: 'beta' | 'live';

beforeAll(async () => {
  const u = await User.create({
    username: `flujo_${Date.now()}`,
    name: 'Usuario Flujo',
    email: `flujo-${Date.now()}@flujo.test`,
    password: 'x',
    role: 'client',
    // Sin contratos gratis: un usuario nuevo tiene 3 y pagaria 0% aunque la
    // fase sea estable, lo que taparia justamente lo que se quiere medir.
    freeContractsRemaining: 0,
  } as any);
  userId = u.id;
  faseOriginal = await getPlatformPhase();
});

afterAll(async () => {
  // La fase es estado global: dejarla cambiada arruinaria cualquier otro test.
  await setPlatformPhase(faseOriginal);
  __resetPhaseCache();
  await User.destroy({ where: { id: userId } });
  await sequelize.close();
});

async function enFase(fase: 'beta' | 'live') {
  await setPlatformPhase(fase);
  __resetPhaseCache();
}

describe('la cuenta cierra en las dos fases', () => {
  for (const fase of ['beta', 'live'] as const) {
    describe(`fase ${fase}`, () => {
      beforeAll(() => enFase(fase));

      it.each(TICKETS)('con un trabajo de ARS $%i, todo lo cobrado se reparte', async (precio) => {
        const c = await calculateCommission(userId, precio);
        const s = splitFees(precio, c.commission, c.vat, FEE_RATE);

        // La invariante: nada se pierde ni aparece de la nada.
        const repartido = s.processingCost + s.processingCostVat + s.workerReceives + s.platformKeeps;
        expect(Math.abs(s.clientPays - repartido)).toBeLessThan(0.05);
      });

      it('el trabajador recibe el precio entero', async () => {
        for (const precio of TICKETS) {
          const c = await calculateCommission(userId, precio);
          const s = splitFees(precio, c.commission, c.vat, FEE_RATE);
          expect(s.workerReceives).toBe(precio);
        }
      });

      it('a la plataforma le queda comision + IVA: el procesamiento cobrado cubre la tarifa de MP', async () => {
        const c = await calculateCommission(userId, 40000);
        const s = splitFees(40000, c.commission, c.vat, FEE_RATE);
        expect(s.platformKeeps).toBeCloseTo(c.commission + c.vat, 0);
      });
    });
  }
});

describe('lo que cambia entre una fase y la otra', () => {
  it('en beta no se cobra comision ni IVA', async () => {
    await enFase('beta');
    const c = await calculateCommission(userId, 40000);
    expect(c.commission).toBe(0);
    expect(c.vat).toBe(0);
  });

  it('en beta el cliente paga el precio del trabajo mas el procesamiento, y nada mas', async () => {
    await enFase('beta');
    const c = await calculateCommission(userId, 40000);
    const s = splitFees(40000, c.commission, c.vat, FEE_RATE);
    expect(s.commission).toBe(0);
    expect(s.clientPays).toBeCloseTo(40000 + s.processingCharge + s.processingVat, 2);
    // Y la plataforma no gana nada, que es lo correcto sin comision: el
    // procesamiento entra y sale.
    expect(s.platformKeeps).toBeCloseTo(0, 0);
  });

  it('en estable un usuario FREE paga la comision del plan', async () => {
    await enFase('live');
    const c = await calculateCommission(userId, 40000);
    expect(c.rate).toBe(COMMISSION_RATES.free);
    expect(c.commission).toBeCloseTo(40000 * (COMMISSION_RATES.free / 100), 2);
    expect(c.vat).toBeGreaterThan(0);
  });

  it('los contratos gratis siguen siendo gratis en fase estable', async () => {
    // Es una promesa hecha a los primeros 1000 usuarios: no la cancela el
    // cambio de fase. Se fija acá para que nadie la rompa sin darse cuenta.
    await enFase('live');
    const conGratis = await User.create({
      username: `gratis_${Date.now()}`,
      name: 'Con Gratis',
      email: `gratis-${Date.now()}@flujo.test`,
      password: 'x',
      role: 'client',
      freeContractsRemaining: 3,
    } as any);

    const c = await calculateCommission(conGratis.id, 40000);
    expect(c.commission).toBe(0);
    expect(c.isFreeContract).toBe(true);

    await User.destroy({ where: { id: conGratis.id } });
  });

  it('el trabajador cobra lo mismo en beta que en estable: el precio', async () => {
    // Lo que cambia entre fases es cuánto paga el cliente (en estable está la
    // comisión), no lo que recibe el trabajador. Antes el trabajador absorbía
    // la pasarela y cobraba distinto según la fase y el medio de pago.
    await enFase('beta');
    const beta = await calculateCommission(userId, 40000);
    const sBeta = splitFees(40000, beta.commission, beta.vat, FEE_RATE);

    await enFase('live');
    const live = await calculateCommission(userId, 40000);
    const sLive = splitFees(40000, live.commission, live.vat, FEE_RATE);

    expect(sLive.clientPays).toBeGreaterThan(sBeta.clientPays);
    expect(sLive.workerReceives).toBe(sBeta.workerReceives);
    expect(sLive.workerReceives).toBe(40000);
  });
});

describe('el minimo de trabajo protege el borde', () => {
  it('en el minimo, lo que paga el cliente por encima del precio es menos que el precio', async () => {
    await enFase('live');
    const c = await calculateCommission(userId, 5000);
    const s = splitFees(5000, c.commission, c.vat, FEE_RATE);

    const cargos = s.clientPays - s.jobPrice;
    expect(cargos).toBeLessThan(s.jobPrice);
  });
});
