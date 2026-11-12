import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Pedido del dueño (2026-11-12): «si intento loguearme más de 3 veces, agrandar a 6 veces al menos». Con 5 por minuto una persona que se equivoca
 * de contraseña quedaba frenada con un cartel en inglés. El freno fuerte contra la fuerza bruta es `authLimiter` (intentos fallidos), no este.
 */
const waf = readFileSync(join(process.cwd(), 'server/middleware/waf.ts'), 'utf8');

describe('límite de ingresos por minuto del WAF', () => {
  it('permite al menos 6 intentos de ingreso por minuto', () => {
    const m = /'\/api\/auth\/login':\s*\{\s*windowMs:\s*(\d+),\s*maxRequests:\s*(\d+)\s*\}/.exec(waf);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBe(60000);
    expect(Number(m![2])).toBeGreaterThanOrEqual(6);
  });

  it('el aviso al llegar al tope está en español (no «Too many requests…»)', () => {
    expect(waf).not.toMatch(/Too many requests to this endpoint/);
    expect(waf).toMatch(/Demasiados intentos seguidos/);
  });
});
