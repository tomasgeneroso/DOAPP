import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import { DEFINICIONES, SECCIONES, costoPorPersona, mediana, promedio, proporcion } from '../shared/metricas/definiciones';

/** Reglas puras de los índices de producto (sin base). */
describe('definiciones de los índices', () => {
  const leer = (r: string) => readFileSync(join(process.cwd(), r), 'utf8');

  it('sin casos no hay «0 %»: hay un motivo', () => {
    expect(proporcion(0, 0).valor).toBeNull();
    expect(proporcion(0, 0).falta).toBeTruthy();
    expect(proporcion(0, 4).valor).toBe(0);
    expect(proporcion(1, 4)).toEqual({ valor: 25, de: 1, sobre: 4 });
    expect(promedio(10, 0).valor).toBeNull();
    expect(promedio(10, 4).valor).toBe(2.5);
  });

  it('la mediana no se deja arrastrar por un caso extremo', () => {
    expect(mediana([])).toBeNull();
    expect(mediana([5, 1, 900])).toBe(5);
    expect(mediana([1, 3])).toBe(2);
  });

  it('el costo por persona solo aparece con inversión y personas', () => {
    expect(costoPorPersona(0, 10, 100)).toEqual({ cac: null, ltvSobreCac: null });
    expect(costoPorPersona(1000, 0, 100)).toEqual({ cac: null, ltvSobreCac: null });
    expect(costoPorPersona(200000, 40, null)).toEqual({ cac: 5000, ltvSobreCac: null });
    expect(costoPorPersona(200000, 40, 15000)).toEqual({ cac: 5000, ltvSobreCac: 3 });
  });

  it('cada índice está en una sola sección y explica cómo se calcula y cómo se lee', () => {
    const enSecciones = SECCIONES.flatMap((s) => s.claves);
    expect([...enSecciones].sort()).toEqual(Object.keys(DEFINICIONES).sort());
    for (const d of Object.values(DEFINICIONES)) {
      expect(d.formula.length).toBeGreaterThan(20);
      expect(d.lectura.length).toBeGreaterThan(20);
    }
  });

  it('los que pidió el dueño están todos', () => {
    for (const k of ['dau', 'mau', 'pegajosidad', 'primeraApertura', 'retencion30', 'abandono', 'duracionDeVisita', 'visitasPorPersona', 'conversion', 'ltv', 'arpu', 'avisosAbiertos']) {
      expect(DEFINICIONES).toHaveProperty(k);
    }
  });

  it('el registro de uso está escrito en la Política de Privacidad (web, app, español e inglés) y no manda pantallas ni textos', () => {
    for (const f of ['shared/legal/privacy.es.ts', 'shared/legal/privacy.en.ts', 'shared/legal/privacy.structure.ts', 'client/pages/legal/PrivacyPolicy.tsx']) {
      expect([f, leer(f).includes('s1_5li3')]).toEqual([f, true]);
    }
    expect(leer('client/hooks/useLatidoDeUso.ts')).toContain("JSON.stringify({ plataforma: 'web' })");
    expect(leer('mobile/hooks/useLatidoDeUso.ts')).toContain("post('/actividad/latido', { plataforma: p })");
  });
});
