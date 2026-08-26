import { sequelize } from '../../../server/config/database.js';
import { Contract } from '../../../server/models/sql/Contract.model.js';
import { PaymentAction } from '../../../server/models/sql/PaymentAction.model.js';
import { User } from '../../../server/models/sql/User.model.js';
import { Job } from '../../../server/models/sql/Job.model.js';
import {
  executeFinancialAction,
  getSettlement,
  defaultIdempotencyKey,
} from '../../../server/services/paymentActions.js';

/**
 * La regla que se prueba acá es una sola: por contrato puede terminar UNA
 * operacion terminal. Se le paga al trabajador o se le devuelve al cliente,
 * nunca las dos, ni siquiera cuando dos procesos arrancan al mismo tiempo.
 *
 * Por eso los casos importantes no son el camino feliz sino las carreras: es
 * ahi donde se paga dos veces la misma plata, y es lo que hoy no esta cubierto
 * por nada en la app.
 */

let contractId: string;
let clientId: string;
let doerId: string;

const ok = async () => ({ ok: true, resourceId: 'mp-123' });
const fails = async () => ({ ok: false, error: 'El proveedor rechazo la operacion' });

beforeAll(async () => {
  const client = await User.create({
    username: `cli_${Date.now()}`, name: 'Cliente Prueba',
    email: `cli-${Date.now()}@pa.test`, password: 'x', role: 'client',
  } as any);
  const doer = await User.create({
    username: `doer_${Date.now()}`, name: 'Trabajador Prueba',
    email: `doer-${Date.now()}@pa.test`, password: 'x', role: 'doer',
  } as any);
  clientId = client.id;
  doerId = doer.id;

  const job = await Job.create({
    title: 'Trabajo de prueba', description: 'x', summary: 'x',
    price: 100000, category: 'Limpieza', clientId, status: 'in_progress',
    location: 'Buenos Aires',
    startDate: new Date(), endDate: new Date(Date.now() + 86400000),
  } as any);

  const contract = await Contract.create({
    jobId: job.id, clientId, doerId, price: 100000, totalPrice: 100000,
    type: 'fixed', status: 'completed',
    startDate: new Date(Date.now() - 86400000), endDate: new Date(),
  } as any);
  contractId = contract.id;
});

afterEach(async () => {
  await PaymentAction.destroy({ where: { contractId } });
});

afterAll(async () => {
  await sequelize.close();
});

const payout = (over: any = {}) => ({
  contractId, actionType: 'PAYOUT' as const, provider: 'mercadopago',
  amount: 90000, ...over,
});
const refundTotal = (over: any = {}) => ({
  contractId, actionType: 'REFUND_TOTAL' as const, provider: 'mercadopago',
  amount: 100000, ...over,
});

describe('un solo resultado terminal por contrato', () => {
  it('paga al trabajador cuando no hay nada previo', async () => {
    const res = await executeFinancialAction(payout(), ok);
    expect(res.ok).toBe(true);
    expect(res.action?.status).toBe('SUCCEEDED');
    expect(res.action?.providerResourceId).toBe('mp-123');
  });

  it('no devuelve el dinero de un contrato que ya se pago', async () => {
    await executeFinancialAction(payout(), ok);
    const res = await executeFinancialAction(refundTotal(), ok);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('ALREADY_SETTLED');
    // y sobre todo: no se llamo al proveedor por segunda vez
    expect(await PaymentAction.count({ where: { contractId, status: 'SUCCEEDED' } })).toBe(1);
  });

  it('no paga un contrato que ya se devolvio', async () => {
    await executeFinancialAction(refundTotal(), ok);
    const res = await executeFinancialAction(payout(), ok);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('ALREADY_SETTLED');
  });

  it('no permite un refund total y uno parcial sobre el mismo contrato', async () => {
    await executeFinancialAction(refundTotal(), ok);
    const res = await executeFinancialAction(
      { contractId, actionType: 'REFUND_PARTIAL', provider: 'mercadopago', amount: 90000 },
      ok,
    );
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('ALREADY_SETTLED');
  });
});

describe('idempotencia', () => {
  it('reintentar la misma operacion no la ejecuta dos veces', async () => {
    let llamadas = 0;
    const contar = async () => { llamadas++; return { ok: true, resourceId: 'mp-1' }; };

    await executeFinancialAction(payout(), contar);
    await executeFinancialAction(payout(), contar);

    expect(llamadas).toBe(1);
    expect(await PaymentAction.count({ where: { contractId } })).toBe(1);
  });

  it('la clave por defecto es estable entre reintentos', () => {
    expect(defaultIdempotencyKey('abc', 'PAYOUT')).toBe(defaultIdempotencyKey('abc', 'PAYOUT'));
    expect(defaultIdempotencyKey('abc', 'PAYOUT')).not.toBe(
      defaultIdempotencyKey('abc', 'REFUND_TOTAL'),
    );
  });
});

