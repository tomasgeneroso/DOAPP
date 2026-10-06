import { describe, it, expect } from '@jest/globals';
import {
  aEuros,
  convertirMoneda,
  cambiarMonedaUe,
  editarImporteUe,
  sincronizarImportesUe,
  CAMPOS_IMPORTE_UE,
  type Moneda,
  type PlanConImportesUe,
  type Tasas,
} from '../shared/pricing/conversionMoneda.js';
import { calcularUnidad, mauDeEquilibrio } from '../shared/pricing/unidadEconomica.js';

/**
 * Cambiar la moneda de la sección "Unit economics" del plan.
 *
 * Qué motivó esto: al pasar el selector de dólares a pesos los números no
 * cambiaban, sólo el símbolo. `ticket = 21` pasaba de "US$21" a "$21": la
 * pantalla afirmaba un ticket de veintiún pesos y los equivalentes en euros
 * caían a cero.
 *
 * Lo que se pide es que se pueda ir de cualquier moneda a cualquier otra, en
 * cualquier orden, y que siempre dé el valor equivalente. La primera solución
 * —convertir lo que hubiera en pantalla— acumulaba error: dólares → pesos →
 * euros → dólares devolvía el soporte como 0,9999996. Lo que lo resuelve es
 * recordar el importe tal como se escribió y derivar todo lo demás desde ahí;
 * estos tests fijan que el resultado no dependa del camino.
 *
 * Y al arreglarlo apareció un segundo error, que estaba tapado: el punto de
 * equilibrio se calculaba con el margen REDONDEADO a centavos. En dólares, un
 * margen real de 0,1256 se redondeaba a 0,13 y el resultado salía 3,5% bajo; en
 * pesos el mismo margen es 181,43 y el redondeo no pesa. O sea que el punto de
 * equilibrio dependía de la moneda con que se mirara.
 */

const TASAS: Tasas = { rateArs: 1560, rateUsd: 1.08 };
const OTRAS: Tasas = { rateArs: 1432.57, rateUsd: 1.1632 };
const MONEDAS: Moneda[] = ['ARS', 'USD', 'EUR'];

/** Los valores por defecto del plan (server/routes/admin/businessPlan.ts). */
const UE_POR_DEFECTO = {
  comision: 10,
  ticket: 21,
  contratos: 0.8,
  disputas: 2.5,
  soporte: 1,
  fijos: 18000,
  fraude: 0.8,
  mauActual: 0,
};

type PlanDePrueba = PlanConImportesUe & { ue: typeof UE_POR_DEFECTO };

/** Un plan cuyos importes están escritos en `moneda`. */
const plan = (moneda: Moneda, tasas: Tasas = TASAS, ue = UE_POR_DEFECTO): PlanDePrueba => ({
  ...tasas,
  ueCurrency: moneda,
  ue: { ...ue },
});

/** Lo que tiene que verse en `hasta` para un importe escrito en `desde`. */
const esperado = (monto: number, desde: Moneda, hasta: Moneda, tasas: Tasas) =>
  desde === hasta ? monto : Number(convertirMoneda(monto, desde, hasta, tasas).toPrecision(9));

const equilibrio = (ue: typeof UE_POR_DEFECTO) => {
  const u = calcularUnidad({
    ticket: ue.ticket,
    contratos: ue.contratos,
    comisionPct: ue.comision,
    soporte: ue.soporte,
    disputasPct: ue.disputas,
    fraudePct: ue.fraude,
  });
  return mauDeEquilibrio(ue.fijos, u.exacto.margen);
};

