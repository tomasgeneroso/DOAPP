import { describe, it, expect, jest } from '@jest/globals';

/**
 * El caso real de staging (2026-11-27): un trabajo de $40.000 se bajó a $20.000 con una persona ya elegida y acreditó $20.000. La corrección devuelve el precio y el
 * contrato a $40.000 y saca lo acreditado con un asiento (o anula lo que estaba pendiente), una sola vez.
 */
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('node-cron', () => ({ __esModule: true, default: { schedule: () => undefined } }));
jest.mock('../../server/services/fcm.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => undefined }) }));

import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { Contract } from '../../server/models/sql/Contract.model.js';
import { BalanceTransaction } from '../../server/models/sql/BalanceTransaction.model.js';
import { conSistema } from '../../server/db/contextoRls.js';
import { acreditarSaldo, acreditarSaldoPendiente } from '../../server/services/quotePayment.js';
import { revertirBajaDePresupuesto } from '../../server/services/reversionDeBaja.js';
import { comprobarSaldoContraLibro, acreditadoAlSaldoPorElPago } from '../../server/services/controlesDeDinero.js';
import { saldoRetirable } from '../../server/services/liberacionDeSaldo.js';
import { analizarCambio } from '../../server/services/cambioDePresupuesto.js';
import { crearUsuario, crearTrabajo, crearContrato, pagarLaPublicacion } from '../helpers/fixtures.js';

const callado = () => undefined;

const casoDeStaging = async (opciones: { pendiente: boolean; contratoBajado?: boolean; sinElegido?: boolean }) => {
  const cliente: any = await crearUsuario({ role: 'client' });
  const trabajador: any = await crearUsuario({ role: 'doer' });
  const trabajo: any = await crearTrabajo(cliente.id, { price: 40000, status: 'in_progress', publicationPaid: true, pricingMode: 'fixed' });
  await pagarLaPublicacion(trabajo, { paymentMethod: 'mercadopago' });
  const contrato: any = opciones.sinElegido ? null : await crearContrato({ jobId: trabajo.id, clientId: cliente.id, doerId: trabajador.id }, { status: 'in_progress', price: opciones.contratoBajado ? 20000 : 40000, commission: 0, totalPrice: opciones.contratoBajado ? 20000 : 40000 });
  await conSistema(() => Job.update({ price: 20000 } as any, { where: { id: trabajo.id } as any }));
  const ref = { relatedModel: 'Job', relatedId: trabajo.id, metadata: { reason: 'price_decrease', jobId: trabajo.id, oldPrice: 40000, newPrice: 20000 } };
  if (opciones.pendiente) await conSistema(() => acreditarSaldoPendiente(cliente.id, 20000, 'Saldo a favor por bajar el precio', { ...ref, metadata: { ...ref.metadata, disponibleDesde: new Date(Date.now() + 86_400_000).toISOString() } }));
  else await conSistema(() => acreditarSaldo(cliente.id, 20000, 'Saldo a favor por bajar el precio', ref));
  return { cliente, trabajo, contrato };
};
const estado = async (c: any) => {
  const j: any = await conSistema(() => Job.findByPk(c.trabajo.id));
  const k: any = c.contrato ? await conSistema(() => Contract.findByPk(c.contrato.id)) : null;
  const u: any = await conSistema(() => User.findByPk(c.cliente.id));
  return { precio: Number(j.price), contrato: k ? Number(k.price) : null, saldo: Number(u.balanceArs) };
};

describe('deshacer una baja de presupuesto hecha con alguien elegido', () => {
  it('la vista previa dice qué haría y no toca nada', async () => {
    const c = await casoDeStaging({ pendiente: false });
    const lineas: string[] = [];
    const r = await conSistema(() => revertirBajaDePresupuesto({ publicacion: c.trabajo.id, aplicar: false }, (t) => lineas.push(t)));
    expect(r).toMatchObject({ aplicado: false, precioAntes: 20000, precioDespues: 40000, aDescontar: 20000 });
    expect(lineas.join('\n')).toMatch(/vista previa/);
    expect(await estado(c)).toEqual({ precio: 20000, contrato: 40000, saldo: 20000 });
  });

  it.each([[false], [true]])('devuelve el precio a 40.000 y saca lo acreditado (contrato también bajado: %s)', async (contratoBajado) => {
    const c = await casoDeStaging({ pendiente: false, contratoBajado });
    await conSistema(() => revertirBajaDePresupuesto({ publicacion: c.trabajo.id, aplicar: true }, callado));
    expect(await estado(c)).toEqual({ precio: 40000, contrato: 40000, saldo: 0 });
    expect((await conSistema(() => comprobarSaldoContraLibro(c.cliente.id, 0))).cierra).toBe(true);
    await expect(conSistema(() => revertirBajaDePresupuesto({ publicacion: c.trabajo.id, aplicar: true }, callado))).rejects.toThrow(/no tiene bajas/i);
    expect((await estado(c)).saldo).toBe(0);
  });

  it('después de deshacerla no queda rastro que trabe: otra plata se puede retirar, el pago vuelve a figurar sin devolver y una baja legítima se puede hacer', async () => {
    const c = await casoDeStaging({ pendiente: false });
    await conSistema(() => revertirBajaDePresupuesto({ publicacion: c.trabajo.id, aplicar: true }, callado));
    // Plata que no viene de ese trabajo: toda disponible (el crédito anulado ya no «espera»).
    await conSistema(() => acreditarSaldo(c.cliente.id, 7000, 'Otro saldo de la prueba', { tipo: 'bonus' }));
    expect((await conSistema(() => saldoRetirable(c.cliente.id, 7000))).disponible).toBe(7000);
    const j: any = await conSistema(() => Job.findByPk(c.trabajo.id));
    expect(await acreditadoAlSaldoPorElPago(String(j.publicationPaymentId))).toBe(0);
    // Sin el contrato de por medio, bajar de nuevo encuentra el dinero completo.
    await conSistema(() => Contract.destroy({ where: { jobId: c.trabajo.id } as any, force: true }));
    await conSistema(() => j.update({ status: 'open', selectedWorkers: [], doerId: null }));
    const a = await conSistema(() => analizarCambio(j, 30000));
    expect([a.puede, a.bloqueo?.codigo, a.aFavor]).toEqual([true, undefined, 10000]);
  });

  it('si lo acreditado estaba pendiente, se anula y nunca llega al saldo', async () => {
    const c = await casoDeStaging({ pendiente: true });
    const r = await conSistema(() => revertirBajaDePresupuesto({ publicacion: c.trabajo.id, aplicar: true }, callado));
    expect([r.pendienteAnulado, r.aDescontar]).toEqual([20000, 0]);
    expect(await estado(c)).toEqual({ precio: 40000, contrato: 40000, saldo: 0 });
    const fila: any = await conSistema(() => BalanceTransaction.findOne({ where: { userId: c.cliente.id, type: 'refund' } as any }));
    expect(fila.status).toBe('failed');
  });

  it('una baja hecha sin nadie elegido es correcta: no la toca', async () => {
    const c = await casoDeStaging({ pendiente: false, sinElegido: true });
    await expect(conSistema(() => revertirBajaDePresupuesto({ publicacion: c.trabajo.id, aplicar: true }, callado))).rejects.toThrow(/son correctas/i);
    expect((await estado(c)).saldo).toBe(20000);
  });
});
