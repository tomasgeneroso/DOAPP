import { describe, it, expect } from '@jest/globals';
import {
  splitFees,
  getProcessingFeeRate,
  pasarelaSinIva,
  IVA,
} from '../shared/pricing/processingCost.js';
import { COMMISSION_RATES } from '../shared/constants/membershipPricing.js';
import { termsEs } from '../shared/legal/terms.es.js';

/**
 * Durante la beta se cobra el procesamiento, aunque la comisión sea 0%.
 *
 * Por qué hace falta fijarlo con tests: son dos cobros distintos que parecen
 * uno solo, y la frase "durante la beta no cobramos nada" es intuitiva y falsa.
 * Alguien que la crea y quiera cumplirla va a poner el procesamiento en cero
 * también — y ahí cada operación de la beta le cuesta plata a DOAPP, porque
 * Mercado Pago cobra igual.
 *
 * Ya pasó en el comentario de commissionService.ts, que decía "durante la beta
 * el cliente paga exactamente el precio del contrato". Era verdad antes de que
 * existiera el cargo de procesamiento, dejó de serlo, y nadie lo actualizó.
 *
 * El propósito de la beta es no cobrar comisión, no subsidiar a la pasarela.
 */

const PRECIOS = [1000, 5000, 32760, 50000, 250000, 1_000_000];

/** La beta: comisión cero, y por lo tanto IVA de la comisión cero. */
const enBeta = (precio: number) => splitFees(precio, 0, 0);

/** Fuera de la beta: la comisión del plan FREE con su IVA. */
const enLive = (precio: number) => {
  const comision = Math.round(precio * (COMMISSION_RATES.free / 100) * 100) / 100;
  const iva = Math.round(comision * IVA * 100) / 100;
  return splitFees(precio, comision, iva);
};

describe('en beta se cobra el procesamiento', () => {
  it('el cargo es mayor que cero en todos los precios', () => {
    for (const precio of PRECIOS) {
      const r = enBeta(precio);
      expect(r.processingCharge).toBeGreaterThan(0);
      expect(r.processingVat).toBeGreaterThan(0);
    }
  });

  it('la comisión sí es cero, que es lo que la beta promete', () => {
    for (const precio of PRECIOS) {
      const r = enBeta(precio);
      expect(r.commission).toBe(0);
      expect(r.vat).toBe(0);
      // Lo que retiene la plataforma es la comisión con su IVA: en beta, nada.
      expect(Math.abs(r.platformKeeps)).toBeLessThan(0.05);
    }
  });

  it('el cliente paga MÁS que el precio del trabajo, aunque no haya comisión', () => {
    /**
     * Es la afirmación que el comentario viejo negaba. Si alguien vuelve a
     * creer que en beta el cliente paga el precio pelado, acá se pone en rojo.
     */
    for (const precio of PRECIOS) {
      const r = enBeta(precio);
      expect(r.clientPays).toBeGreaterThan(precio);
    }
  });

  it('el trabajador cobra el precio entero igual que fuera de la beta', () => {
    // El procesamiento lo paga el cliente, no se le descuenta al trabajador.
    for (const precio of PRECIOS) {
      expect(enBeta(precio).workerReceives).toBe(precio);
      expect(enLive(precio).workerReceives).toBe(precio);
    }
  });

  it('el cargo alcanza para cubrir lo que Mercado Pago se lleva', () => {
    /**
     * El punto entero del cargo. Si quedara corto, DOAPP pondría la diferencia
     * en cada operación de la beta —en silencio, que es como se pierde plata
     * sin que aparezca en ningún tablero—.
     *
     * Se compara con IVA incluido de los dos lados: MP cobra con IVA y el
     * cargo se le cobra al cliente con IVA.
     */
    for (const precio of PRECIOS) {
      const r = enBeta(precio);
      const cobrado = r.processingCharge + r.processingVat;
      const costoReal = r.processingCost + r.processingCostVat;
      expect(cobrado).toBeGreaterThanOrEqual(costoReal - 0.05);
    }
  });

  it('el cargo de la beta es MENOR que el de live, y eso está bien', () => {
    /**
     * Parece raro y es correcto: el cargo se calcula sobre el total cobrado, y
     * en live el total incluye la comisión, así que hay más base. Lo que tiene
     * que cumplirse no es que los dos cargos sean iguales sino que cada uno
     * cubra el costo de SU operación, que es lo que verifica el test de arriba.
     */
    for (const precio of PRECIOS) {
      expect(enBeta(precio).processingCharge).toBeLessThan(enLive(precio).processingCharge);
    }
  });

  it('la tasa usada es la misma en las dos fases', () => {
    // La fase no cambia qué cobra Mercado Pago.
    for (const precio of PRECIOS) {
      expect(enBeta(precio).rate).toBe(getProcessingFeeRate());
      expect(enLive(precio).rate).toBe(getProcessingFeeRate());
    }
  });
});

describe('los términos dicen lo mismo que el código', () => {
  it('la cláusula 7.3 avisa que el procesamiento se cobra en la beta', () => {
    /**
     * Si el código cobra y el texto no lo dice, el cliente ve un importe que
     * sus condiciones no explican. Es el mismo problema que la tabla de
     * comisiones, al revés.
     */
    expect(termsEs.s7p3).toMatch(/se cobra también durante la beta/i);
  });

  it('la cláusula 7.10 aclara que el procesamiento es independiente de la comisión', () => {
    expect(termsEs.s7p10).toMatch(/a cargo del Cliente/);
    expect(termsEs.s7p10).toMatch(/precio del trabajo íntegro/);
  });
});

describe('la conciliación con lo que informa Mercado Pago', () => {
  it('pasarelaSinIva deshace el IVA que viene en la tarifa informada', () => {
    /**
     * MP informa su comisión CON IVA y el cargo se guarda sin IVA. Comparar
     * los dos sin convertir uno hace que la guarda del webhook salte siempre o
     * no salte nunca, según en qué sentido se equivoque.
     */
    const conIva = 1210;
    expect(pasarelaSinIva(conIva)).toBeCloseTo(1000, 0);
  });

  it('lo que se le cobró al cliente y lo que MP cobra son comparables', () => {
    for (const precio of PRECIOS) {
      const r = enBeta(precio);
      // `processingCost` es lo que MP se lleva sin IVA: tiene que coincidir con
      // deshacerle el IVA a la tarifa con IVA.
      expect(pasarelaSinIva(r.processingCost + r.processingCostVat)).toBeCloseTo(
        r.processingCost,
        0,
      );
    }
  });
});
