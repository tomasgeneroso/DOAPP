import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * «Cobros pendientes»: `GET /api/balance` devuelve una tarjeta por cada importe que figura a nombre de la persona pero todavía no puede usar o retirar, con el
 * contrato y el trabajo de los que viene. Dos clases:
 *  - `a_favor`: una devolución al cliente que espera a que la pasarela libere el pago original (asiento `pending`; todavía NO está en su saldo).
 *  - `en_liberacion`: ya está en el saldo (lo que cobra un trabajador por un contrato) pero se puede retirar recién desde una fecha.
 */
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));

import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { Contract } from '../../server/models/sql/Contract.model.js';
import BalanceTransaction from '../../server/models/sql/BalanceTransaction.model.js';
import { crearUsuario, crearTrabajo, crearContrato } from '../helpers/fixtures.js';

const DIA = 86_400_000;

describe('GET /api/balance → cobrosPendientes', () => {
  let app: Express;
  let cliente: any, trabajador: any, otro: any;
  let trabajo: any, contrato: any;
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const balance = async (u: any) => (await request(app).get('/api/balance').set(con(u))).body;
  // El asiento suma lo que dice (saldo anterior 0): el modelo comprueba que antes + monto = después, también en los pendientes.
  const asiento = (userId: string, over: Record<string, unknown>) =>
    BalanceTransaction.create({ userId, type: 'refund', amount: 1000, balanceBefore: 0, balanceAfter: Number(over.amount ?? 1000), description: 'Asiento de prueba', status: 'pending', ...over } as any);

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/balance', (await import('../../server/routes/balance.js')).default);
    cliente = await crearUsuario({ role: 'client', dniVerified: true });
    trabajador = await crearUsuario({ role: 'doer', dniVerified: true });
    otro = await crearUsuario({ role: 'client', dniVerified: true });
    trabajo = await crearTrabajo(cliente.id, { title: 'Arreglo de la canilla de la cocina', status: 'in_progress', price: 50_000 });
    contrato = await crearContrato({ jobId: trabajo.id, clientId: cliente.id, doerId: trabajador.id }, { status: 'in_progress', price: 50_000 });
  });

  afterAll(async () => {
    try {
      const ids = [cliente.id, trabajador.id, otro.id];
      await BalanceTransaction.destroy({ where: { userId: ids }, force: true } as any);
      await Contract.destroy({ where: { id: contrato.id }, force: true });
      await Job.destroy({ where: { id: trabajo.id }, force: true });
      await User.destroy({ where: { id: ids }, force: true });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  it('sin nada pendiente la lista viene vacía (no hay tarjetas que mostrar)', async () => {
    const b = await balance(otro);
    expect([b.success, b.cobrosPendientes]).toEqual([true, []]);
  });

  it('una devolución a favor pendiente trae su contrato y su trabajo, para poder abrirlos', async () => {
    const hasta = new Date(Date.now() + 7 * DIA).toISOString();
    await asiento(cliente.id, {
      amount: 10_000,
      relatedContractId: contrato.id,
      metadata: { pendienteDeLiquidacion: true, disponibleDesde: hasta, reason: 'price_decrease', previousPrice: 50_000, newPrice: 40_000, pagoOrigenId: 'x' },
    });

    const b = await balance(cliente);

    expect(b.cobrosPendientes).toHaveLength(1);
    expect(b.cobrosPendientes[0]).toMatchObject({
      tipo: 'a_favor',
      monto: 10_000,
      etiqueta: 'Baja de precio',
      disponibleDesde: hasta,
      contrato: { id: String(contrato.id), titulo: 'Arreglo de la canilla de la cocina' },
      trabajo: { id: String(trabajo.id), titulo: 'Arreglo de la canilla de la cocina' },
    });
  });

  it('una devolución de una publicación cancelada trae el trabajo aunque no haya contrato', async () => {
    const huerfano: any = await crearTrabajo(cliente.id, { title: 'Pintura del frente', status: 'cancelled' });
    try {
      await asiento(cliente.id, {
        amount: 3_000,
        metadata: { pendienteDeLiquidacion: true, disponibleDesde: new Date(Date.now() + 3 * DIA).toISOString(), origen: 'cancelacion', jobId: String(huerfano.id), reason: 'job_cancelled_by_client' },
      });
      const b = await balance(cliente);
      const tarjeta = b.cobrosPendientes.find((c: any) => c.monto === 3_000);
      expect(tarjeta).toMatchObject({ tipo: 'a_favor', etiqueta: 'Devolución por una cancelación', contrato: null, trabajo: { id: String(huerfano.id), titulo: 'Pintura del frente' } });
      // La más próxima a liberarse, primero.
      expect(b.cobrosPendientes.map((c: any) => c.monto)).toEqual([3_000, 10_000]);
    } finally {
      await BalanceTransaction.destroy({ where: { userId: cliente.id, amount: 3_000 }, force: true } as any);
      await Job.destroy({ where: { id: huerfano.id }, force: true });
    }
  });

  it('lo que cobra un trabajador y todavía no puede retirar aparece «en liberación», con su contrato', async () => {
    const hasta = new Date(Date.now() + 5 * DIA).toISOString();
    await User.update({ balanceArs: 36_000 } as any, { where: { id: trabajador.id } });
    await asiento(trabajador.id, { type: 'payment', amount: 36_000, balanceAfter: 36_000, status: 'completed', relatedContractId: contrato.id, metadata: { disponibleDesde: hasta } });

    const b = await balance(trabajador);

    expect(b.enLiberacion).toBe(36_000);
    expect(b.cobrosPendientes).toHaveLength(1);
    expect(b.cobrosPendientes[0]).toMatchObject({
      tipo: 'en_liberacion',
      monto: 36_000,
      etiqueta: 'Cobro por un trabajo',
      disponibleDesde: hasta,
      contrato: { id: String(contrato.id) },
      trabajo: { id: String(trabajo.id) },
    });
  });

  it('un cobro que ya se puede retirar no es pendiente', async () => {
    await asiento(trabajador.id, { type: 'payment', amount: 500, status: 'completed', relatedContractId: contrato.id, metadata: { disponibleDesde: new Date(Date.now() - DIA).toISOString() } });
    const b = await balance(trabajador);
    expect(b.cobrosPendientes.map((c: any) => c.monto)).toEqual([36_000]);
  });

  it('cada persona ve solo lo suyo', async () => {
    const b = await balance(otro);
    expect(b.cobrosPendientes).toEqual([]);
  });

  it('sin autenticación no devuelve nada', async () => {
    const r = await request(app).get('/api/balance');
    expect(r.status).toBe(401);
  });
});
