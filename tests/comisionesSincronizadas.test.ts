import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Las pantallas no repiten la tabla de comisiones vieja (8% / 3% / 1%).
 *
 * El código cobra lo que dice shared/constants/membershipPricing.ts (10% para todos,
 * la paga el cliente) y los T&C ya están sincronizados con él
 * (tests/legal/terminosSincronizados.test.ts). Quedaban copias sueltas: el Header le
 * mostraba al usuario 8/3/1 fuera de la beta, la descripción de la portada
 * prometía "comisiones desde 1%", una pantalla de membresía cotizaba un SUPER PRO
 * de €8 que no se vende, y las instrucciones del proyecto decían todo eso. Cada una
 * es un lugar donde alguien puede leer un número que no se cobra.
 *
 * Este test cubre sólo las copias ya corregidas, para que no vuelvan. Las que
 * siguen pendientes de una decisión del owner (el artículo público de la beta y el
 * modal de planes del login) no están acá a propósito: están en el informe.
 */

const leer = (ruta: string) => readFileSync(join(process.cwd(), ruta), 'utf8');

describe('las copias corregidas de la tabla de comisiones no vuelven', () => {
  it('el Header toma la tasa de COMMISSION_RATES, no 8/3/1 escritos a mano', () => {
    const header = leer('client/components/app/Header.tsx');
    expect(header).toContain('COMMISSION_RATES.free');
    expect(header).not.toMatch(/commissionRate\s*=\s*8\b/);
    expect(header).not.toMatch(/commissionRate\s*=\s*3\b/);
    expect(header).not.toMatch(/commissionRate\s*=\s*1\b/);
  });

  it('la membresía cotiza el precio de MEMBERSHIP_PRICES_EUR y no un SUPER PRO que no se vende', () => {
    const estado = leer('client/components/MembershipStatus.tsx');
    expect(estado).toContain('MEMBERSHIP_PRICES_EUR.pro');
    expect(estado).not.toMatch(/SUPER PRO €8/);
    expect(estado).not.toMatch(/PRO €5\/mes/);
  });

  it('la portada no promete "comisiones desde 1%"', () => {
    expect(leer('client/pages/Index.tsx')).not.toMatch(/Comisiones desde 1%/);
  });

  it('las instrucciones del proyecto no repiten la tabla vieja', () => {
    const claude = leer('CLAUDE.md');
    expect(claude).not.toMatch(/8% fijo/);
    expect(claude).not.toMatch(/SUPER PRO \(\$8,999/);
    expect(claude).toContain('membershipPricing.ts');
  });
});
