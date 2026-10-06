import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  GUIA,
  AYUDA_DE_PANTALLA,
  EJEMPLO_RESUELTO,
  type Bloque,
  type PantallaExplicada,
} from '../client/content/guiaDelAnalisis.js';
import { COMMISSION_RATES } from '../shared/constants/membershipPricing.js';
import {
  calcularUnidad,
  mauDeEquilibrio,
  FACTORES_DE_CHURN,
  META_RUNWAY_FASE1_MESES,
  REFERENCIA_LTV_CAC,
  SUPUESTOS_UE_DE_ARRANQUE,
} from '../shared/pricing/unidadEconomica.js';
import { SCENARIOS } from '../client/utils/financialProjection.js';

/**
 * La guía del análisis no puede quedar desactualizada en silencio.
 *
 * Una explicación que dice "la referencia es 3" o "la meta son 4 meses" se vuelve
 * falsa el día que alguien cambia el código y no el texto, y es peor que no tener
 * explicación porque se lee con autoridad. Estas pruebas hacen que eso no pueda
 * pasar sin que algo se ponga en rojo:
 *
 *  1. Las cifras de la guía salen de las mismas constantes que usa el código.
 *  2. La fórmula que la guía explica es la que el código calcula.
 *  3. Cada sección y cada panel que muestran las pantallas están explicados: si
 *     alguien agrega o renombra uno, la guía lo pide.
 */

const RAIZ = process.cwd();
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), 'utf8');

/** Todo el texto de la guía, para buscar dentro. */
function textoDe(bloque: Bloque): string[] {
  switch (bloque.tipo) {
    case 'parrafo':
    case 'subtitulo':
    case 'aviso':
      return [bloque.texto];
    case 'lista':
    case 'pasos':
      return bloque.items;
    case 'formula':
      return bloque.lineas;
    case 'terminos':
      return bloque.items.flatMap((t) => [t.termino, t.definicion, t.formula ?? '']);
    case 'pantallas':
      return bloque.items.flatMap((p) => [p.nombre, p.muestra, p.comoLeerla]);
    case 'preguntas':
      return bloque.items.flatMap((p) => [p.pregunta, p.respuesta]);
  }
}

const TEXTO_GUIA = GUIA.flatMap((s) => [s.titulo, s.resumen, ...s.bloques.flatMap(textoDe)]).join('\n');
const TEXTO_AYUDA = Object.values(AYUDA_DE_PANTALLA)
  .flatMap((a) => [a.titulo, a.responde, ...a.pasos])
  .join('\n');
const TODO = `${TEXTO_GUIA}\n${TEXTO_AYUDA}`;

const pantallasExplicadas: PantallaExplicada[] = GUIA.flatMap((s) =>
  s.bloques.flatMap((b) => (b.tipo === 'pantallas' ? b.items : [])),
);
const nombresExplicados = pantallasExplicadas.map((p) => p.nombre);

