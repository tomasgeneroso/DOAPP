import { readFileSync } from 'fs';
import { join } from 'path';
import { POLITICAS, DISPUTA_AVISO_DIAS_ANTES } from '../../shared/constants/policies.js';
import { COMMISSION_RATES, MEMBERSHIP_PRICES_EUR } from '../../shared/constants/membershipPricing.js';
import { MINIMUM_COMMISSION_EUR } from '../../shared/pricing/minimums.js';
import { termsEs } from '../../shared/legal/terms.es.js';
import { termsEn } from '../../shared/legal/terms.en.js';
import { TERMS_COMMISSION_ROWS, TERMS_BODY_KEYS } from '../../shared/legal/terms.structure.js';

/**
 * Los terminos dicen lo que hace el codigo.
 *
 * Cada numero que aparece en una clausula tiene su constante en
 * shared/constants/policies.ts (o en pricing), y la clausula lo interpola. Este
 * test es la red por si alguien vuelve a escribir un literal: comprueba que la
 * clausula nombra el valor vigente, en los dos idiomas.
 *
 * Tambien lista lo que NO puede aparecer: los restos de la version anterior
 * (SUPER PRO, $4.999, 8%, $8.000) que quedaron durante meses diciendo cosas que
 * el sistema ya no hacia.
 */

/** Clausula → constantes que tiene que nombrar. */
const CLAUSULAS: Array<{ key: string; valores: Array<number | string>; que: string }> = [
  { key: 's6p6', valores: [POLITICAS.COTIZAR_DIAS_HABILES_ANTES_DE_PAUSAR], que: 'dias habiles antes de pausar' },
  { key: 's7p3', valores: [`${COMMISSION_RATES.free}%`], que: 'comision' },
  { key: 's7p4', valores: [`EUR ${MINIMUM_COMMISSION_EUR}`], que: 'piso de comision' },
  { key: 's7p6', valores: [POLITICAS.AUTO_CONFIRMACION_HORAS], que: 'horas de auto-confirmacion' },
  { key: 's8p1', valores: [`€${MEMBERSHIP_PRICES_EUR.pro}`], que: 'precio de la membresia' },
  { key: 's9p2', valores: [POLITICAS.CANCELACION_CLIENTE_HORAS_ANTES], que: 'horas para cancelar con devolucion' },
  {
    key: 's9p3',
    valores: [
      POLITICAS.CANCELACION_CLIENTE_HORAS_ANTES,
      `${Math.round(POLITICAS.CANCELACION_TARDIA_PARTE_TRABAJADOR * 100)}%`,
    ],
    que: 'cancelacion tardia',
  },
  {
    key: 's9p4',
    valores: [
      POLITICAS.CANCELACION_VENTANA_DIAS,
      POLITICAS.CANCELACION_MARCA_VISIBLE_DIAS,
      POLITICAS.CANCELACION_SUSPENSION_DIAS,
    ],
    que: 'escalera de cancelaciones',
  },
  { key: 's10p7', valores: [POLITICAS.DIAS_PARA_DISPUTAR], que: 'dias para disputar' },
  {
    key: 's10p10',
    valores: [POLITICAS.DISPUTA_DIAS_PARA_RESPONDER, DISPUTA_AVISO_DIAS_ANTES],
    que: 'silencio en disputas',
  },
];

/** Tasas de la tabla vieja (8/3/1) que hoy no son ninguna tasa vigente. */
const TASAS_VIEJAS = [8, 3, 1].filter(
  (n) => !Object.values(COMMISSION_RATES).includes(n as never),
);

/** Texto que ya no describe el sistema y no puede volver a aparecer. */
const RESTOS_VIEJOS = [
  /SUPER PRO/,
  /4[.,]999/,
  /8[.,]999/,
  /8[.,]000 ARS/,
  ...TASAS_VIEJAS.map((n) => new RegExp(`(^|[^\\d])${n}%`)),
  /2 \(dos\) horas|dos horas|two hours/i,
  /1 mes|un mes|one month/i,
];

const contiene = (texto: string, v: number | string) =>
  typeof v === 'number'
    ? new RegExp(`(^|[^\\d.,])${v}([^\\d]|$)`).test(texto)
    : texto.includes(v);

describe('los terminos nombran los numeros vigentes', () => {
  for (const idioma of [['es', termsEs], ['en', termsEn]] as const) {
    const [nombre, dic] = idioma;

    describe(nombre, () => {
      for (const c of CLAUSULAS) {
        it(`${c.key} (${c.que}) nombra ${c.valores.join(', ')}`, () => {
          const texto = dic[c.key];
          expect(texto).toBeTruthy();
          for (const v of c.valores) {
            if (!contiene(texto, v)) {
              throw new Error(
                `La clausula ${c.key} (${nombre}) no menciona ${v}.\n` +
                `Si cambiaste la constante, la clausula tiene que interpolarla desde POLITICAS.\n` +
                `Texto actual: ${texto}`,
              );
            }
          }
        });
      }

      it('no quedan restos de la version anterior', () => {
        const cuerpo = TERMS_BODY_KEYS.map((k) => dic[k] || '').join('\n');
        const encontrados = RESTOS_VIEJOS.filter((re) => re.test(cuerpo));
        expect(encontrados.map(String)).toEqual([]);
      });
    });
  }
});