describe('convertirMoneda', () => {
  it('pasa por el euro: 1 EUR = 1560 ARS = 1,08 USD', () => {
    expect(convertirMoneda(1, 'EUR', 'ARS', TASAS)).toBe(1560);
    expect(convertirMoneda(1, 'EUR', 'USD', TASAS)).toBe(1.08);
    expect(aEuros(1.08, 'USD', TASAS)).toBeCloseTo(1, 10);
    expect(aEuros(1560, 'ARS', TASAS)).toBeCloseTo(1, 10);
  });

  it('de dólares a pesos usa la cruzada, no el euro de por medio', () => {
    expect(convertirMoneda(1, 'USD', 'ARS', TASAS)).toBeCloseTo(1560 / 1.08, 8);
  });

  it('la misma moneda devuelve el mismo monto', () => {
    for (const m of MONEDAS) expect(convertirMoneda(123.45, m, m, TASAS)).toBe(123.45);
  });

  it('ir y volver no cambia el monto', () => {
    for (const a of MONEDAS) {
      for (const b of MONEDAS) {
        const ida = convertirMoneda(1000, a, b, OTRAS);
        expect(convertirMoneda(ida, b, a, OTRAS)).toBeCloseTo(1000, 8);
      }
    }
  });

  it('no se rompe con tasas faltantes ni montos basura', () => {
    expect(convertirMoneda(100, 'USD', 'ARS', { rateArs: 0, rateUsd: 0 })).toBe(100);
    expect(convertirMoneda(NaN, 'USD', 'ARS', TASAS)).toBe(0);
    expect(convertirMoneda('x' as unknown as number, 'USD', 'ARS', TASAS)).toBe(0);
  });
});

describe('cambiarMonedaUe: de cualquier moneda a cualquier otra', () => {
  const PARES = MONEDAS.flatMap((desde) => MONEDAS.map((hasta) => [desde, hasta] as const));

  it.each(PARES.map(([d, h]) => [`${d} -> ${h}`, d, h] as const))(
    '%s da el valor equivalente',
    (_nombre, desde, hasta) => {
      for (const tasas of [TASAS, OTRAS]) {
        const p = plan(desde, tasas);
        cambiarMonedaUe(p, hasta);

        expect(p.ueCurrency).toBe(hasta);
        for (const campo of CAMPOS_IMPORTE_UE) {
          expect(p.ue[campo]).toBe(esperado(UE_POR_DEFECTO[campo], desde, hasta, tasas));
        }
      }
    },
  );

  it('los valores de ejemplo: 21 USD = 30.333,33 ARS = 19,44 EUR', () => {
    const enArs = plan('USD');
    cambiarMonedaUe(enArs, 'ARS');
    expect(enArs.ue.ticket).toBeCloseTo(30333.3333333, 3);
    expect(enArs.ue.soporte).toBeCloseTo(1444.4444444, 3);
    expect(enArs.ue.fijos).toBe(26000000);

    const enEur = plan('USD');
    cambiarMonedaUe(enEur, 'EUR');
    expect(enEur.ue.ticket).toBeCloseTo(19.4444444, 5);
    expect(enEur.ue.soporte).toBeCloseTo(0.9259259, 5);
    expect(enEur.ue.fijos).toBeCloseTo(16666.6666667, 3);
  });

  it('lo que se ve vale lo mismo que lo que se escribió', () => {
    // El "equivalente" tiene un significado: convertir de vuelta da el original.
    for (const desde of MONEDAS) {
      for (const hasta of MONEDAS) {
        const p = plan(desde);
        cambiarMonedaUe(p, hasta);
        for (const campo of CAMPOS_IMPORTE_UE) {
          const deVuelta = convertirMoneda(p.ue[campo], hasta, desde, TASAS);
          expect(Math.abs(deVuelta - UE_POR_DEFECTO[campo]) / UE_POR_DEFECTO[campo]).toBeLessThan(1e-6);
        }
      }
    }
  });

  it('NO toca los porcentajes ni las cantidades', () => {
    /**
     * `comision`, `disputas` y `fraude` son porcentajes; `contratos` y
     * `mauActual` son cantidades. Convertirlos los rompería: un 10% de comisión
     * no pasa a ser 14.444% por cambiar de dólares a pesos.
     */
    const p = plan('USD');
    cambiarMonedaUe(p, 'ARS');
    for (const campo of ['comision', 'disputas', 'fraude', 'contratos', 'mauActual'] as const) {
      expect(p.ue[campo]).toBe(UE_POR_DEFECTO[campo]);
    }
  });

  it('los campos que cambian son exactamente los declarados como importes', () => {
    const p = plan('USD');
    cambiarMonedaUe(p, 'ARS');
    const cambiaron = Object.keys(UE_POR_DEFECTO).filter(
      (k) => (p.ue as unknown as Record<string, number>)[k] !== (UE_POR_DEFECTO as Record<string, number>)[k],
    );
    expect(cambiaron.sort()).toEqual([...CAMPOS_IMPORTE_UE].sort());
  });

  it('cambiar a la misma moneda no hace nada', () => {
    const p = plan('USD');
    cambiarMonedaUe(p, 'USD');
    expect(p.ue).toEqual(UE_POR_DEFECTO);
    expect(p.ueOrigen).toBeUndefined();
  });
});

