import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { desgloseDelPago, opcionesDeDevolucion } from '../shared/pagos/opcionesDeDevolucion';

/**
 * «Devolver dinero» (pedido del dueño, 2026-11-20): opciones de cancelación calculadas desde las partes del pago, comprobante primero y la clasificación «Devueltos» en Pagos.
 */
const leer = (ruta: string) => readFileSync(join(process.cwd(), ruta), 'utf8').replace(/\r\n/g, '\n');

describe('opciones de devolución', () => {
  // total 12.100 = precio 10.285 + comisión 1.000 + IVA 210 + procesamiento 500 + IVA 105
  const pago = { amount: 12100, platformFee: 1000, processingCharge: 500 };

  it('parte el pago en precio, comisión, IVA y procesamiento', () => {
    const d = desgloseDelPago(pago);
    expect(d).toMatchObject({ total: 12100, comision: 1000, ivaComision: 210, procesamiento: 500, ivaProcesamiento: 105, precio: 10285, estimado: false });
  });

  it('cancelación a tiempo = monto − procesamiento − IVA del procesamiento; con trabajador o tardía además descuenta la comisión con su IVA', () => {
    const o = opcionesDeDevolucion(desgloseDelPago(pago), 12100);
    expect(o.find((x) => x.clave === 'cancelacion_a_tiempo')!.monto).toBe(11495);
    expect(o.find((x) => x.clave === 'cancelacion_con_trabajador')!.monto).toBe(10285);
    expect(o.find((x) => x.clave === 'total')!.monto).toBe(12100);
    expect(o.find((x) => x.clave === 'personalizado')!.monto).toBeNull();
    expect(o.filter((x) => x.cierraElPago).map((x) => x.clave)).toEqual(['cancelacion_a_tiempo', 'cancelacion_con_trabajador']);
  });

  it('en la beta (sin comisión) las dos reglas de cancelación dan lo mismo y el texto lo dice', () => {
    const o = opcionesDeDevolucion(desgloseDelPago({ amount: 10560.99, platformFee: 0, processingCharge: 439 }), 10560.99);
    const a = o.find((x) => x.clave === 'cancelacion_a_tiempo')!;
    const b = o.find((x) => x.clave === 'cancelacion_con_trabajador')!;
    expect(a.monto).toBe(b.monto);
    expect(b.detalle).toMatch(/no hay comisión/);
  });

  it('una opción que devolvería más de lo que queda no se puede elegir y dice por qué', () => {
    const o = opcionesDeDevolucion(desgloseDelPago(pago), 5000);
    const a = o.find((x) => x.clave === 'cancelacion_a_tiempo')!;
    expect(a.disponible).toBe(false);
    expect(a.motivoNoDisponible).toMatch(/solo quedan/);
    expect(o.find((x) => x.clave === 'total')!.monto).toBe(5000);
  });

  it('sin nada por devolver ninguna opción está disponible', () => {
    const o = opcionesDeDevolucion(desgloseDelPago(pago), 0);
    expect(o.every((x) => !x.disponible)).toBe(true);
  });

  it('un pago anterior sin el costo de procesamiento guardado se calcula con la tasa vigente y se marca como estimado', () => {
    const d = desgloseDelPago({ amount: 10560.99, platformFee: 0 });
    expect(d.estimado).toBe(true);
    expect(d.procesamiento).toBeGreaterThan(0);
    expect(d.precio + d.procesamiento + d.ivaProcesamiento).toBeCloseTo(10560.99, 1);
  });
});

describe('la devolución exige el comprobante y queda anotada', () => {
  it('el servidor pide el comprobante antes de mover plata y guarda la regla, el medio y el archivo', () => {
    const s = leer('server/routes/admin/payments.ts');
    expect(s).toContain("code: 'COMPROBANTE_REQUERIDO'");
    expect(s).toContain('const entradaDeDevolucion = {');
    expect(s).toContain('comisionDescontada:');
    expect(s).toContain('devoluciones: [...(Array.isArray(bloqueado.metadata?.devoluciones)');
    expect(s).toContain('/:paymentId/refund-info');
    // el comprobante se valida ANTES de llamar a Mercado Pago
    expect(s.indexOf("code: 'COMPROBANTE_REQUERIDO'")).toBeLessThan(s.indexOf("actionType: tipoAccion"));
  });

  it('la ventana de devolver muestra las partes, lo devuelto por camino, las opciones y no deja devolver sin subir el comprobante', () => {
    const f = leer('client/components/admin/RefundModal.tsx');
    expect(f).toContain('data-testid="partes-del-pago"');
    expect(f).toContain('Ya acreditado al saldo del cliente');
    expect(f).toContain('opcion-${o.clave}');
    expect(f).toContain("'Subí el comprobante'");
    expect(f).toContain('comprobanteUrl: comprobante.url');
  });

  it('Pagos tiene la clasificación «Devueltos» con el detalle de cada devolución', () => {
    const p = leer('client/pages/admin/PendingPayments.tsx');
    expect(p).toContain('texto: "Devueltos"');
    expect(p).toContain('params.append("status", "devueltos")');
    expect(p).toContain('<DevolucionesDelPago');
    expect(leer('server/routes/admin/payments.ts')).toContain("status === 'devueltos'");
    const c = leer('client/components/admin/DevolucionesDelPago.tsx');
    expect(c).toContain('Cancelado a tiempo');
    expect(c).toContain('Comisión descontada');
    expect(c).toContain('data-testid="comprobante-de-devolucion-enlace"');
  });
});
