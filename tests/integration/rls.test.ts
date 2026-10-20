import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../server/config/database.js';
import { BalanceTransaction } from '../../server/models/sql/BalanceTransaction.model.js';
import { Payment } from '../../server/models/sql/Payment.model.js';
import { WithdrawalRequest } from '../../server/models/sql/WithdrawalRequest.model.js';
import { User } from '../../server/models/sql/User.model.js';
import { comoUsuario, conSistema } from '../../server/db/contextoRls.js';
import { crearUsuario } from '../helpers/fixtures.js';

/**
 * Row Level Security de las tablas de dinero, contra PostgreSQL de verdad y con el rol real de la app (`doapp_app`: ni superusuario, ni dueño de
 * las tablas, ni BYPASSRLS). Sin mocks: lo que se prueba es lo que la base decide.
 *
 * La escena: A y B tienen saldo y un retiro cada uno; hay un pago de A a B y otro de B a C.
 */
describe('RLS: cada usuario ve solo sus filas de dinero', () => {
  let A: any, B: any, C: any, admin: any, soporte: any;
  let pagoAB: any, pagoBC: any;

  const filas = <T extends object = any>(sql: string, replacements?: Record<string, unknown>) => sequelize.query<T>(sql, { type: QueryTypes.SELECT, replacements });
  const comoA = <T>(fn: () => Promise<T>) => comoUsuario(A.id, 'user', fn);
  const comoB = <T>(fn: () => Promise<T>) => comoUsuario(B.id, 'user', fn);

  beforeAll(async () => {
    A = await crearUsuario({ balanceArs: 1000 });
    B = await crearUsuario({ balanceArs: 2000 });
    C = await crearUsuario({ balanceArs: 0 });
    admin = await crearUsuario({ adminRole: 'admin', role: 'admin' });
    soporte = await crearUsuario({ adminRole: 'support' });
    const base = { currency: 'ARS', status: 'held_escrow', paymentType: 'contract_payment', paymentMethod: 'mercadopago', platformFee: 0 };
    pagoAB = await Payment.create({ ...base, payerId: A.id, recipientId: B.id, amount: 100 } as any);
    pagoBC = await Payment.create({ ...base, payerId: B.id, recipientId: C.id, amount: 200 } as any);
    for (const [u, monto] of [[A, 1000], [B, 2000]] as const) {
      await WithdrawalRequest.create({
        userId: u.id,
        amount: monto,
        bankingInfo: { accountHolder: 'Prueba', bankName: 'Mercado Pago', cbu: '0170099220000067797370', accountType: 'savings' },
        status: 'pending',
        balanceBeforeWithdrawal: monto,
        balanceAfterWithdrawal: 0,
        metadata: {},
      } as any);
    }
  });

  afterAll(async () => {
    try {
      await conSistema(async () => {
        await WithdrawalRequest.destroy({ where: { userId: [A.id, B.id] } as any });
        await Payment.destroy({ where: { id: [pagoAB.id, pagoBC.id] } as any });
        await BalanceTransaction.destroy({ where: { userId: [A.id, B.id, C.id] } as any });
        await User.destroy({ where: { id: [A.id, B.id, C.id, admin.id, soporte.id] } as any, force: true });
      });
    } catch {
      /* el próximo DROP SCHEMA lo limpia */
    }
  });

  it('la app corre con un rol sin privilegios: ni superusuario ni BYPASSRLS (si lo fuera, RLS no protegería nada)', async () => {
    const [r] = await comoA(() => filas<{ yo: string; super: boolean; bypass: boolean }>(
      `SELECT current_user AS yo, (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS super, (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypass`,
    ));
    expect(r).toEqual({ yo: 'doapp_app', super: false, bypass: false });
  });

  it('las tres tablas tienen RLS y cuatro políticas cada una (SELECT, INSERT, UPDATE, DELETE por separado)', async () => {
    const tablas = await conSistema(() => filas<{ relname: string; relrowsecurity: boolean }>(
      `SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('balance_transactions','withdrawal_requests','payments') ORDER BY relname`,
    ));
    expect(tablas.map((t) => [t.relname, t.relrowsecurity])).toEqual([['balance_transactions', true], ['payments', true], ['withdrawal_requests', true]]);
    const politicas = await conSistema(() => filas<{ tablename: string; cmd: string }>(
      `SELECT tablename, cmd FROM pg_policies WHERE tablename IN ('balance_transactions','withdrawal_requests','payments') ORDER BY tablename, cmd`,
    ));
    for (const t of ['balance_transactions', 'payments', 'withdrawal_requests']) {
      expect(politicas.filter((p) => p.tablename === t).map((p) => p.cmd).sort()).toEqual(['DELETE', 'INSERT', 'SELECT', 'UPDATE']);
    }
  });

  it('SELECT: A ve solo su libro y su retiro, no los de B', async () => {
    const libro = await comoA(() => BalanceTransaction.findAll({ attributes: ['userId'] }));
    expect(libro.length).toBeGreaterThan(0);
    expect(new Set(libro.map((x: any) => x.userId))).toEqual(new Set([A.id]));
    const retiros = await comoA(() => WithdrawalRequest.findAll({ attributes: ['userId'] }));
    expect(retiros.map((x: any) => x.userId)).toEqual([A.id]);
    expect(await comoA(() => BalanceTransaction.count({ where: { userId: B.id } }))).toBe(0);
  });

  it('un pago lo ven los dos que participan (quien paga y quien cobra) y nadie más', async () => {
    const ids = (r: any[]) => r.map((p) => p.id).sort();
    expect(ids(await comoA(() => Payment.findAll({ attributes: ['id'] })))).toEqual([pagoAB.id]);
    expect(ids(await comoB(() => Payment.findAll({ attributes: ['id'] })))).toEqual([pagoAB.id, pagoBC.id].sort());
    expect(ids(await comoUsuario(C.id, 'user', () => Payment.findAll({ attributes: ['id'] })))).toEqual([pagoBC.id]);
    // El pago ajeno ni siquiera existe para A, ni por id.
    expect(await comoA(() => Payment.findByPk(pagoBC.id))).toBeNull();
  });

  it('una consulta con inyección SQL («OR 1=1») devuelve igual solo las filas propias: la base es la segunda línea de defensa', async () => {
    const hackeada = await comoA(() => filas(`SELECT user_id FROM balance_transactions WHERE user_id = '${A.id}' OR '1'='1'`));
    expect(new Set(hackeada.map((r: any) => r.user_id))).toEqual(new Set([A.id]));
    const todo = await comoA(() => filas(`SELECT * FROM withdrawal_requests`));
    expect(todo.length).toBe(1);
    // Y UNION con otra tabla protegida tampoco abre nada.
    const unida = await comoA(() => filas(`SELECT id FROM payments UNION ALL SELECT id FROM withdrawal_requests`));
    expect(unida.length).toBe(2); // el pago A→B y su propio retiro
  });

  it('INSERT: A no puede escribirle un asiento a B (la base lo rechaza), pero sí a sí mismo', async () => {
    await expect(
      comoA(() => BalanceTransaction.create({ userId: B.id, type: 'adjustment', amount: 1, balanceBefore: 2000, balanceAfter: 2001, description: 'ajeno', status: 'completed' } as any)),
    ).rejects.toThrow(/row-level security|pol[ií]tica de seguridad/i);
    const propio = await comoA(() => BalanceTransaction.create({ userId: A.id, type: 'adjustment', amount: 0, balanceBefore: 1000, balanceAfter: 1000, description: 'propio', status: 'completed' } as any));
    expect(propio.userId).toBe(A.id);
  });

  it('UPDATE: A no modifica filas de B (0 filas afectadas) y el valor no cambia', async () => {
    const [afectadas] = await comoA(() => BalanceTransaction.update({ description: 'robado' } as any, { where: { userId: B.id } }));
    expect(afectadas).toBe(0);
    const [afectadosPagos] = await comoA(() => Payment.update({ status: 'completed' } as any, { where: { id: pagoBC.id } }));
    expect(afectadosPagos).toBe(0);
    expect(await conSistema(() => BalanceTransaction.count({ where: { userId: B.id, description: 'robado' } as any }))).toBe(0);
    expect(((await conSistema(() => Payment.findByPk(pagoBC.id))) as any).status).toBe('held_escrow');
  });

  it('el que cobra puede actualizar el pago en el que participa', async () => {
    const [n] = await comoUsuario(C.id, 'user', () => Payment.update({ payerConfirmed: true } as any, { where: { id: pagoBC.id } }));
    expect(n).toBe(1);
  });

  it('DELETE: ni un usuario ni un administrador borran asientos, pagos o retiros desde la app; solo el sistema', async () => {
    const antes = await conSistema(() => BalanceTransaction.count({ where: { userId: A.id } }));
    expect(await comoA(() => BalanceTransaction.destroy({ where: { userId: A.id } }))).toBe(0);
    expect(await comoUsuario(admin.id, 'admin', () => BalanceTransaction.destroy({ where: { userId: A.id } }))).toBe(0);
    expect(await comoA(() => Payment.destroy({ where: { id: pagoAB.id } }))).toBe(0);
    expect(await conSistema(() => BalanceTransaction.count({ where: { userId: A.id } }))).toBe(antes);
  });

  it('un administrador ve todo; soporte ve los pagos pero NO el libro ni los retiros de nadie', async () => {
    const libroAdmin = await comoUsuario(admin.id, 'admin', () => BalanceTransaction.findAll({ attributes: ['userId'] }));
    expect(new Set(libroAdmin.map((x: any) => x.userId)).size).toBeGreaterThanOrEqual(2);
    expect((await comoUsuario(admin.id, 'admin', () => WithdrawalRequest.count()))).toBe(2);
    expect((await comoUsuario(soporte.id, 'support', () => Payment.count({ where: { id: [pagoAB.id, pagoBC.id] } as any })))).toBe(2);
    expect(await comoUsuario(soporte.id, 'support', () => BalanceTransaction.count())).toBe(0);
    expect(await comoUsuario(soporte.id, 'support', () => WithdrawalRequest.count())).toBe(0);
  });

  it('sin pedido de usuario (cron, webhooks, arranque) la app corre como sistema y ve todo, como antes', async () => {
    expect(await WithdrawalRequest.count()).toBe(2);
    expect(await BalanceTransaction.count({ where: { userId: [A.id, B.id] } as any })).toBeGreaterThanOrEqual(2);
  });

  it('FALLA CERRADO: un identificador de usuario que no es un UUID válido no ve ninguna fila', async () => {
    const basura = await comoUsuario("x'; DROP TABLE users;--", 'user', () => BalanceTransaction.count());
    expect(basura).toBe(0);
    const vacio = await comoUsuario('', '', () => Payment.count());
    expect(vacio).toBe(0);
  });

  it('el contexto no se filtra entre pedidos: la misma conexión, usada por A y después por B, muestra lo de cada uno', async () => {
    for (let i = 0; i < 6; i++) {
      const delUsuario = i % 2 === 0 ? A : B;
      const r = await comoUsuario(delUsuario.id, 'user', () => WithdrawalRequest.findAll({ attributes: ['userId'] }));
      expect(r.map((x: any) => x.userId)).toEqual([delUsuario.id]);
    }
  });

  it('con pedidos concurrentes de usuarios distintos, cada uno ve lo suyo (el contexto va con el pedido, no con el proceso)', async () => {
    const resultados = await Promise.all(
      Array.from({ length: 12 }, (_, i) => {
        const u = i % 2 === 0 ? A : B;
        return comoUsuario(u.id, 'user', async () => {
          await new Promise((r) => setTimeout(r, Math.random() * 20));
          const r = await BalanceTransaction.findAll({ attributes: ['userId'] });
          return { esperado: u.id, vistos: new Set(r.map((x: any) => x.userId)) };
        });
      }),
    );
    for (const r of resultados) expect([...r.vistos]).toEqual([r.esperado]);
  });
});