describe('en cualquier orden, sin acumular error', () => {
  /**
   * LA propiedad. Se recorren TODAS las secuencias de hasta cinco cambios entre
   * las tres monedas (363 secuencias, desde cada moneda inicial, con dos juegos
   * de tasas). En cada paso lo que se ve tiene que ser la conversión DIRECTA del
   * importe escrito, sin importar por dónde se pasó; y cada vez que se vuelve a
   * la moneda original tiene que verse el número original, exacto.
   */
  function secuencias(largoMaximo: number): Moneda[][] {
    let actuales: Moneda[][] = [[]];
    const todas: Moneda[][] = [];
    for (let largo = 1; largo <= largoMaximo; largo++) {
      actuales = actuales.flatMap((s) => MONEDAS.map((m) => [...s, m]));
      todas.push(...actuales);
    }
    return todas;
  }
  const SECUENCIAS = secuencias(5);

  it(`el resultado no depende del camino (${SECUENCIAS.length} secuencias x 3 monedas x 2 tasas)`, () => {
    let pasosVerificados = 0;
    for (const tasas of [TASAS, OTRAS]) {
      for (const inicial of MONEDAS) {
        for (const secuencia of SECUENCIAS) {
          const p = plan(inicial, tasas);
          for (const moneda of secuencia) {
            cambiarMonedaUe(p, moneda);
            for (const campo of CAMPOS_IMPORTE_UE) {
              const directo = esperado(UE_POR_DEFECTO[campo], inicial, moneda, tasas);
              if (p.ue[campo] !== directo) {
                throw new Error(
                  `${inicial} -> ${secuencia.join(' -> ')} (hasta ${moneda}): ${campo} = ${p.ue[campo]}, ` +
                    `la conversión directa daría ${directo}`,
                );
              }
              pasosVerificados++;
            }
          }
        }
      }
    }
    expect(pasosVerificados).toBeGreaterThan(10000);
  });

  it('el caso que fallaba: dólares -> pesos -> euros -> dólares vuelve a 21 / 1 / 18000', () => {
    for (const tasas of [TASAS, OTRAS]) {
      const p = plan('USD', tasas);
      cambiarMonedaUe(p, 'ARS');
      cambiarMonedaUe(p, 'EUR');
      cambiarMonedaUe(p, 'USD');
      expect(p.ue.ticket).toBe(21);
      expect(p.ue.soporte).toBe(1);
      expect(p.ue.fijos).toBe(18000);
    }
  });

  it('y también empezando en pesos o en euros', () => {
    for (const inicial of ['ARS', 'EUR'] as const) {
      const p = plan(inicial, OTRAS);
      for (const m of ['USD', 'EUR', 'ARS', 'USD', 'ARS', 'EUR'] as const) cambiarMonedaUe(p, m);
      cambiarMonedaUe(p, inicial);
      for (const campo of CAMPOS_IMPORTE_UE) expect(p.ue[campo]).toBe(UE_POR_DEFECTO[campo]);
    }
  });
});

