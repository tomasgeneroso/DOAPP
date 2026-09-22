import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { Payment } from '../../server/models/sql/Payment.model.js';
import { BalanceTransaction } from '../../server/models/sql/BalanceTransaction.model.js';

/**
 * El manejo de saldos, contra una base real.
 *
 * Los tests unitarios prueban la regla (liquidarCancelacion); estos prueban
 * que la regla llegue al saldo del usuario y al libro, que los dos digan lo
 * mismo, y que la auditoria de saldos no encuentre nada despues de cada
 * movimiento. Es lo que estuvo roto tres veces: saldo sin asiento, asiento
 * sin saldo, y plata trabada en escrow sin devolucion.
 */
describe('saldos: acreditar, debitar, liquidar y auditar', () => {
  let cliente: any;
  let trabajador: any;
  let acreditarSaldo: any;
  let debitarSaldo: any;
  let auditarSaldos: any;

  beforeAll(async () => {
    ({ acreditarSaldo, debitarSaldo } = await import('../../server/services/quotePayment.js'));
    ({ auditarSaldos } = await import('../../server/services/auditoriaSaldos.js'));
    cliente = await User.create({ email: 'cliente@saldos.test', name: 'Cliente Saldos', password: 'password123', role: 'client', balanceArs: 0 } as any);
    trabajador = await User.create({ email: 'trabajador@saldos.test', name: 'Trabajador Saldos', password: 'password123', role: 'doer', balanceArs: 0 } as any);
  });

  afterAll(async () => {
    // Limpieza best-effort: el setup de integracion reconstruye el esquema en
    // cada corrida, asi que lo que quede colgado (notificaciones, asientos del
    // libro de dinero) no ensucia la siguiente.
    try {
      const { Notification } = await import('../../server/models/sql/Notification.model.js');
      await Notification.destroy({ where: { recipientId: [cliente.id, trabajador.id] } as any });
      await BalanceTransaction.destroy({ where: { userId: [cliente.id, trabajador.id] } });
      await Job.destroy({ where: { clientId: cliente.id } });
      await Payment.destroy({ where: { payerId: cliente.id } });
      await User.destroy({ where: { email: ['cliente@saldos.test', 'trabajador@saldos.test'] } });
    } catch {
      /* referencias que quedaron (auditoria, etc.): el proximo DROP SCHEMA las limpia */
    }
  });

  const saldoDe = async (id: string) => Number((await User.findByPk(id, { attributes: ['balanceArs'] }) as any).balanceArs) || 0;
  const libroDe = async (id: string) =>
    (await BalanceTransaction.findAll({ where: { userId: id, status: 'completed' } as any })).reduce((s, a: any) => s + Number(a.amount), 0);

  it('acreditar deja saldo y asiento iguales, con la metadata para el retiro', async () => {
    await acreditarSaldo(String(cliente.id), 1000, 'prueba', { metadata: { origen: 'cancelacion', alRetirar: { comision: 100 } } });
    expect(await saldoDe(cliente.id)).toBe(1000);
    expect(await libroDe(cliente.id)).toBe(1000);
    const asiento: any = await BalanceTransaction.findOne({ where: { userId: cliente.id } as any, order: [['createdAt', 'DESC']] });
    expect(asiento.type).toBe('refund');
    expect(asiento.metadata.alRetirar).toEqual({ comision: 100 });
  });

  it('debitar baja el saldo con asiento negativo, y no deja pasar mas de lo que hay', async () => {
    await debitarSaldo(String(cliente.id), 400, 'pago con saldo');
    expect(await saldoDe(cliente.id)).toBe(600);
    expect(await libroDe(cliente.id)).toBe(600);
    await expect(debitarSaldo(String(cliente.id), 5000, 'de mas')).rejects.toThrow(/insuficiente/i);
    expect(await saldoDe(cliente.id)).toBe(600);
  });

  it('cancelar una publicacion pagada sin trabajador devuelve precio + comision como saldo y anota que retener al retirar', async () => {
    // El cliente pago 42.511,27: precio 36.000 + comision 3.600 + IVA 756 +
    // procesamiento 1.781,22 + su IVA 374,05. El procesamiento no vuelve.
    const pago: any = await Payment.create({
      payerId: cliente.id,
      recipientId: cliente.id,
      amount: 42511.27,
      amountArs: 42511.27,
      currency: 'ARS',
      status: 'held_escrow',
      paymentType: 'job_publication',
      platformFee: 3600,
      processingCharge: 1781.22,
      processingFee: 2155.28, // lo que MP descuenta de verdad, con IVA
    } as any);
    const job: any = await Job.create({
      title: 'Arreglo de canilla',
      summary: 'Canilla que gotea en la cocina',
      description: 'Canilla que gotea en la cocina, hay que cambiar el cuerito o la canilla entera segun se vea',
      price: 36000,
      clientId: cliente.id,
      status: 'open',
      category: 'Reparaciones',
      tags: [],
      location: 'Almagro',
      remoteOk: false,
      startDate: new Date(Date.now() + 5 * 86_400_000),
      endDateFlexible: false,
      allowCounterOffers: true,
      singleDelivery: true,
      urgency: 'medium',
      experienceLevel: 'intermediate',
      permanentlyCancelled: false,
      publicationPaid: true,
      publicationPaymentId: pago.id,
      selectedWorkers: [],
    } as any);

    const antes = await saldoDe(cliente.id);
    const { liquidarCancelacionDePublicacion } = await import('../../server/services/jobCancellation.js');
    const { liq } = await liquidarCancelacionDePublicacion(job, {
      aprobada: true,
      horasHastaInicio: 120,
      actor: { id: String(cliente.id), tipo: 'cliente' },
      motivo: 'prueba',
    });

    expect(liq.regla).toBe('sin_trabajador');
    // Precio + comision + IVA. El procesamiento (2.155,28 con IVA) ya se fue a la pasarela.
    expect(liq.aCliente).toBeCloseTo(40356, 0);
    expect(liq.procesamientoNoVuelve).toBeCloseTo(2155.28, 1);
    expect(await saldoDe(cliente.id)).toBeCloseTo(antes + 40356, 0);
    expect(await libroDe(cliente.id)).toBe(await saldoDe(cliente.id));

    const asiento: any = await BalanceTransaction.findOne({ where: { userId: cliente.id, type: 'refund' } as any, order: [['createdAt', 'DESC']] });
    expect(asiento.metadata.jobId).toBe(String(job.id));
    expect(asiento).toBeTruthy();
    // Retirar a un CBU no tiene costo de pasarela: solo la media comision con su IVA, (3600 + 756) / 2.
    expect(asiento.metadata.alRetirar.pasarela).toBeUndefined();
    expect(asiento.metadata.alRetirar.comision).toBeCloseTo(2178, 0);
  });

  it('la auditoria no encuentra nada en estos usuarios', async () => {
    const r = await auditarSaldos();
    const propios = r.hallazgos.filter((h: any) => [String(cliente.id), String(trabajador.id)].includes(String(h.userId)));
    expect(propios).toEqual([]);
  });

  it('la auditoria SI encuentra un saldo tocado sin asiento', async () => {
    // Es lo que hacian tres rutas hasta hoy: sumar a balanceArs a secas.
    await User.update({ balanceArs: (await saldoDe(trabajador.id)) + 777 } as any, { where: { id: trabajador.id } });
    const r = await auditarSaldos();
    const h = r.hallazgos.find((x: any) => String(x.userId) === String(trabajador.id) && x.invariante === 1);
    expect(h).toBeTruthy();
    expect(h.monto).toBe(777);
    // Se deja como estaba para no ensuciar el resto.
    await User.update({ balanceArs: 0 } as any, { where: { id: trabajador.id } });
  });
});
