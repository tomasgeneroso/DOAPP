import { describe, it, expect } from '@jest/globals';
import {
  CPM_EUR,
  PERFILES_POR_DIA,
  PRECIO_BASE_POR_DIA_EUR,
  TOPE_POR_DIA_EUR,
  desglosePromocion,
  precioDelDiaEur,
  type SenalesDePrecio,
} from '../shared/pricing/promocionDePerfil';

/**
 * El precio de un día de promoción (pedido del dueño, 2026-11-19): 1 € + IVA + costo de procesamiento, y que suba de forma razonable con la audiencia, la app, la demanda
 * del rubro, los lugares ya ocupados y la reputación del perfil, con piso por impresiones y tope.
 */
const base: SenalesDePrecio = { usuariosActivos30d: 0, usuariosConApp30d: 0, trabajosDelRubro30d: 0, reservasDelDia: 0, impresionesPorDia: null, rating: 0, reviews: 0 };

describe('precio de un día de promoción', () => {
  it('sin señales vale 1 € (el precio de partida)', () => {
    expect(precioDelDiaEur(base).eur).toBe(PRECIO_BASE_POR_DIA_EUR);
  });

  it('cada señal lo sube de a poco y nunca lo baja', () => {
    const p = (s: Partial<SenalesDePrecio>) => precioDelDiaEur({ ...base, ...s }).eur;
    expect(p({ usuariosActivos30d: 500 })).toBeGreaterThan(1);
    expect(p({ usuariosActivos30d: 5000 })).toBeGreaterThan(p({ usuariosActivos30d: 500 }));
    expect(p({ usuariosActivos30d: 5000, usuariosConApp30d: 4000 })).toBeGreaterThan(p({ usuariosActivos30d: 5000 }));
    expect(p({ trabajosDelRubro30d: 100 })).toBeGreaterThan(p({ trabajosDelRubro30d: 10 }));
    expect(p({ reservasDelDia: 2 })).toBeGreaterThan(p({ reservasDelDia: 1 }));
    expect(p({ rating: 4.8, reviews: 12 })).toBeGreaterThan(p({ rating: 4.8, reviews: 2 }));
  });

  it('con pocas personas queda cerca del mínimo; con mucha audiencia y demanda llega al tope, no más', () => {
    expect(precioDelDiaEur({ ...base, usuariosActivos30d: 100, trabajosDelRubro30d: 5 }).eur).toBeLessThan(1.5);
    const grande = precioDelDiaEur({ usuariosActivos30d: 1_000_000, usuariosConApp30d: 900_000, trabajosDelRubro30d: 5000, reservasDelDia: PERFILES_POR_DIA, impresionesPorDia: 50_000, rating: 5, reviews: 100 });
    expect(grande.eur).toBe(TOPE_POR_DIA_EUR);
    expect(grande.conTope).toBe(true);
  });

  it('el piso por impresiones: un día no vale menos que sus impresiones reales a CPM', () => {
    const r = precioDelDiaEur({ ...base, impresionesPorDia: 1200 });
    expect(r.pisoPorImpresionesEur).toBe((1200 / 1000) * CPM_EUR);
    expect(r.eur).toBe(6);
    expect(precioDelDiaEur({ ...base, impresionesPorDia: null }).pisoPorImpresionesEur).toBeNull();
  });

  it('datos raros (negativos, NaN) no rompen ni bajan el precio', () => {
    const r = precioDelDiaEur({ usuariosActivos30d: -5, usuariosConApp30d: NaN, trabajosDelRubro30d: Infinity as any, reservasDelDia: -1, impresionesPorDia: null, rating: NaN, reviews: -3 });
    expect(Number.isFinite(r.eur)).toBe(true);
    expect(r.eur).toBeGreaterThanOrEqual(1);
    expect(r.eur).toBeLessThanOrEqual(TOPE_POR_DIA_EUR);
  });

  it('cada factor se explica en palabras para mostrarlo en «¿Por qué este precio?»', () => {
    const r = precioDelDiaEur({ ...base, usuariosActivos30d: 2000, usuariosConApp30d: 500, trabajosDelRubro30d: 40, reservasDelDia: 1 });
    expect(r.factores.map((f) => f.clave)).toEqual(['audiencia', 'app', 'demanda', 'escasez', 'perfil']);
    for (const f of r.factores) {
      expect(f.valor).toBeGreaterThanOrEqual(1);
      expect(f.explicacion.length).toBeGreaterThan(20);
    }
  });
});

describe('lo que paga la persona: precio + IVA + costo de procesamiento', () => {
  it('la cuenta cierra al centavo y supera el precio con IVA', () => {
    const d = desglosePromocion(6000);
    expect(d.neto).toBe(6000);
    expect(d.iva).toBe(1260);
    expect(d.total).toBeCloseTo(d.neto + d.iva + d.procesamiento + d.ivaProcesamiento, 2);
    expect(d.total).toBeGreaterThan(7260);
  });

  it('sin importe no cobra nada', () => {
    expect(desglosePromocion(0).total).toBe(0);
    expect(desglosePromocion(NaN).total).toBe(0);
  });

  it('si algún día se suma una comisión, también paga IVA y la cuenta sigue cerrando', () => {
    const sin = desglosePromocion(6000, 0);
    const con = desglosePromocion(6000, 0.1);
    expect(con.total).toBeGreaterThan(sin.total);
    expect(con.total).toBeGreaterThan(6000 * 1.1 * 1.21);
  });
});

describe('«Intereses» ya no está', () => {
  it('ni como pestaña de Configuración ni como pantalla de bienvenida', async () => {
    const { readFileSync, existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    const leer = (r: string) => readFileSync(join(process.cwd(), r), 'utf8');
    expect(leer('client/pages/UserSettings.tsx')).not.toMatch(/activeTab === "interests"|toggleInterest|settings\.tabs\.interests/);
    expect(existsSync(join(process.cwd(), 'client/pages/OnboardingScreen.tsx'))).toBe(false);
    expect(leer('client/App.tsx')).not.toContain('OnboardingScreen');
  });
});