describe('editar un importe después de cambiar de moneda', () => {
  it('lo escrito en euros pasa a ser el origen de ese campo', () => {
    const p = plan('USD');
    cambiarMonedaUe(p, 'EUR');
    editarImporteUe(p, 'ticket', 20); // escribo 20 euros

    cambiarMonedaUe(p, 'USD');
    expect(p.ue.ticket).toBe(21.6); // 20 × 1,08
    cambiarMonedaUe(p, 'ARS');
    expect(p.ue.ticket).toBe(31200); // 20 × 1560
    cambiarMonedaUe(p, 'EUR');
    expect(p.ue.ticket).toBe(20); // exacto: era lo escrito
  });

  it('los otros campos conservan su propio origen', () => {
    const p = plan('USD');
    cambiarMonedaUe(p, 'EUR');
    editarImporteUe(p, 'ticket', 20);
    cambiarMonedaUe(p, 'USD');
    // El soporte y los costos fijos se escribieron en dólares y vuelven exactos.
    expect(p.ue.soporte).toBe(1);
    expect(p.ue.fijos).toBe(18000);
  });

  it('un dato con su propia moneda se registra en ESA moneda (datos reales, Fase 1)', () => {
    /**
     * Los datos reales de la plataforma vienen en pesos y el presupuesto de la
     * Fase 1 en la moneda del presupuesto. Si la sección está en dólares, el
     * botón no debe convertirlos a dólares y guardar eso como origen: debe
     * guardar los pesos, para que al volver a pesos se vea el número real.
     */
    const p = plan('USD');
    editarImporteUe(p, 'ticket', 34700, 'ARS');

    expect(p.ue.ticket).toBeCloseTo((34700 * 1.08) / 1560, 6); // se ve en dólares
    cambiarMonedaUe(p, 'ARS');
    expect(p.ue.ticket).toBe(34700); // y en pesos es exactamente el dato
    cambiarMonedaUe(p, 'EUR');
    cambiarMonedaUe(p, 'ARS');
    expect(p.ue.ticket).toBe(34700);
  });

  it('un valor inválido queda en cero en vez de romper', () => {
    const p = plan('USD');
    editarImporteUe(p, 'soporte', NaN);
    expect(p.ue.soporte).toBe(0);
    editarImporteUe(p, 'soporte', -5);
    expect(p.ue.soporte).toBe(0);
  });
});

describe('cuando cambia la cotización', () => {
  it('lo escrito en dólares sigue valiendo lo mismo, y los pesos se recalculan', () => {
    const p = plan('USD');
    cambiarMonedaUe(p, 'ARS');
    expect(p.ue.ticket).toBeCloseTo((21 * 1560) / 1.08, 3);

    // El dólar sube respecto del peso: más pesos por euro, menos dólares por euro.
    p.rateArs = 1800;
    p.rateUsd = 1.1;
    sincronizarImportesUe(p);
    expect(p.ue.ticket).toBeCloseTo((21 * 1800) / 1.1, 3);

    cambiarMonedaUe(p, 'USD');
    expect(p.ue.ticket).toBe(21); // los US$21 no cambiaron
  });

  it('si la sección está en la moneda en que se escribió, la cotización no la toca', () => {
    const p = plan('USD');
    cambiarMonedaUe(p, 'ARS');
    cambiarMonedaUe(p, 'USD');
    p.rateArs = 9999;
    p.rateUsd = 3;
    sincronizarImportesUe(p);
    expect(p.ue.ticket).toBe(21);
    expect(p.ue.fijos).toBe(18000);
  });

  it('sincronizar es idempotente', () => {
    const p = plan('USD');
    cambiarMonedaUe(p, 'EUR');
    const antes = JSON.stringify(p);
    sincronizarImportesUe(p);
    sincronizarImportesUe(p);
    expect(JSON.stringify(p)).toBe(antes);
  });

  it('sin origen (un plan viejo) sincronizar no hace nada', () => {
    const p = plan('USD');
    sincronizarImportesUe(p);
    expect(p.ue).toEqual(UE_POR_DEFECTO);
  });
});

