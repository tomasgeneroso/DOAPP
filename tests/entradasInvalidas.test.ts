import {
  splitFees,
  procesamientoParaCobrar,
  liquidarCancelacion,
  desgloseCancelacionSinContratar,
  importeValido,
  ErrorDeCalculo,
  IVA,
} from '../shared/pricing/processingCost.js';
import { costosDeOperacion } from '../shared/pricing/margen.js';
import { montoParaElTrabajador, componentesDelPago } from '../server/services/payoutAmount.js';

/**
 * Lo que pasa cuando a una cuenta de dinero le llega basura.
 *
 * No es hipotetico: los DECIMAL de Postgres llegan como string, un body de
 * request trae lo que el cliente quiera, y una variable de entorno mal escrita
 * (4.19 en vez de 0.0419) es un error de una tecla. Las tres cosas terminan en
 * la misma funcion.
 *
 * La regla: lo que se puede interpretar de forma segura se interpreta (un
 * string numerico, un null que vale cero); lo que no, FALLA fuerte y visible.
 * Nada de devolver NaN, Infinity o un numero plausible pero equivocado: un
 * "$NaN" en pantalla es feo pero un cobro mal calculado no se ve hasta que no
 * cierra el mes.
 */
describe('entradas invalidas en las cuentas de dinero', () => {
  const BASURA = [NaN, Infinity, -Infinity, null, undefined, '', 'abc', {}, [], -100, false];

  describe('importeValido', () => {
    it('convierte a cero todo lo que no es un importe usable', () => {
      for (const v of BASURA) {
        expect(importeValido(v)).toBe(0);
      }
    });

    it('acepta numeros y los strings que manda Postgres para DECIMAL', () => {
      expect(importeValido(36000)).toBe(36000);
      expect(importeValido('36000.50')).toBe(36000.5);
      expect(importeValido(0)).toBe(0);
    });

    it('un importe absurdo falla en vez de crear una orden de pago imposible', () => {
      // Casi siempre es un bug de unidades (centavos tomados como pesos).
      expect(() => importeValido(1e12, 'precio')).toThrow(ErrorDeCalculo);
    });
  });

  describe('splitFees', () => {
    it('con basura en cualquier posicion devuelve una cuenta que cierra, no NaN', () => {
      for (const v of BASURA) {
        const s = splitFees(v as any, v as any, v as any);
        for (const n of [s.jobPrice, s.commission, s.vat, s.clientPays, s.processingCharge, s.workerReceives, s.platformKeeps]) {
          expect(Number.isFinite(n)).toBe(true);
          expect(n).toBeGreaterThanOrEqual(0);
        }
        expect(s.clientPays).toBe(0);
      }
    });

    it('los strings de Postgres se interpretan, no se descartan', () => {
      const s = splitFees('36000' as any, '3600' as any, '756' as any, 0.0419);
      expect(s.jobPrice).toBe(36000);
      expect(s.workerReceives).toBe(36000);
      expect(s.platformKeeps).toBeCloseTo(4356, 0);
    });

    it('una tasa escrita como porcentaje (4.19 en vez de 0.0419) falla y no cobra', () => {
      // Es el error de una tecla en el .env, y sin esta guarda el despeje da
      // un cargo negativo: el cliente pagaria MENOS que el precio.
      expect(() => splitFees(36000, 3600, 756, 4.19)).toThrow(ErrorDeCalculo);
      expect(() => splitFees(36000, 3600, 756, 0.9)).toThrow(ErrorDeCalculo);
      expect(() => splitFees(36000, 3600, 756, -0.05)).toThrow(ErrorDeCalculo);
      expect(() => splitFees(36000, 3600, 756, NaN)).toThrow(ErrorDeCalculo);
    });

    it('la tasa real mas cara de MP sigue siendo valida', () => {
      // 5,99% es acreditacion inmediata: tiene que pasar sin chistar.
      expect(() => splitFees(36000, 3600, 756, 0.0599)).not.toThrow();
    });
  });

  describe('procesamientoParaCobrar', () => {
    it('lo cobrado cubre la tarifa de MP en todo el rango de precios y tasas reales', () => {
      for (const base of [1, 100, 5000, 40356, 1_000_000, 50_000_000]) {
        for (const rate of [0.0275, 0.0375, 0.0419, 0.0519, 0.0599]) {
          const p = procesamientoParaCobrar(base, rate);
          const total = base + p.total;
          // Lo que MP se va a llevar del total, contra lo que se cobro.
          expect(total * rate).toBeLessThanOrEqual(p.cargo + 0.02);
          expect(p.iva).toBeCloseTo(p.cargo * IVA, 1);
        }
      }
    });

    it('con tasa cero o base cero no cobra nada', () => {
      expect(procesamientoParaCobrar(40356, 0).cargo).toBe(0);
      expect(procesamientoParaCobrar(0, 0.0419).cargo).toBe(0);
    });
  });

  describe('liquidarCancelacion', () => {
    it('con basura reparte cero y no negativos', () => {
      const l = liquidarCancelacion({
        precio: NaN as any, comision: 'x' as any, iva: null as any, procesamiento: Infinity as any,
        aprobada: true, hayTrabajador: true, tardia: true,
      });
      for (const n of [l.aCliente, l.aTrabajador, l.retieneApp, l.procesamientoNoVuelve, l.alRetirar.comision]) {
        expect(Number.isFinite(n)).toBe(true);
        expect(n).toBeGreaterThanOrEqual(0);
      }
    });

    it('una proporcion fuera de rango falla en vez de repartir mas de lo que hay', () => {
      const base = { precio: 36000, comision: 3600, iva: 756, aprobada: true, hayTrabajador: true, tardia: true };
      expect(() => liquidarCancelacion({ ...base, parteTrabajador: 1.5 })).toThrow(ErrorDeCalculo);
      expect(() => liquidarCancelacion({ ...base, parteTrabajador: -1 })).toThrow(ErrorDeCalculo);
      expect(() => liquidarCancelacion({ ...base, parteComisionEnRevision: 2 })).toThrow(ErrorDeCalculo);
    });

    it('nunca reparte mas que precio + comision + IVA, con cualquier combinacion', () => {
      for (const hayTrabajador of [true, false]) {
        for (const tardia of [true, false]) {
          for (const aprobada of [true, false]) {
            const l = liquidarCancelacion({
              precio: 36000, comision: 3600, iva: 756, procesamiento: 2155,
              aprobada, hayTrabajador, tardia,
            });
            expect(l.aCliente + l.aTrabajador + l.retieneApp).toBeCloseTo(40356, 1);
            // Lo que se retiene al retirar nunca puede superar lo que se acredito.
            expect(l.alRetirar.comision).toBeLessThanOrEqual(l.aCliente + 0.01);
          }
        }
      }
    });
  });

  describe('desgloseCancelacionSinContratar', () => {
    it('con basura no devuelve negativos ni descuadra', () => {
      const d = desgloseCancelacionSinContratar(NaN as any, undefined as any, 'x' as any, null as any);
      expect(d.devolver).toBe(0);
      expect(d.retiene).toBe(0);
      expect(d.pagado).toBe(0);
    });

    it('lo devuelto mas lo retenido nunca supera lo pagado', () => {
      for (const pagado of [42511, 100000, 999999]) {
        const d = desgloseCancelacionSinContratar(pagado, 3600, 756, 2155);
        expect(d.devolver + d.retiene).toBeLessThanOrEqual(d.pagado + 0.01);
      }
    });

    it('un pago cuyas partes suman mas que el total falla: devolver mas de lo que entro es plata real', () => {
      // Pasa si el pago quedo mal registrado (una comision escrita sobre un
      // total viejo, por ejemplo). Sin esta guarda devolvia $6.511 de un pago
      // de $0.
      expect(() => desgloseCancelacionSinContratar(0, 3600, 756, 2155)).toThrow(ErrorDeCalculo);
      expect(() => desgloseCancelacionSinContratar(1000, 3600, 756, 2155)).toThrow(ErrorDeCalculo);
    });
  });

  describe('montoParaElTrabajador y componentesDelPago', () => {
    it('con un contrato o un pago rotos no paga de mas ni devuelve NaN', () => {
      for (const v of BASURA) {
        const m = montoParaElTrabajador({ price: v as any, allocatedAmount: v as any }, { refundedAmount: v as any });
        expect(Number.isFinite(m.neto)).toBe(true);
        expect(m.neto).toBeGreaterThanOrEqual(0);
      }
    });

    it('lo devuelto por disputa nunca deja un pago negativo', () => {
      const m = montoParaElTrabajador({ price: 1000 }, { refundedAmount: 99999 });
      expect(m.neto).toBe(0);
    });

    it('un pago sin datos se descompone en ceros en vez de romper la liquidacion', () => {
      expect(componentesDelPago(undefined, 36000)).toEqual({ comision: 0, iva: 0, procesamiento: 0 });
      expect(componentesDelPago({ amount: 'x' as any, platformFee: null, processingCharge: NaN as any }, 36000))
        .toEqual({ comision: 0, iva: 0, procesamiento: 0 });
    });
  });

  describe('costosDeOperacion', () => {
    it('con basura devuelve una cuenta finita', () => {
      const c = costosDeOperacion({ precio: NaN as any, comision: null as any });
      for (const n of Object.values(c)) expect(Number.isFinite(n)).toBe(true);
    });

    it('una alicuota absurda del entorno no se usa: se cae al peor caso conocido', () => {
      // leerAlicuota rechaza lo que no esta entre 0 y 0.2.
      const c = costosDeOperacion({ precio: 36000, comision: 3600, retencionIIBB: 5, iibbPropio: -1 });
      expect(c.iibbRetenido).toBeGreaterThanOrEqual(0);
      expect(c.iibbRetenido).toBeLessThan(c.totalCobrado);
    });
  });
});