describe('la tabla de comisiones sale de las tasas reales', () => {
  it('cada fila coincide con COMMISSION_RATES', () => {
    const free = TERMS_COMMISSION_ROWS.find((r) => r.plan === 'FREE');
    const pro = TERMS_COMMISSION_ROWS.find((r) => r.planKey === 'planProMonth');
    expect(free?.commission).toBe(`${COMMISSION_RATES.free}%`);
    expect(pro?.commission).toBe(`${COMMISSION_RATES.pro}%`);
  });

  it('no hay filas de planes que no existen', () => {
    const planes = TERMS_COMMISSION_ROWS.map((r) => r.planKey || r.plan);
    expect(planes).not.toContain('planSuperProMonth');
    // Cada planKey tiene texto en los dos idiomas.
    for (const r of TERMS_COMMISSION_ROWS) {
      if (!r.planKey) continue;
      expect(termsEs[r.planKey]).toBeTruthy();
      expect(termsEn[r.planKey]).toBeTruthy();
    }
  });
});

describe('los textos de la app dicen lo mismo que los terminos', () => {
  /**
   * Los terminos interpolan los numeros, pero los JSON de i18n, los emails y
   * los `defaults` de los componentes son texto plano. Ahi es donde quedo
   * escrito "2 horas" durante meses despues de que la regla pasara a 24, y
   * "solo podes cancelar hasta 24 horas antes" cuando la cancelacion tardia
   * existe y tiene su propia regla. Este test lee esos archivos.
   */
  const raiz = process.cwd();
  const leer = (p: string) => readFileSync(join(raiz, p), 'utf8');

  const ARCHIVOS_DE_COPY = [
    'client/i18n/locales/es.json',
    'client/i18n/locales/en.json',
    'client/pages/JobPayment.tsx',
    'client/components/jobDetail/CancelJobModal.tsx',
    'server/services/email.ts',
  ];

  it('ninguno menciona el plazo viejo de dos horas', () => {
    const viejo = /\b(2|dos|two) (horas|hours)\b/i;
    const culpables = ARCHIVOS_DE_COPY.filter((p) => viejo.test(leer(p)));
    expect(culpables).toEqual([]);
  });

  it('el aviso de cancelacion nombra el plazo vigente', () => {
    const h = String(POLITICAS.CANCELACION_CLIENTE_HORAS_ANTES);
    for (const p of ['client/i18n/locales/es.json', 'client/i18n/locales/en.json']) {
      const src = leer(p);
      const m = src.match(/"cantCancel":\s*"([^"]+)"/);
      expect(m?.[1]).toBeTruthy();
      expect(m![1]).toContain(h);
      // Y dice que hay consecuencia, no que esta prohibido: la cancelacion
      // tardia existe. "no podes" fue el texto viejo.
      expect(m![1]).not.toMatch(/ya no pued|can no longer/i);
    }
  });

  it('el email de confirmacion pendiente usa la constante, no un literal', () => {
    const src = leer('server/services/email.ts');
    expect(src).toMatch(/POLITICAS\.AUTO_CONFIRMACION_HORAS/);
  });
});

describe('las politicas son coherentes entre si', () => {
  it('el aviso de silencio llega antes del vencimiento', () => {
    expect(POLITICAS.DISPUTA_DIAS_PARA_AVISAR).toBeLessThan(POLITICAS.DISPUTA_DIAS_PARA_RESPONDER);
    expect(DISPUTA_AVISO_DIAS_ANTES).toBeGreaterThan(0);
  });

  it('la parte del trabajador en una cancelacion tardia es una proporcion', () => {
    expect(POLITICAS.CANCELACION_TARDIA_PARTE_TRABAJADOR).toBeGreaterThan(0);
    expect(POLITICAS.CANCELACION_TARDIA_PARTE_TRABAJADOR).toBeLessThanOrEqual(1);
  });

  it('la ventana para disputar es mas larga que la auto-confirmacion', () => {
    // Si no, auto-confirmar cerraria la puerta al reclamo, y la clausula 7.6
    // promete lo contrario.
    expect(POLITICAS.DIAS_PARA_DISPUTAR * 24).toBeGreaterThan(POLITICAS.AUTO_CONFIRMACION_HORAS);
  });
});
