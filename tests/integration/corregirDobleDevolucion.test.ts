import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import BalanceTransaction from '../../server/models/sql/BalanceTransaction.model.js';
import { crearUsuario, crearTrabajo } from '../helpers/fixtures.js';

/**
 * Una publicación devolvió su plata al saldo dos veces por el MISMO pago (reprogramada sin pagar y vencida de nuevo). El script deja la primera
 * devolución, descuenta el excedente con un asiento de ajuste, no toca nada sin --aplicar y no corrige dos veces.
 */
describe('corregir la devolución duplicada de una publicación', () => {
  let cliente: any, trabajo: any;
  const PAGO = '11111111-2222-3333-4444-555555555555';
  const saldo = async () => Number(((await User.findByPk(cliente.id, { attributes: ['balanceArs'] })) as any).balanceArs) || 0;

  beforeAll(async () => {
    cliente = await crearUsuario({ role: 'client' });
    trabajo = await crearTrabajo(cliente.id, { status: 'cancelled', title: 'try' });
    const { acreditarSaldo } = await import('../../server/services/quotePayment.js');
    const meta = { origen: 'cancelacion', reason: 'job_cancelled_sin_trabajador', jobId: String(trabajo.id), pagoId: PAGO };
    await acreditarSaldo(String(cliente.id), 5000, 'Saldo a favor por cancelación de "try"', { relatedModel: 'Job', relatedId: trabajo.id, tipo: 'refund', metadata: meta });
    await acreditarSaldo(String(cliente.id), 5000, 'Saldo a favor por cancelación de "try"', { relatedModel: 'Job', relatedId: trabajo.id, tipo: 'refund', metadata: meta });
  });

  afterAll(async () => {
    try {
      await BalanceTransaction.destroy({ where: { userId: cliente.id }, force: true } as any);
      await Job.destroy({ where: { id: trabajo.id }, force: true });
      await User.destroy({ where: { id: cliente.id }, force: true });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  it('sin --aplicar solo muestra: el saldo no cambia', async () => {
    const { corregirDobleDevolucion } = await import('../../server/services/correccionDeDevoluciones.js');
    expect(await saldo()).toBe(10000);
    const r = await corregirDobleDevolucion(false, () => {});
    const mio = r.find((x) => x.jobId === String(trabajo.id))!;
    expect(mio).toMatchObject({ excedente: 5000, estado: 'vista_previa' });
    expect(await saldo()).toBe(10000);
  });

  it('con --aplicar descuenta el excedente con un asiento de ajuste, y no lo repite', async () => {
    const { corregirDobleDevolucion } = await import('../../server/services/correccionDeDevoluciones.js');
    const r = await corregirDobleDevolucion(true, () => {});
    expect(r.find((x) => x.jobId === String(trabajo.id))?.estado).toBe('corregida');
    expect(await saldo()).toBe(5000);

    const ajuste: any = await BalanceTransaction.findOne({ where: { userId: cliente.id, type: 'adjustment' } as any });
    expect(Math.abs(Number(ajuste.amount))).toBe(5000); // el descuento queda como asiento negativo
    expect(ajuste.metadata.origen).toBe('correccion_doble_devolucion');

    const otra = await corregirDobleDevolucion(true, () => {});
    expect(otra.find((x) => x.jobId === String(trabajo.id))?.estado).toBe('ya_corregida');
    expect(await saldo()).toBe(5000);
  });

  it('dos devoluciones de contrato (trabajador no disponible) del mismo trabajo NO son «doble devolución»: no se descuenta nada', async () => {
    const { acreditarSaldo } = await import('../../server/services/quotePayment.js');
    const { corregirDobleDevolucion } = await import('../../server/services/correccionDeDevoluciones.js');
    const otro = await crearTrabajo(cliente.id, { status: 'open', title: 'dos trabajadores', price: 9000 });
    const meta = { origen: 'cancelacion', jobId: String(otro.id), motivo: 'trabajador_no_disponible', disponibleDesde: new Date().toISOString() };
    await acreditarSaldo(String(cliente.id), 3000, 'Devolución por trabajador no disponible', { metadata: meta });
    await acreditarSaldo(String(cliente.id), 3000, 'Devolución por trabajador no disponible', { metadata: meta });
    const antes = await saldo();
    const r = await corregirDobleDevolucion(true, () => {});
    expect(r.find((x) => x.jobId === String(otro.id))).toBeUndefined();
    expect(await saldo()).toBe(antes);
    await Job.destroy({ where: { id: otro.id }, force: true });
  });
});
