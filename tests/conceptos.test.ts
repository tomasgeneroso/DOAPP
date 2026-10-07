import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import { CONCEPTOS, LARGO_MAXIMO_DE_CONCEPTO } from '../client/content/conceptos.js';
import { SUPUESTOS_DE_LA_PROYECCION } from '../client/content/guiaDelAnalisis.js';
import { SCENARIOS } from '../client/utils/financialProjection.js';
import { COMMISSION_RATES } from '../shared/constants/membershipPricing.js';
import { META_RUNWAY_FASE1_MESES, REFERENCIA_LTV_CAC } from '../shared/pricing/unidadEconomica.js';
import { ROTULO_DE_TIPO } from '../shared/pricing/gastos.js';

/**
 * Cada concepto del plan se explica al pasar el mouse.
 *
 * El pedido: "al hacer hover en los conceptos, mostrar una breve explicación
 * clara". Lo que se rompe en silencio es que un concepto nuevo no traiga su texto
 * (el globo no aparece y nadie lo ve hasta probar ese campo exacto) o que el texto
 * crezca hasta ser un párrafo que ya no es "breve". Estos tests cubren las dos.
 */

const leer = (ruta: string) => readFileSync(join(process.cwd(), ruta), 'utf8');

const PANTALLAS = [
  'client/pages/admin/BusinessPlan.tsx',
  'client/components/admin/FinancialProjectionPanel.tsx',
];

describe('los textos son breves y claros', () => {
  it.each(Object.entries(CONCEPTOS))('"%s" entra en un globo', (_concepto, texto) => {
    expect(texto.length).toBeGreaterThan(20);
    expect(texto.length).toBeLessThanOrEqual(LARGO_MAXIMO_DE_CONCEPTO);
    expect(texto).toMatch(/[.)]$/); // cierra la idea: no queda cortado a la mitad
    expect(texto).not.toMatch(/\s{2,}/);
  });

  it('ninguno es el título repetido: dice algo que el nombre no dice', () => {
    for (const [concepto, texto] of Object.entries(CONCEPTOS)) {
      expect(texto.toLowerCase()).not.toBe(concepto.toLowerCase());
    }
  });
});

describe('cobertura', () => {
  it('cada supuesto de la proyección tiene su explicación breve', () => {
    const sin = SUPUESTOS_DE_LA_PROYECCION.flatMap((g) => g.items)
      .map((i) => i.etiqueta)
      .filter((e) => !CONCEPTOS[e]);
    expect(sin).toEqual([]);
  });

  it('cada tipo de gasto tiene la suya', () => {
    for (const rotulo of Object.values(ROTULO_DE_TIPO)) {
      expect(CONCEPTOS[rotulo]).toBeDefined();
    }
  });

  it.each(PANTALLAS)('todo <Concepto c="…"> de %s existe en el diccionario', (archivo) => {
    const usados = Array.from(leer(archivo).matchAll(/<Concepto\s+c="([^"]+)"/g)).map((m) => m[1]);
    expect(usados.length).toBeGreaterThan(0);
    const faltan = usados.filter((u) => !CONCEPTOS[u]);
    expect(faltan).toEqual([]);
  });

  it('los campos numéricos de la proyección muestran su concepto', () => {
    // numField recibe la etiqueta y la envuelve: si deja de hacerlo, los ~25 campos
    // vuelven a ser texto plano sin que ningún otro test lo note.
    const panel = leer('client/components/admin/FinancialProjectionPanel.tsx');
    expect(panel).toContain('<Concepto c={label}');
    const etiquetas = Array.from(panel.matchAll(/(?:numField|campoDerivado)\(\s*'([^']+)'/g)).map((m) => m[1]);
    expect(etiquetas.length).toBeGreaterThan(15);
    expect(etiquetas.filter((e) => !CONCEPTOS[e])).toEqual([]);
  });
});

describe('lo que dicen los textos es lo que hace el código', () => {
  it('los escenarios dicen sus factores reales', () => {
    expect(CONCEPTOS.Conservador).toContain(`altas −${Math.round((1 - SCENARIOS.conservador.growth) * 100)}%`);
    expect(CONCEPTOS.Optimista).toContain(`altas +${Math.round((SCENARIOS.optimista.growth - 1) * 100)}%`);
    expect(CONCEPTOS.Conservador).toContain(`churn +${Math.round((SCENARIOS.conservador.churn - 1) * 100)}%`);
    expect(CONCEPTOS.Optimista).toContain(`ticket +${Math.round((SCENARIOS.optimista.ticket - 1) * 100)}%`);
  });

  it('la comisión, el runway y el LTV/CAC citan la constante, no un número copiado', () => {
    expect(CONCEPTOS['Comisión promedio (%)']).toContain(`${COMMISSION_RATES.free}%`);
    expect(CONCEPTOS['Runway Fase 1']).toContain(`${META_RUNWAY_FASE1_MESES}`);
    expect(CONCEPTOS['LTV/CAC']).toContain(`${REFERENCIA_LTV_CAC}`);
  });
});

describe('el globo', () => {
  const componente = leer('client/components/ui/Concepto.tsx');

  it('se dibuja fuera de las tablas con scroll (portal + posición fija)', () => {
    expect(componente).toContain('createPortal');
    expect(componente).toContain("position: 'fixed'");
  });

  it('funciona con mouse, con el dedo y con teclado', () => {
    expect(componente).toContain("e.pointerType === 'mouse'"); // hover sólo con mouse
    expect(componente).toContain('onClick'); // tocar abre y cierra
    expect(componente).toContain('onFocus'); // teclado
    // El foco abre sólo si es de teclado: en el dedo, tocar enfoca antes del click y lo cerraría.
    expect(componente).toContain(":focus-visible");
    expect(componente).toContain("e.key === 'Escape'");
    expect(componente).toContain('role="tooltip"');
    expect(componente).toContain('aria-describedby');
  });

  it('un concepto sin texto no promete una explicación que no existe', () => {
    expect(componente).toMatch(/if \(!texto\) return/);
  });
});
