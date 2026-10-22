import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  datosDeLiberacionDeMp,
  diasDeLiberacionMp,
  disponibleDesdeDeUnCobro,
  disponibleDesdeDeUnaDevolucion,
  liberaMpEl,
  pagableDesde,
} from '../server/services/liberacionDeSaldo.js';
import { PAGO_TRABAJADOR_RETENCION_DIAS } from '../shared/constants/policies.js';

/**
 * Cuándo el saldo se puede RETIRAR. El saldo se suma en el momento del hecho; lo que cambia es desde cuándo sale al banco:
 * devoluciones al cliente → desde que Mercado Pago libera el pago original; cobros del trabajador → lo que tarde más entre esa liberación y
 * el plazo para que el cliente reclame.
 */
const DIA = 86_400_000;
const AHORA = new Date('2026-10-17T12:00:00Z');
const hace = (dias: number) => new Date(AHORA.getTime() - dias * DIA);
const dentroDe = (dias: number) => new Date(AHORA.getTime() + dias * DIA);

describe('liberaMpEl: cuándo libera Mercado Pago un pago', () => {
  const previo = process.env.PAYMENT_RELEASE_DAYS;
  afterEach(() => {
    if (previo === undefined) delete process.env.PAYMENT_RELEASE_DAYS;
    else process.env.PAYMENT_RELEASE_DAYS = previo;
  });

  it('manda la fecha REAL del webhook (money_release_date)', () => {
    process.env.PAYMENT_RELEASE_DAYS = '10';
    expect(liberaMpEl({ moneyReleaseDate: dentroDe(3), approvedAt: hace(2) })?.getTime()).toBe(dentroDe(3).getTime());
  });

  it('sin la fecha del webhook usa PAYMENT_RELEASE_DAYS desde que se aprobó el pago (10 días)', () => {
    process.env.PAYMENT_RELEASE_DAYS = '10';
    expect(liberaMpEl({ approvedAt: hace(4) })?.getTime()).toBe(dentroDe(6).getTime());
    // sin approvedAt cae a paidAt y después a createdAt
    expect(liberaMpEl({ createdAt: hace(4) })?.getTime()).toBe(dentroDe(6).getTime());
  });

  it('sin la fecha del webhook y sin PAYMENT_RELEASE_DAYS en el entorno asume los 10 días de Mercado Pago (no deja la plata sin espera)', () => {
    delete process.env.PAYMENT_RELEASE_DAYS;
    expect(liberaMpEl({ approvedAt: hace(1) })?.getTime()).toBe(dentroDe(9).getTime());
    expect(liberaMpEl(null)).toBeNull();
  });

  it('PAYMENT_RELEASE_DAYS=0 apaga la espera; un valor inválido vuelve a los 10 días', () => {
    process.env.PAYMENT_RELEASE_DAYS = '0';
    expect(liberaMpEl({ approvedAt: hace(1) })).toBeNull();
    process.env.PAYMENT_RELEASE_DAYS = 'abc';
    expect(diasDeLiberacionMp()).toBe(10);
  });

  it('datosDeLiberacionDeMp guarda la fecha real de liberación y la de aprobación (o ahora si MP no la informó)', () => {
    const r = datosDeLiberacionDeMp({ money_release_date: '2026-11-01T12:00:00.000Z', date_approved: '2026-10-20T12:00:00.000Z' });
    expect(r.moneyReleaseDate?.toISOString()).toBe('2026-11-01T12:00:00.000Z');
    expect(r.approvedAt?.toISOString()).toBe('2026-10-20T12:00:00.000Z');
    const sinDatos = datosDeLiberacionDeMp({});
    expect(sinDatos.moneyReleaseDate).toBeUndefined();
    expect(Math.abs((sinDatos.approvedAt as Date).getTime() - Date.now())).toBeLessThan(5000);
    expect(datosDeLiberacionDeMp({ money_release_date: 'no es fecha' }).moneyReleaseDate).toBeUndefined();
  });
});