describe('RLS: los flujos que tocan el dinero de OTRO usuario siguen andando (operaciones de sistema declaradas)', () => {
  let cliente: any, trabajador: any;
  beforeAll(async () => {
    cliente = await crearUsuario({ balanceArs: 5000 });
    trabajador = await crearUsuario({ balanceArs: 0 });
  });
  afterAll(async () => {
    try {
      await conSistema(async () => {
        await BalanceTransaction.destroy({ where: { userId: [cliente.id, trabajador.id] } as any });
        await User.destroy({ where: { id: [cliente.id, trabajador.id] } as any, force: true });
      });
    } catch {
      /* el próximo DROP SCHEMA lo limpia */
    }
  });

  it('el cliente confirma y se le acredita al trabajador: acreditarSaldo escribe en el libro AJENO aunque el pedido sea del cliente', async () => {
    const { acreditarSaldo } = await import('../../server/services/quotePayment.js');
    await comoUsuario(cliente.id, 'user', () => acreditarSaldo(String(trabajador.id), 700, 'cobro del trabajo', { tipo: 'payment' }));
    const saldo = Number(((await conSistema(() => User.findByPk(trabajador.id))) as any).balanceArs);
    expect(saldo).toBe(700);
    // El trabajador ve su asiento; el cliente NO lo ve (no es suyo).
    expect(await comoUsuario(trabajador.id, 'user', () => BalanceTransaction.count({ where: { userId: trabajador.id } as any }))).toBe(1);
    expect(await comoUsuario(cliente.id, 'user', () => BalanceTransaction.count({ where: { userId: trabajador.id } as any }))).toBe(0);
  });

  it('un retiro (debitarSaldo) hecho por el admin sobre el saldo del usuario también funciona', async () => {
    const { debitarSaldo } = await import('../../server/services/quotePayment.js');
    await comoUsuario(cliente.id, 'admin', () => debitarSaldo(String(trabajador.id), 200, 'retiro'));
    expect(Number(((await conSistema(() => User.findByPk(trabajador.id))) as any).balanceArs)).toBe(500);
  });

  it('la cancelación tardía con trabajador, pedida por el cliente, le acredita la compensación al trabajador', async () => {
    const { Job } = await import('../../server/models/sql/Job.model.js');
    const { liquidarCancelacionDePublicacion } = await import('../../server/services/jobCancellation.js');
    const pago: any = await conSistema(() => Payment.create({
      payerId: cliente.id, recipientId: null, amount: 12100, currency: 'ARS', status: 'held_escrow', paymentType: 'job_publication', paymentMethod: 'mercadopago',
      platformFee: 1000, processingCharge: 0, mercadopagoStatus: 'approved',
    } as any));
    const job: any = await conSistema(() => Job.create({
      title: 'Cancelación tardía', summary: 'Prueba de RLS en una cancelación tardía', description: 'Cancelación con menos de veinticuatro horas y un trabajador seleccionado para la prueba',
      price: 10000, clientId: cliente.id, status: 'open', category: 'Reparaciones', tags: [], location: 'Almagro', remoteOk: false, startDate: new Date(Date.now() + 3600_000),
      endDateFlexible: false, allowCounterOffers: true, singleDelivery: true, urgency: 'medium', experienceLevel: 'intermediate', permanentlyCancelled: false,
      publicationPaid: true, publicationPaymentId: pago.id, selectedWorkers: [trabajador.id],
    } as any));
    try {
      const antes = Number(((await conSistema(() => User.findByPk(trabajador.id))) as any).balanceArs);
      const r = await comoUsuario(cliente.id, 'user', () =>
        liquidarCancelacionDePublicacion(job, { aprobada: true, horasHastaInicio: 1, actor: { id: String(cliente.id), tipo: 'cliente' } }),
      );
      expect(r.porTrabajador).toBeGreaterThan(0);
      const despues = Number(((await conSistema(() => User.findByPk(trabajador.id))) as any).balanceArs);
      expect(despues).toBeCloseTo(antes + r.porTrabajador, 2);
      expect(r.problemas.filter((p: any) => p.codigo === 'TRABAJADOR-COMPENSACION-FALLIDA')).toEqual([]);
    } finally {
      await conSistema(async () => {
        await Job.destroy({ where: { id: job.id } as any });
        await Payment.destroy({ where: { id: pago.id } as any });
      }).catch(() => {});
    }
  });
});