describe('concurrencia', () => {
  it('si dos procesos intentan pagar a la vez, solo uno mueve la plata', async () => {
    let llamadas = 0;
    const lento = async () => {
      llamadas++;
      await new Promise((r) => setTimeout(r, 120));
      return { ok: true, resourceId: 'mp-1' };
    };

    const [a, b] = await Promise.all([
      executeFinancialAction(payout(), lento),
      executeFinancialAction(payout(), lento),
    ]);

    // Uno gana; el otro reconoce la operacion en curso y no llama al proveedor.
    expect([a.ok, b.ok].filter(Boolean).length).toBeGreaterThanOrEqual(1);
    expect(llamadas).toBe(1);
    expect(await PaymentAction.count({ where: { contractId } })).toBe(1);
  });

  it('pago y devolucion simultaneos: gana uno solo', async () => {
    let llamadas = 0;
    const lento = async () => {
      llamadas++;
      await new Promise((r) => setTimeout(r, 120));
      return { ok: true, resourceId: 'mp-1' };
    };

    await Promise.all([
      executeFinancialAction(payout(), lento),
      executeFinancialAction(refundTotal(), lento),
    ]);

    expect(llamadas).toBe(1);
    const vivas = await PaymentAction.findAll({ where: { contractId } });
    expect(vivas.filter((a) => a.status !== 'FAILED')).toHaveLength(1);
  });
});

describe('fallos del proveedor', () => {
  it('un rechazo deja el contrato disponible para otra operacion', async () => {
    const rechazado = await executeFinancialAction(payout(), fails);
    expect(rechazado.ok).toBe(false);
    expect(rechazado.action?.status).toBe('FAILED');

    // Un refund que Mercado Pago rechazo no puede trabar el contrato para siempre.
    const luego = await executeFinancialAction(refundTotal(), ok);
    expect(luego.ok).toBe(true);
  });

  it('un timeout queda en curso, no como fracaso', async () => {
    const timeout = async () => { throw new Error('socket hang up'); };
    const res = await executeFinancialAction(payout(), timeout);

    expect(res.ok).toBe(false);
    expect(res.reason).toBe('PROVIDER_FAILED');
    // SENT y no FAILED: la plata pudo haberse movido del otro lado.
    const guardada = await PaymentAction.findByPk(res.action!.id);
    expect(guardada!.status).toBe('SENT');

    // Y mientras no se sepa, nadie puede disparar otra cosa sobre el contrato.
    const otra = await executeFinancialAction(refundTotal(), ok);
    expect(otra.ok).toBe(false);
    expect(otra.reason).toBe('IN_FLIGHT');
  });
});

describe('consulta del estado', () => {
  it('informa como quedo la plata del contrato', async () => {
    expect(await getSettlement(contractId)).toBeNull();
    await executeFinancialAction(payout(), ok);
    const cierre = await getSettlement(contractId);
    expect(cierre?.actionType).toBe('PAYOUT');
  });
});

describe('la garantia esta en la base, no solo en el codigo', () => {
  it('Postgres rechaza una segunda operacion terminal aunque se saltee el servicio', async () => {
    await executeFinancialAction(payout(), ok);

    // Insercion directa, sin pasar por executeFinancialAction: simula el caso
    // que el chequeo en JS no puede cubrir -- dos procesos que leyeron "no hay
    // nada" al mismo tiempo. Si esto no explota, la regla no existe de verdad.
    await expect(
      PaymentAction.create({
        contractId,
        provider: 'mercadopago',
        actionType: 'REFUND_TOTAL',
        status: 'CREATED',
        amount: 100000,
        currency: 'ARS',
        idempotencyKey: `bypass:${Date.now()}`,
        requestPayload: {},
      } as any),
    ).rejects.toThrow();
  });

  it('el indice parcial existe con la condicion correcta', async () => {
    const [rows]: any = await sequelize.query(
      `SELECT indexdef FROM pg_indexes
       WHERE tablename = 'payment_actions'
         AND indexname = 'payment_actions_one_terminal_per_contract'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].indexdef).toMatch(/UNIQUE/i);
    expect(rows[0].indexdef).toMatch(/WHERE/i);
    // Y que no bloquee las fracasadas.
    expect(rows[0].indexdef).toMatch(/FAILED/);
  });
});