describe('devoluciones al cliente', () => {
  beforeEach(() => {
    process.env.PAYMENT_RELEASE_DAYS = '10';
  });
  afterEach(() => {
    delete process.env.PAYMENT_RELEASE_DAYS;
  });

  it('si el cliente cancela a los 3 días de pagar, la devolución se retira recién cuando Mercado Pago libera (a los 10)', () => {
    const d = disponibleDesdeDeUnaDevolucion({ approvedAt: hace(3) }, AHORA);
    expect(d).toBe(dentroDe(7).toISOString());
  });

  it('si cancela después de los 10 días, no espera nada: ya está liberado', () => {
    expect(disponibleDesdeDeUnaDevolucion({ approvedAt: hace(11) }, AHORA)).toBeUndefined();
    expect(disponibleDesdeDeUnaDevolucion({ moneyReleaseDate: hace(1) }, AHORA)).toBeUndefined();
  });

  it('un pago sin registro (publicada con saldo) no espera nada', () => {
    expect(disponibleDesdeDeUnaDevolucion(null, AHORA)).toBeUndefined();
  });
});

describe('cobro del trabajador: manda el reloj que termina después', () => {
  beforeEach(() => {
    process.env.PAYMENT_RELEASE_DAYS = '10';
  });
  afterEach(() => {
    delete process.env.PAYMENT_RELEASE_DAYS;
  });

  it(`trabajo corto: el pago se hizo hace 2 días y el trabajo terminó hoy → manda Mercado Pago (a los 10 días del pago), no los ${PAGO_TRABAJADOR_RETENCION_DIAS} del reclamo`, () => {
    const d = pagableDesde({ completedAt: AHORA }, hace(2));
    expect(d.getTime()).toBe(dentroDe(8).getTime());
  });

  it(`trabajo largo: el pago se liberó hace 20 días y el trabajo terminó hoy → manda el plazo de reclamo (${PAGO_TRABAJADOR_RETENCION_DIAS} días desde el fin)`, () => {
    const d = pagableDesde({ completedAt: AHORA }, hace(20));
    expect(d.getTime()).toBe(AHORA.getTime() + PAGO_TRABAJADOR_RETENCION_DIAS * DIA);
  });

  it('con la fecha real de Mercado Pago, esa manda sobre el cálculo de 10 días', () => {
    const d = pagableDesde({ completedAt: hace(30) }, hace(40), dentroDe(2));
    expect(d.getTime()).toBe(dentroDe(2).getTime());
  });

  it('disponibleDesdeDeUnCobro devuelve la fecha mientras falta y nada cuando ya pasó', () => {
    expect(disponibleDesdeDeUnCobro({ completedAt: AHORA }, { approvedAt: hace(2) }, AHORA)).toBe(dentroDe(8).toISOString());
    expect(disponibleDesdeDeUnCobro({ completedAt: hace(30) }, { approvedAt: hace(40) }, AHORA)).toBeUndefined();
  });
});

describe('el pago manual del administrador usa la MISMA fecha de liberación que el listado', () => {
  it('el chequeo de «en retención» al marcar un pago como pagado pasa moneyReleaseDate a pagableDesde (antes la ignoraba y dejaba pagar antes de tiempo)', () => {
    const src = readFileSync(join(process.cwd(), 'server/routes/admin/pendingPayments.ts'), 'utf8');
    // el listado
    expect(src).toMatch(/pagableDesde\(firstContract as any,[\s\S]*?moneyReleaseDate\)/);
    // el pago (marcar como pagado): trae el campo y lo pasa
    expect(src).toMatch(/attributes: \['approvedAt', 'createdAt', 'moneyReleaseDate'\]/);
    expect(src).toMatch(/const desde = pagableDesde\(contract as any,[\s\S]*?moneyReleaseDate\);/);
    // y hay una sola definición de pagableDesde (la del servicio)
    expect(src).not.toMatch(/export function pagableDesde/);
  });

  it('el cobro de un contrato con varios trabajadores y las devoluciones llevan su fecha de liberación en el asiento', () => {
    const contratos = readFileSync(join(process.cwd(), 'server/routes/contracts.ts'), 'utf8');
    expect(contratos).toMatch(/disponibleDesdeDeUnCobro\(contract as any, payment as any\)/);
    expect((contratos.match(/liberacionDelPagoDelContrato|disponibleDesdeDelPagoDelContrato/g) || []).length).toBeGreaterThanOrEqual(2);
    const cancelacion = readFileSync(join(process.cwd(), 'server/services/jobCancellation.ts'), 'utf8');
    expect(cancelacion).toMatch(/disponibleDesde: disponibleDesdeDeUnaDevolucion\(pagoReal as any\)/);
    const jobs = readFileSync(join(process.cwd(), 'server/routes/jobs.ts'), 'utf8');
    expect((jobs.match(/disponibleDesdeDeLaPublicacion/g) || []).length).toBeGreaterThanOrEqual(3);
  });
});