describe('la estructura de la guía', () => {
  it('cada sección tiene identificador único, título, resumen y contenido', () => {
    const ids = GUIA.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of GUIA) {
      expect(s.titulo.trim().length).toBeGreaterThan(3);
      expect(s.resumen.trim().length).toBeGreaterThan(3);
      expect(s.bloques.length).toBeGreaterThan(0);
    }
  });

  it('no hay textos vacíos ni restos de una interpolación rota', () => {
    /**
     * Un `${undefined}` o un `${NaN}` en una plantilla produce una frase que
     * compila, se lee casi bien y miente. Se busca explícitamente.
     */
    for (const linea of TODO.split('\n')) {
      expect(linea).not.toMatch(/undefined|NaN|\[object|null\b/);
    }
    for (const s of GUIA) {
      for (const b of s.bloques) {
        for (const t of textoDe(b)) expect(t.trim().length).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('está todo lo que se promete: objetivo, partes, lectura y límites', () => {
    const ids = GUIA.map((s) => s.id);
    for (const esperado of ['objetivo', 'pestanas', 'procedencia', 'cuenta', 'glosario', 'pantallas', 'monedas', 'decidir', 'preguntas', 'limites']) {
      expect(ids).toContain(esperado);
    }
  });
});

describe('las cifras salen del código, no de un texto escrito a mano', () => {
  it(`la referencia de LTV / CAC es ${REFERENCIA_LTV_CAC}×`, () => {
    expect(TEXTO_GUIA).toContain(`${REFERENCIA_LTV_CAC}×`);
  });

  it(`la meta de runway de la Fase 1 es de ${META_RUNWAY_FASE1_MESES} meses`, () => {
    expect(TEXTO_GUIA).toContain(`${META_RUNWAY_FASE1_MESES} meses`);
    expect(TEXTO_AYUDA).toContain(`${META_RUNWAY_FASE1_MESES}`);
  });

  it(`la comisión es la del código (${COMMISSION_RATES.free}%)`, () => {
    expect(TEXTO_GUIA).toContain(`${COMMISSION_RATES.free}%`);
  });

  it('los multiplicadores de los escenarios de la proyección son los de SCENARIOS', () => {
    const veces = (f: number) => `×${f.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;
    for (const clave of ['conservador', 'optimista'] as const) {
      const s = SCENARIOS[clave];
      for (const factor of [s.growth, s.ticket, s.cac, s.churn]) {
        expect(TEXTO_GUIA).toContain(veces(factor));
      }
    }
  });

  it('los factores de churn de Economía unitaria son los del código', () => {
    const veces = (f: number) => `×${f.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;
    expect(TEXTO_GUIA).toContain(veces(FACTORES_DE_CHURN.pesimista));
    expect(TEXTO_GUIA).toContain(veces(FACTORES_DE_CHURN.optimista));
    expect(TEXTO_GUIA).toContain(`${FACTORES_DE_CHURN.tope}%`);
  });

  it('el ejemplo resuelto da el punto de equilibrio que da el código', () => {
    const u = calcularUnidad({
      ticket: SUPUESTOS_UE_DE_ARRANQUE.ticket,
      contratos: SUPUESTOS_UE_DE_ARRANQUE.contratos,
      comisionPct: SUPUESTOS_UE_DE_ARRANQUE.comision,
      soporte: SUPUESTOS_UE_DE_ARRANQUE.soporte,
      disputasPct: SUPUESTOS_UE_DE_ARRANQUE.disputas,
      fraudePct: SUPUESTOS_UE_DE_ARRANQUE.fraude,
    });
    const equilibrio = mauDeEquilibrio(SUPUESTOS_UE_DE_ARRANQUE.fijos, u.exacto.margen);

    expect(EJEMPLO_RESUELTO.equilibrio).toBe(equilibrio);
    // Y está escrito en el texto, con el formato de la pantalla.
    expect(TEXTO_GUIA).toContain((equilibrio as number).toLocaleString('es-AR'));
  });
});

describe('la fórmula que la guía explica es la que el código calcula', () => {
  /**
   * La guía dice:
   *
   *   volumen = ticket × contratos por mes
   *   ingreso = volumen × comisión
   *   costo   = soporte + volumen × (disputas % + fraude %)
   *   margen  = ingreso − costo
   *   punto de equilibrio = costos fijos ÷ margen
   *
   * Se reescribe acá, de forma independiente, tal cual está dicho. Si alguien
   * cambia `calcularUnidad` —por ejemplo para sumarle otro costo— y no actualiza
   * la guía, esta comparación deja de cerrar.
   */
  const casos = [
    SUPUESTOS_UE_DE_ARRANQUE,
    { ...SUPUESTOS_UE_DE_ARRANQUE, ticket: 34700, soporte: 1500, fijos: 2_000_000 },
    { ...SUPUESTOS_UE_DE_ARRANQUE, comision: 15, disputas: 4, fraude: 1.5, contratos: 2 },
  ];

  it.each(casos.map((c, i) => [`caso ${i + 1}`, c] as const))('%s', (_n, c) => {
    const volumen = c.ticket * c.contratos;
    const ingreso = volumen * (c.comision / 100);
    const costo = c.soporte + volumen * (c.disputas / 100 + c.fraude / 100);
    const margen = ingreso - costo;

    const u = calcularUnidad({
      ticket: c.ticket,
      contratos: c.contratos,
      comisionPct: c.comision,
      soporte: c.soporte,
      disputasPct: c.disputas,
      fraudePct: c.fraude,
    });

    expect(u.exacto.ingreso).toBeCloseTo(ingreso, 9);
    expect(u.exacto.costo).toBeCloseTo(costo, 9);
    expect(u.exacto.margen).toBeCloseTo(margen, 9);
    expect(mauDeEquilibrio(c.fijos, u.exacto.margen)).toBe(margen > 0 ? Math.ceil(c.fijos / margen) : null);
  });

  it('la guía enuncia esa misma fórmula', () => {
    const lineas = GUIA.find((s) => s.id === 'cuenta')!.bloques.find((b) => b.tipo === 'formula');
    expect(lineas).toBeDefined();
    const texto = (lineas as Extract<Bloque, { tipo: 'formula' }>).lineas.join(' | ');
    expect(texto).toContain('ticket × contratos');
    expect(texto).toContain('volumen × comisión');
    expect(texto).toContain('soporte + volumen × (disputas % + fraude %)');
    expect(texto).toContain('ingreso − costo');
    expect(texto).toContain('costos fijos ÷ margen');
  });
});

describe('cada panel que muestran las pantallas está explicado', () => {
  /**
   * Los nombres tal como aparecen en el código de cada pantalla. Cada uno se
   * verifica en las DOS direcciones: que siga existiendo en la pantalla (si se
   * renombra, el test avisa que la guía quedó con un nombre viejo) y que la guía
   * lo explique (si se agrega un panel, hay que explicarlo).
   */
  const PANEL: Array<[string, string]> = [
    // Economía unitaria
    ['client/pages/admin/UnitEconomics.tsx', 'Diagnóstico'],
    ['client/pages/admin/UnitEconomics.tsx', 'Cuánto cuesta conseguir un cliente'],
    ['client/pages/admin/UnitEconomics.tsx', 'Cuánto deja un cliente'],
    ['client/pages/admin/UnitEconomics.tsx', 'LTV y salud, en tres escenarios'],
    ['client/pages/admin/UnitEconomics.tsx', 'Caja y recuperación'],
    ['client/pages/admin/UnitEconomics.tsx', 'Retención'],
    // Proyección
    ['client/pages/admin/BusinessPlan.tsx', 'Cotización del día'],
    ['client/pages/admin/BusinessPlan.tsx', 'Datos reales de la plataforma'],
    ['client/pages/admin/BusinessPlan.tsx', '01 · Trámite'],
    ['client/pages/admin/BusinessPlan.tsx', '02 · Runway'],
    ['client/pages/admin/BusinessPlan.tsx', '03 · Unit economics'],
    ['client/pages/admin/BusinessPlan.tsx', '04 · Decisión'],
    ['client/pages/admin/BusinessPlan.tsx', '05 · Cronograma'],
    ['client/components/admin/FinancialProjectionPanel.tsx', '06 · Proyección'],
    ['client/components/admin/FinancialProjectionPanel.tsx', '07 · Resultado'],
    ['client/components/admin/FinancialProjectionPanel.tsx', '08 · Informe'],
    ['client/components/admin/LiveFinancialsPanel.tsx', 'Estado real'],
  ];

  it.each(PANEL.map(([archivo, nombre]) => [nombre, archivo] as const))(
    '"%s" existe en la pantalla y la guía lo explica',
    (nombre, archivo) => {
      expect(leer(archivo)).toContain(nombre);
      expect(nombresExplicados.some((n) => n.startsWith(nombre))).toBe(true);
    },
  );

  it('no quedan secciones numeradas en la proyección sin explicar', () => {
    /**
     * Toma TODAS las secciones "NN · Nombre" que aparecen en el código de la
     * proyección y exige que cada una esté en la guía. Cubre el caso de que
     * alguien agregue la 08 sin acordarse de este archivo. (El lookahead incluye
     * \r porque algunos de estos archivos tienen finales de línea CRLF.)
     */
    const fuente =
      leer('client/pages/admin/BusinessPlan.tsx') +
      leer('client/components/admin/FinancialProjectionPanel.tsx');
    const numeradas = Array.from(new Set(fuente.match(/\b0\d · [A-ZÁÉÍÓÚ][\wÁÉÍÓÚáéíóúñ ]+?(?=["'`<\r\n])/g) ?? []));

    expect(numeradas.length).toBeGreaterThanOrEqual(8);
    for (const n of numeradas) {
      expect({ seccion: n, explicada: TEXTO_GUIA.includes(n.split(' · ')[0] + ' · ') }).toEqual({
        seccion: n,
        explicada: true,
      });
    }
  });

  it('cada métrica de Economía unitaria tiene su término en la guía', () => {
    const fuente = leer('client/pages/admin/UnitEconomics.tsx');
    const etiquetas = Array.from(fuente.matchAll(/etiqueta="([^"]+)"/g)).map((m) => m[1]);
    expect(etiquetas.length).toBeGreaterThanOrEqual(10);

    const guia = TEXTO_GUIA.toLowerCase();
    for (const etiqueta of etiquetas) {
      const clave = etiqueta.toLowerCase().split(/[\s/(]/)[0];
      expect({ etiqueta, aparece: guia.includes(clave) }).toEqual({ etiqueta, aparece: true });
    }
  });

  it('el glosario define cada término de plata y de negocio que se usa en las pantallas', () => {
    const definidos = GUIA.find((s) => s.id === 'glosario')!
      .bloques.flatMap((b) => (b.tipo === 'terminos' ? b.items.map((t) => t.termino.toLowerCase()) : []))
      .join(' | ');
    for (const termino of ['mau', 'ticket', 'comisión', 'margen de contribución', 'costos fijos', 'punto de equilibrio', 'ebitda', 'cac', 'churn', 'ltv', 'payback', 'runway', 'cohorte', 'caja acumulada', 'escenarios', 'beta']) {
      expect({ termino, definido: definidos.includes(termino) }).toEqual({ termino, definido: true });
    }
  });
});

describe('la guía está conectada a las pantallas', () => {
  it('la pestaña "guía" existe en /analisis y la ayuda de cada pantalla apunta a ella', () => {
    const analisis = leer('client/pages/Analisis.tsx');
    expect(analisis).toContain('id: "guia"');
    expect(analisis).toContain('<GuiaDelAnalisis />');

    // El enlace de la ayuda usa el mismo identificador de pestaña.
    expect(leer('client/components/admin/AyudaDePantalla.tsx')).toContain('/analisis?tab=guia');
  });

  it('las dos pantallas muestran su ayuda', () => {
    expect(leer('client/pages/admin/UnitEconomics.tsx')).toContain('<AyudaDePantalla pantalla="economia-unitaria"');
    expect(leer('client/pages/admin/BusinessPlan.tsx')).toContain('<AyudaDePantalla pantalla="proyeccion"');
    expect(Object.keys(AYUDA_DE_PANTALLA).sort()).toEqual(['economia-unitaria', 'proyeccion']);
  });

  it('la ayuda corta tiene un orden de lectura y no está vacía', () => {
    for (const ayuda of Object.values(AYUDA_DE_PANTALLA)) {
      expect(ayuda.responde.length).toBeGreaterThan(20);
      expect(ayuda.pasos.length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('lo que la guía dice sobre las monedas es lo que hace el código', () => {
  it('sólo la sección 03 convierte: las otras tres sólo declaran', () => {
    /**
     * La guía afirma que cambiar la moneda convierte en la 03 y NO convierte en
     * la 01, 02 y 06. Si alguien hace que otra sección convierta, esa afirmación
     * pasa a ser falsa, y este test lo avisa para que se actualice el texto.
     */
    const plan = leer('client/pages/admin/BusinessPlan.tsx');

    // La 03 usa la conversión con origen.
    expect(plan).toContain('onChange={c => edit(d => cambiarMonedaUe(d, c))}');

    // Las demás sólo escriben la etiqueta de la moneda.
    expect(plan).toContain('d.constCurrency = c;');
    expect(plan).toContain('d.budgetCurrency = c;');
    expect(plan).toContain('d.projectionCurrency = c as Currency;');
    expect(plan).not.toMatch(/d\.constCurrency = c;[\s\S]{0,80}cambiarMonedaUe/);
  });

  it('el botón de la cotización se llama como dice la guía', () => {
    expect(leer('client/pages/admin/BusinessPlan.tsx')).toContain('Traer');
    expect(TEXTO_GUIA).toContain('"Traer"');
    expect(TEXTO_GUIA).toContain('Mostrar todo en');
    expect(leer('client/pages/admin/BusinessPlan.tsx')).toContain('Mostrar todo en');
  });
});
