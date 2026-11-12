import { describe, it, expect } from '@jest/globals';
import { CIRCUITOS } from '../client/content/circuitos';
import { columnasDelCircuito, renglones } from '../client/utils/diagramaDeCircuito';

/** Los circuitos de la documentación (pedido del dueño, 2026-11-12) se dibujan solos: si una flecha apunta a un paso que no existe, el dibujo queda roto en silencio. */
describe('circuitos de la plataforma', () => {
  it('hay circuitos de pagos, registro, tickets y protocolos', () => {
    const grupos = new Set(CIRCUITOS.map((c) => c.grupo));
    for (const g of ['Dinero', 'Cuentas', 'Trabajos', 'Soporte', 'Protocolos']) expect(grupos.has(g as never)).toBe(true);
    expect(CIRCUITOS.map((c) => c.id)).toEqual(expect.arrayContaining(['pago-de-un-trabajo', 'registro', 'tickets', 'despliegue', 'errores-y-avisos']));
  });

  it('los identificadores de circuitos y de pasos no se repiten', () => {
    expect(new Set(CIRCUITOS.map((c) => c.id)).size).toBe(CIRCUITOS.length);
    for (const c of CIRCUITOS) expect(new Set(c.pasos.map((p) => p.id)).size).toBe(c.pasos.length);
  });

  it.each(CIRCUITOS.map((c) => [c.id, c] as const))('%s: toda flecha une pasos que existen, empieza con un inicio y todo paso es alcanzable', (_id, c) => {
    const ids = new Set(c.pasos.map((p) => p.id));
    for (const f of c.flechas) {
      expect(ids.has(f.de)).toBe(true);
      expect(ids.has(f.a)).toBe(true);
    }
    expect(c.pasos[0].forma).toBe('inicio');
    // alcanzable desde el primero siguiendo cualquier flecha
    const vistos = new Set([c.pasos[0].id]);
    for (let i = 0; i < c.pasos.length; i++) for (const f of c.flechas) if (vistos.has(f.de)) vistos.add(f.a);
    expect([...ids].filter((x) => !vistos.has(x))).toEqual([]);
    // hay al menos un final y las decisiones tienen 2 o más salidas
    expect(c.pasos.some((p) => p.forma === 'fin')).toBe(true);
    for (const p of c.pasos.filter((x) => x.forma === 'decision')) expect(c.flechas.filter((f) => f.de === p.id).length).toBeGreaterThanOrEqual(2);
    // un paso final no tiene salidas que avancen
    for (const p of c.pasos.filter((x) => x.forma === 'fin')) expect(c.flechas.filter((f) => f.de === p.id && !f.atras)).toEqual([]);
  });

  it('las flechas «atrás» vuelven a una columna igual o anterior, y las demás avanzan (si no, el dibujo se enrosca)', () => {
    for (const c of CIRCUITOS) {
      const col = columnasDelCircuito(c.pasos, c.flechas);
      for (const f of c.flechas) {
        if (f.atras) expect(col[f.a]).toBeLessThanOrEqual(col[f.de]);
        else expect(col[f.a]).toBeGreaterThan(col[f.de]);
      }
    }
  });

  it('el circuito del pago nombra los plazos de la configuración (no números sueltos)', () => {
    const pago = CIRCUITOS.find((c) => c.id === 'pago-de-un-trabajo')!;
    const texto = pago.pasos.map((p) => p.texto).join(' ');
    expect(texto).toMatch(/hasta \d+ días/);
    expect(pago.abiertas?.some((a) => /IVA/.test(a))).toBe(true);
  });

  it('renglones parte el texto sin cortar palabras', () => {
    expect(renglones('Paga: trabajo + comisión + IVA + costo de la pasarela', 22)).toEqual(['Paga: trabajo +', 'comisión + IVA + costo', 'de la pasarela']);
    expect(renglones('')).toEqual([]);
  });
});
