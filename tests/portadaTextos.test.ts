import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Portada (pedido del dueño, 2026-11-15): sin los tres sellos, sin «Scroll», «Cómo funciona», subtítulo nuevo, sin las frases de «por escrito» y «control», teléfono que
 * avanza solo, y los textos legales abren arriba. Se mira en un navegador; esto evita que vuelvan sin querer.
 */
const leer = (ruta: string) => readFileSync(join(process.cwd(), ruta), 'utf8');
const es = JSON.parse(leer('client/i18n/locales/es.json')).home as Record<string, string>;
const en = JSON.parse(leer('client/i18n/locales/en.json')).home as Record<string, string>;
const index = leer('client/pages/Index.tsx');

describe('textos de la portada', () => {
  it('el subtítulo arranca con «Encontrá o publicá changas» y no promete «todo por escrito»', () => {
    expect(es.subtitle).toBe('Encontrá o publicá changas, arreglos y trabajos de todo tipo.');
    expect(es.subtitle).not.toMatch(/por escrito/i);
  });

  it('«Cómo funciona», no «Así funciona»', () => {
    expect(es.howItWorks).toBe('Cómo funciona');
    expect(es.howItWorksCta).toBe('Cómo funciona');
  });

  it('se sacaron los sellos y las frases viejas (en español y en inglés)', () => {
    for (const textos of [es, en]) {
      for (const clave of ['sello1', 'sello2', 'sello3', 'howItWorksSubtitle', 'needServiceDesc', 'offerServicesDesc', 'showcaseTitle']) {
        expect(textos[clave]).toBeUndefined();
      }
    }
    expect(es.showcaseSubtitle).toBe('Publicá lo que necesitás, elegí con quién trabajar.');
  });

  it('la página no dibuja los sellos ni el indicador «Scroll»', () => {
    expect(index).not.toMatch(/sellos-de-la-portada|home\.sello|>Scroll</);
    expect(index).not.toMatch(/showcaseTitle|howItWorksSubtitle|needServiceDesc/);
  });
});

describe('teléfono de la portada', () => {
  it('las tres etapas se llaman como pidió el dueño', () => {
    expect(es.movilPaso1).toBe('Te postulaste al trabajo');
    expect(es.movilPaso2).toBe('Trabajando');
    expect(es.movilPaso3).toBe('Pago terminado');
    expect(es.movilPagoPorLiberarTexto).toMatch(/acreditarán/);
  });
});

describe('textos legales', () => {
  it('abren desde el principio, con desplazamiento suave (salvo ancla o volver atrás): toda pantalla nueva abre arriba', () => {
    const layout = leer('client/components/app/Layout.tsx');
    expect(layout).toMatch(/useNavigationType/);
    expect(layout).toMatch(/location\.hash \|\| tipoDeNavegacion === "POP"/);
    expect(layout).toMatch(/desplazarSuave\(0\)/);
  });
});
