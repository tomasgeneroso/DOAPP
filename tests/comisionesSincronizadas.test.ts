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

/**
 * El artículo de la beta y los avisos de beta dicen lo que se cobra.
 *
 * El artículo prometía 8% / 3% / 1% y un SUPER PRO a $8.999, y un cliente que paga
 * $36.000 en la beta cuando además paga el costo de procesamiento. Ahora sus números
 * salen del código y este test lo ata.
 */
import { betaPost, EJEMPLO_DE_LA_BETA, EJEMPLO_DESPUES_DE_LA_BETA } from '../shared/content/betaPost.js';
import { COMMISSION_RATES, MEMBERSHIP_PRICES_EUR } from '../shared/constants/membershipPricing.js';
import { splitFees } from '../shared/pricing/processingCost.js';

describe('el artículo de la beta', () => {
  const texto = JSON.stringify(betaPost);

  it('no menciona planes ni tasas anteriores', () => {
    for (const viejo of [
      /SUPER PRO/i,
      /\$\s?4\.999/,
      /\$\s?8\.999/,
      /8%\s+en\s+FREE/i,
      /3%\s+en\s+PRO/i,
      /1%\s+en\s+SUPER/i,
      /entre\s+1%\s+y\s+8%/i,
      /m[ií]nimo\s+de\s+\$\s?1\.000/i,
      /contratos?\s+mensuales?\s+sin\s+comisi/i,
    ]) {
      expect({ patron: String(viejo), aparece: viejo.test(texto) }).toEqual({ patron: String(viejo), aparece: false });
    }
  });

  it('dice la comisión y el precio de la membresía que salen de las constantes', () => {
    expect(texto).toContain(`${COMMISSION_RATES.free}%`);
    expect(texto).toContain(`€${MEMBERSHIP_PRICES_EUR.pro}`);
  });

  it('el ejemplo es la cuenta real del cobro, y el trabajador recibe lo mismo en las dos etapas', () => {
    const real = splitFees(36000, 3600, 756, EJEMPLO_DESPUES_DE_LA_BETA.rate);
    expect(EJEMPLO_DESPUES_DE_LA_BETA.clientPays).toBe(real.clientPays);
    expect(EJEMPLO_DE_LA_BETA.workerReceives).toBe(36000);
    expect(EJEMPLO_DESPUES_DE_LA_BETA.workerReceives).toBe(36000);
  });

  it('en la beta el cliente paga MÁS que el precio: el costo de procesamiento también se cobra', () => {
    // Antes decía "el cliente paga $36.000". La cláusula 7.3 dice que el procesamiento se cobra en la beta.
    expect(EJEMPLO_DE_LA_BETA.clientPays).toBeGreaterThan(36000);
    expect(EJEMPLO_DE_LA_BETA.commission).toBe(0);
    expect(EJEMPLO_DE_LA_BETA.processingCharge).toBeGreaterThan(0);
  });

  it('el cuerpo del artículo trae la tabla con las dos columnas calculadas', () => {
    expect(betaPost.content).toContain('| **Paga el cliente** |');
    expect(betaPost.content).toContain(EJEMPLO_DESPUES_DE_LA_BETA.clientPays.toLocaleString('es-AR', { minimumFractionDigits: 2 }));
  });
});

describe('los avisos de beta', () => {
  it.each(['client/components/BetaBanner.tsx', 'client/components/BetaNotice.tsx'])(
    '%s no menciona SUPER PRO ni "comisiones según tu plan" y lee la comisión de la constante',
    (archivo) => {
      const fuente = leer(archivo);
      expect(fuente).not.toMatch(/SUPER PRO/);
      expect(fuente).not.toMatch(/seg[uú]n tu plan/i);
      expect(fuente).toContain('COMMISSION_RATES.free');
    },
  );

  it('la nota de la beta dice que el cliente paga el costo de procesamiento (ya no "lo que vale el trabajo es lo que paga")', () => {
    const aviso = leer('client/components/BetaNotice.tsx');
    expect(aviso).toContain('costo de procesamiento');
    expect(aviso).not.toMatch(/lo que vale el trabajo es lo que paga/);
  });
});