describe('planes guardados antes de que existiera el origen', () => {
  it('el primer cambio toma lo que hay en pantalla como lo escrito', () => {
    const viejo = plan('USD'); // sin ueOrigen
    expect(viejo.ueOrigen).toBeUndefined();
    cambiarMonedaUe(viejo, 'ARS');
    cambiarMonedaUe(viejo, 'USD');
    expect(viejo.ue.ticket).toBe(21);
    expect(viejo.ue.fijos).toBe(18000);
  });

  it('sobrevive a guardarse y volver a cargarse (es JSON común)', () => {
    const p = plan('USD');
    cambiarMonedaUe(p, 'EUR');
    const recargado: PlanDePrueba = JSON.parse(JSON.stringify(p));

    cambiarMonedaUe(recargado, 'ARS');
    cambiarMonedaUe(recargado, 'USD');
    expect(recargado.ue.ticket).toBe(21);
    expect(recargado.ue.soporte).toBe(1);
  });

  it('un origen corrupto se ignora y se toma lo que hay en pantalla', () => {
    const p = plan('USD');
    p.ueOrigen = {
      ticket: { moneda: 'JPY' as Moneda, monto: 5 },
      soporte: { moneda: 'USD', monto: NaN },
      fijos: { moneda: 'USD', monto: -100 },
    };
    cambiarMonedaUe(p, 'ARS');
    cambiarMonedaUe(p, 'USD');
    expect(p.ue.ticket).toBe(21);
    expect(p.ue.soporte).toBe(1);
    expect(p.ue.fijos).toBe(18000);
  });
});

describe('el punto de equilibrio no depende de la moneda', () => {
  it('el margen exacto no está redondeado, y el de mostrar sí', () => {
    const u = calcularUnidad({ ticket: 21, contratos: 0.8, comisionPct: 10, soporte: 1, disputasPct: 2.5, fraudePct: 0.8 });
    expect(u.margen).toBe(0.13); // lo que se muestra
    expect(u.exacto.margen).toBeCloseTo(0.1256, 4); // con lo que se divide
  });

  it.each([
    ['las tasas por defecto', TASAS],
    ['otras tasas', OTRAS],
  ])('USD, ARS y EUR dan el mismo equilibrio (%s)', (_nombre, tasas) => {
    const enUsd = equilibrio(UE_POR_DEFECTO)!;
    for (const moneda of ['ARS', 'EUR'] as const) {
      const p = plan('USD', tasas);
      cambiarMonedaUe(p, moneda);
      const mau = equilibrio(p.ue)!;
      // Nueve cifras significativas en lo derivado: la diferencia es de unidades
      // sobre ~143 mil usuarios.
      expect(Math.abs(mau - enUsd) / enUsd).toBeLessThan(1e-4);
    }
  });

  it('y no cambia dando vueltas: el mismo equilibrio pase lo que pase', () => {
    const enUsd = equilibrio(UE_POR_DEFECTO)!;
    const p = plan('USD');
    for (const m of ['ARS', 'EUR', 'USD', 'EUR', 'ARS', 'USD'] as const) {
      cambiarMonedaUe(p, m);
      const mau = equilibrio(p.ue)!;
      expect(Math.abs(mau - enUsd) / enUsd).toBeLessThan(1e-4);
    }
  });

  it('con el margen redondeado, en cambio, daba 3,5% menos en dólares', () => {
    /**
     * Es lo que hacía la pantalla antes. Se deja como prueba de por qué existe
     * `exacto`: si alguien vuelve a dividir por `margen`, este número es el que
     * vuelve a aparecer.
     */
    const u = calcularUnidad({ ticket: 21, contratos: 0.8, comisionPct: 10, soporte: 1, disputasPct: 2.5, fraudePct: 0.8 });
    const viejo = Math.ceil(18000 / u.margen);
    const bueno = mauDeEquilibrio(18000, u.exacto.margen)!;
    expect(viejo).toBe(138462);
    expect(bueno).toBeGreaterThan(143000);
    expect((bueno - viejo) / bueno).toBeGreaterThan(0.03);
  });

  it('sin margen positivo no hay equilibrio, en vez de un número absurdo', () => {
    expect(mauDeEquilibrio(18000, 0)).toBeNull();
    expect(mauDeEquilibrio(18000, -5)).toBeNull();
    expect(mauDeEquilibrio(18000, NaN)).toBeNull();
    expect(mauDeEquilibrio(18000, Infinity)).toBeNull();
  });
});
