import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';

/**
 * Dos cosas que salieron de correr `anularPago` en producción y chocar con «permission denied for table invoices»:
 *
 *  1. La anulación tiene que ser todo o nada. Antes marcaba el pago como «cancelled» y recién después anulaba las facturas, así que un error
 *     al escribir en `invoices` dejaba el pago anulado y la factura vigente.
 *  2. Un «permission denied» pelado no dice de quién es la tabla ni qué correr. `explicarPermisoDenegado` lo dice, con los datos de la base.
 */
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});

import { User } from '../../server/models/sql/User.model.js';
import { Payment } from '../../server/models/sql/Payment.model.js';
import { Invoice } from '../../server/models/sql/Invoice.model.js';
import { AuditLog } from '../../server/models/sql/AuditLog.model.js';
import { anularPagoSinDinero } from '../../server/services/anulacionDePagos.js';
import { esPermisoDenegado, explicarPermisoDenegado } from '../../server/services/permisosDeLaBase.js';
import { crearUsuario } from '../helpers/fixtures.js';
import { duenoDelEsquema } from '../helpers/ddl.js';

const error42501 = (tabla: string) => Object.assign(new Error(`permission denied for table ${tabla}`), { original: { code: '42501', message: `permission denied for table ${tabla}` } });

describe('anular un pago sin dinero es todo o nada', () => {
  let pagador: any, admin: any, pago: any, factura: any;
  const callar = () => undefined;
  const estados = async () => ({
    pago: ((await Payment.findByPk(pago.id)) as any).status as string,
    factura: ((await Invoice.findByPk(factura.id)) as any).status as string,
  });

  beforeAll(async () => {
    pagador = await crearUsuario({ role: 'client' });
    admin = await crearUsuario({ role: 'admin', adminRole: 'admin' });
    pago = await Payment.create({
      payerId: pagador.id, recipientId: null, amount: 5000, amountArs: 5000, currency: 'ARS', status: 'completed', paymentType: 'job_publication',
      paymentMethod: 'bank_transfer', platformFee: 0, platformFeePercentage: 0, approvedBy: admin.id, approvedAt: new Date(),
    } as any);
    factura = await Invoice.create({
      invoiceNumber: `DOAPP-TEST-${Date.now()}`, type: 'client_payment', userId: pagador.id, paymentId: pago.id, amount: 5000, total: 5000, status: 'generated',
    } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    try {
      await AuditLog.destroy({ where: { targetId: pago.id } as any });
      await Invoice.destroy({ where: { paymentId: pago.id } as any, force: true } as any);
      await Payment.destroy({ where: { id: pago.id }, force: true } as any);
      await User.destroy({ where: { id: [pagador.id, admin.id] }, force: true });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  it('si la base no deja anular la factura, el pago NO queda anulado (se deshace todo)', async () => {
    jest.spyOn(Invoice.prototype, 'save').mockRejectedValueOnce(error42501('invoices'));

    await expect(anularPagoSinDinero(pago.id, 'Transferencia de prueba sin dinero real', { aplicar: true }, callar)).rejects.toThrow(/permission denied for table invoices/);

    expect(await estados()).toEqual({ pago: 'completed', factura: 'generated' });
    expect(await AuditLog.count({ where: { targetId: pago.id, action: 'PAYMENT_VOIDED' } as any })).toBe(0);
  });

  it('la vista previa no escribe nada', async () => {
    const r = await anularPagoSinDinero(pago.id, 'Transferencia de prueba sin dinero real', { aplicar: false }, callar);

    expect(r.anulado).toBe(false);
    expect(await estados()).toEqual({ pago: 'completed', factura: 'generated' });
  });

  it('sin el error, el pago y su factura se anulan juntos y queda anotado', async () => {
    const r = await anularPagoSinDinero(pago.id, 'Transferencia de prueba sin dinero real', { aplicar: true }, callar);

    expect(r.anulado).toBe(true);
    expect(await estados()).toEqual({ pago: 'cancelled', factura: 'void' });
    expect(await AuditLog.count({ where: { targetId: pago.id, action: 'PAYMENT_VOIDED' } as any })).toBe(1);
  });
});

describe('explicarPermisoDenegado', () => {
  const tabla = 'tabla_de_prueba_de_permisos';
  const rol = 'doapp_app'; // el rol real de la app; lo crea la migración de RLS (ver rls.test.ts)

  beforeAll(async () => {
    // como el dueño de la base (el rol de la app no puede crear tablas, igual que en producción)
    const dueno = duenoDelEsquema();
    await dueno.query(`DROP TABLE IF EXISTS ${tabla}`);
    await dueno.query(`CREATE TABLE ${tabla} (id int)`);
    // el rol queda con permiso de lectura nada más: lo que le pasaría a una tabla creada por otro usuario sin los permisos de la app
    await dueno.query(`REVOKE ALL ON ${tabla} FROM ${rol}`);
    await dueno.query(`GRANT SELECT ON ${tabla} TO ${rol}`);
  });

  afterAll(async () => {
    await duenoDelEsquema().query(`DROP TABLE IF EXISTS ${tabla}`).catch(() => undefined);
  });

  it('reconoce el error de permisos de PostgreSQL por su código o por su texto', () => {
    expect(esPermisoDenegado(error42501('invoices'))).toBe(true);
    expect(esPermisoDenegado(new Error('permission denied for table invoices'))).toBe(true);
    expect(esPermisoDenegado({ parent: { code: '42501' } })).toBe(true);
    expect(esPermisoDenegado(new Error('connection refused'))).toBe(false);
    expect(esPermisoDenegado(null)).toBe(false);
  });

  it('dice qué privilegios le faltan al usuario, de quién es la tabla y qué correr para arreglarlo', async () => {
    const texto = await explicarPermisoDenegado(error42501(tabla), rol);

    expect(texto).toContain(`permission denied for table ${tabla}`);
    expect(texto).toContain(`no tiene permiso de INSERT, UPDATE, DELETE sobre la tabla «${tabla}»`);
    expect(texto).not.toMatch(/permiso de [^«]*SELECT/);
    expect(texto).toContain(`ALTER TABLE public.${tabla} OWNER TO ${rol};`);
    expect(texto).toContain(`SELECT tablename, tableowner FROM pg_tables WHERE schemaname = 'public' AND tableowner <> '${rol}'`);
  });

  it('cualquier otro error vuelve tal cual', async () => {
    expect(await explicarPermisoDenegado(new Error('connection refused'))).toBe('connection refused');
    expect(await explicarPermisoDenegado('texto suelto')).toBe('texto suelto');
  });

  it('un error de permisos sin nombre de tabla también vuelve tal cual', async () => {
    const e = Object.assign(new Error('permission denied for schema public'), { original: { code: '42501', message: 'permission denied for schema public' } });

    expect(await explicarPermisoDenegado(e)).toBe('permission denied for schema public');
  });
});
