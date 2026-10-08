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

/* ------------------------------------------------------------------ *
 * El resto de las copias: archivos públicos, servidor y app mobile
 * ------------------------------------------------------------------ */

/** El texto de un archivo sin comentarios: los comentarios pueden NOMBRAR lo viejo para explicar por qué ya no está. */
const sinComentarios = (fuente: string) =>
  fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

const PLANES_Y_TASAS_VIEJOS: RegExp[] = [
  /SUPER PRO/,
  /\$\s?4\.999/,
  /\$\s?8\.999/,
  /\$\s?13\.347/,
  /PRO Trimestral/i,
  /PRO Mensual/,
];

describe('los archivos públicos dicen la comisión y el plan vigentes', () => {
  it.each(['index.html', 'public/llms.txt'])('%s', (archivo) => {
    const texto = leer(archivo);
    expect(texto).toContain(`${COMMISSION_RATES.free}%`);
    expect(texto).toContain(`€${MEMBERSHIP_PRICES_EUR.pro}`);
    // (El "mínimo $1.000" que sí existe es el de los retiros a CBU: no es de la comisión.)
    for (const viejo of [...PLANES_Y_TASAS_VIEJOS, /8%\s*(FREE|\))/, /3%\s*PRO/, /1%\s*SUPER/]) {
      expect({ archivo, patron: String(viejo), aparece: viejo.test(texto) }).toEqual({ archivo, patron: String(viejo), aparece: false });
    }
  });
});

describe('el servidor calcula y describe la comisión vigente', () => {
  it('commissionService no escribe tasas a mano en lo que le muestra al usuario', () => {
    const f = leer('server/services/commissionService.ts');
    expect(sinComentarios(f)).not.toMatch(/\((8|3|1)%\s+fijo\)/);
    expect(sinComentarios(f)).not.toMatch(/nextTier:\s*\{\s*volume:\s*0/); // subir de plan no baja la comisión
  });

  it('el cobro de una cotización usa calculateCommission y no 8% con piso de $1.000', () => {
    const f = sinComentarios(leer('server/routes/quotes.ts'));
    expect(f).not.toMatch(/commissionRate\s*=\s*0\.08/);
    expect(f).not.toMatch(/Math\.max\([^)]*,\s*1000\)/);
    expect(f).toContain('splitFees(');
  });

  it('la comisión de modificar el precio de un contrato sigue usando la tasa guardada, y eso está marcado como pendiente', () => {
    /**
     * Esa ruta (`modify-price`) lee `currentCommissionRate` —que en las cuentas
     * existentes quedó con la tasa del plan viejo— y sólo cobra la diferencia, no la
     * comisión sobre ella. Cambiar sólo el valor guardado dejaría un ingreso contable que
     * nadie pagó (lo revisó el `reviewer`), así que no se tocó: queda marcado en el código
     * para que no se olvide, y este test avisa si alguien lo cambia sin cobrar la plata.
     */
    const f = leer('server/routes/contracts.ts');
    expect(f).toContain('currentCommissionRate / 100');
    expect(f).toContain('pendiente de decisión del dueño');
  });
});

describe('la app mobile ofrece un solo plan pago', () => {
  it.each([
    'mobile/app/membership.tsx',
    'mobile/app/membership-checkout.tsx',
    'mobile/app/pro-dashboard.tsx',
    'mobile/app/(tabs)/profile.tsx',
  ])('%s no ofrece SUPER PRO ni PRO trimestral ni precios en pesos viejos', (archivo) => {
    const f = sinComentarios(leer(archivo));
    for (const viejo of PLANES_Y_TASAS_VIEJOS) {
      expect({ archivo, patron: String(viejo), aparece: viejo.test(f) }).toEqual({ archivo, patron: String(viejo), aparece: false });
    }
  });

  it('la compra manda `plan`, que es lo que el servidor espera (con `membershipType` respondía 400)', () => {
    const f = leer('mobile/app/membership.tsx');
    expect(f).toContain("{ plan: 'monthly' }");
    expect(f).not.toContain('{ membershipType: plan }');
  });
});

describe('la web ofrece un solo plan pago, y lo dice igual en español e inglés', () => {
  // Las pantallas que ofrecían o describían planes. FinancePanel, WorkerSelectionInfo y
  // admin/Users quedan afuera a propósito: dependen de beneficios por plan que son una
  // decisión pendiente del dueño (ver el informe).
  const PANTALLAS = [
    'client/components/MembershipOfferModal.tsx',
    'client/components/ProMembershipModal.tsx',
    'client/components/MembershipStatus.tsx',
    'client/components/app/Header.tsx',
    'client/components/chat/QuoteMessage.tsx',
    'client/pages/MembershipCheckout.tsx',
    'client/pages/MembershipPaymentSuccess.tsx',
    'client/pages/Dashboard.tsx',
    'client/pages/ProUsageDashboard.tsx',
    'client/pages/ContractSummary.tsx',
    'client/pages/JobPayment.tsx',
    'client/pages/UserSettings.tsx',
    'client/pages/admin/Dashboard.tsx',
    'client/pages/admin/FinancialTransactions.tsx',
    'client/pages/admin/PlatformPhase.tsx',
  ];

  it.each(PANTALLAS)('%s no menciona SUPER PRO, PRO trimestral ni los precios en pesos viejos', (archivo) => {
    const f = sinComentarios(leer(archivo));
    for (const viejo of PLANES_Y_TASAS_VIEJOS) {
      expect({ archivo, patron: String(viejo), aparece: viejo.test(f) }).toEqual({ archivo, patron: String(viejo), aparece: false });
    }
  });

  it('ninguna pantalla promete una comisión distinta según el plan (8% / 3% / 1%)', () => {
    for (const archivo of PANTALLAS) {
      const f = sinComentarios(leer(archivo));
      for (const viejo of [/\(\s*\+\s*8\s*%\s*\)/, /comisi[oó]n[^\n]{0,40}\b(3|1)\s?%/i, /\b8\s?%\s*(de\s+)?comisi/i]) {
        expect({ archivo, patron: String(viejo), aparece: viejo.test(f) }).toEqual({ archivo, patron: String(viejo), aparece: false });
      }
    }
  });

  it('es.json y en.json no mencionan planes ni tasas anteriores', () => {
    const viejos = [
      /SUPER PRO/i,
      /\$\s?4[.,]999/,
      /\$\s?8[.,]999/,
      /\$\s?13[.,]347/,
      /Trimestral|Quarterly/i,
      /PRO Mensual/,
      /\b(8|3|1)\s?%[^"]{0,40}(comisi[oó]n|commission)|(comisi[oó]n|commission)[^"]{0,40}\b(8|3|1)\s?%/i,
    ];
    for (const idioma of ['es', 'en']) {
      const json = JSON.parse(leer(`client/i18n/locales/${idioma}.json`));
      const hallazgos: string[] = [];
      const recorrer = (nodo: Record<string, unknown>, ruta: string) => {
        for (const [clave, valor] of Object.entries(nodo)) {
          if (valor && typeof valor === 'object') recorrer(valor as Record<string, unknown>, `${ruta}${clave}.`);
          // `referrals.*` queda afuera a propósito: la recompensa de referidos ("3% de
          // comisión permanente") es una decisión pendiente del dueño. Ver el informe:
          // la recompensa se guarda pero `calculateCommission` no la lee.
          else if (typeof valor === 'string' && !`${ruta}${clave}`.startsWith('referrals.') && viejos.some((re) => re.test(valor))) hallazgos.push(`${ruta}${clave}`);
        }
      };
      recorrer(json, '');
      expect({ idioma, hallazgos }).toEqual({ idioma, hallazgos: [] });
    }
  });

  it('la respuesta de comisiones del FAQ lleva las cifras por variables, no escritas a mano', () => {
    for (const idioma of ['es', 'en']) {
      const json = JSON.parse(leer(`client/i18n/locales/${idioma}.json`));
      const texto: string = json.settings.faq.commissionsAnswer;
      expect(texto).toContain('{{comision}}');
      expect(texto).toContain('{{piso}}');
      expect(texto).toContain('{{precio}}');
    }
    expect(leer('client/pages/UserSettings.tsx')).toContain('comision: COMMISSION_RATES.free');
  });

  it('el modal de planes no promete comisión por plan ni contratos sin comisión de la membresía', () => {
    const modal = sinComentarios(leer('client/components/MembershipOfferModal.tsx'));
    expect(modal).not.toContain("'membership.proFeat1'");
    expect(modal).not.toContain("'membership.proFeat2'");
    expect(modal).toContain('MEMBERSHIP_PRICES_EUR.pro');
  });
});
