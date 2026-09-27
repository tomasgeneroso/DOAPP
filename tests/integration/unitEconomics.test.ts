import { describe, it, expect, beforeAll } from '@jest/globals';

/**
 * La regla de la economía unitaria: un número que no se puede calcular no se
 * calcula.
 *
 * Es la tentación central de un tablero financiero en una app que todavía no
 * lanzó. Con cero clientes el CAC es una división por cero y el LTV es una
 * proyección sobre una retención que nadie midió; rellenar eso con supuestos
 * produce un tablero que se ve completo, del que seis meses después nadie
 * recuerda qué parte era medición y qué parte era deseo — y entonces se
 * aprueban presupuestos sobre números inventados.
 *
 * Estos tests existen para que eso no se pueda romper por descuido. El día que
 * alguien "mejore" la pantalla haciendo que un CAC sin datos devuelva 0, acá
 * se va a poner en rojo.
 */
describe('economía unitaria: nada se inventa', () => {
  let getUnitEconomics: any;

  /** Un plan vacío: ni presupuesto, ni caja, ni supuestos. */
  const PLAN_VACIO = {};

  /** Un plan completo, como el que tiene cargado el owner. */
  const PLAN_CARGADO = {
    budgetCurrency: 'USD',
    budget: [
      { c: 'Meta Ads / adquisición', m: 3000 },
      { c: 'Infraestructura tech', m: 900 },
    ],
    capitalCurrency: 'ARS',
    capitalInicial: 5_000_000,
    ueCurrency: 'USD',
    ue: { comision: 12, ticket: 85, contratos: 0.8, disputas: 2.5, soporte: 8, fraude: 0.8 },
    projectionCurrency: 'EUR',
    projection: {
      growth: { churnPct: 12 },
      revenue: { ticket: 22, contratosPorUsuario: 0.15 },
    },
  };

  beforeAll(async () => {
    ({ getUnitEconomics } = await import('../../server/services/unitEconomics.js'));
  });

  it('con un plan vacío, ninguna métrica devuelve cero: todas dicen qué falta', async () => {
    const ue = await getUnitEconomics(PLAN_VACIO);

    for (const metrica of [
      ue.adquisicion.gastoMarketingMensual,
      ue.adquisicion.cacPorRegistro,
      ue.adquisicion.cacPorClienteReal,
      ue.caja.disponible,
      ue.caja.quemaMensual,
      ue.caja.runwayMeses,
    ]) {
      expect(metrica.valor).toBeNull();
      expect(metrica.origen).toBe('sin-datos');
      // Y no un "no disponible" pelado: tiene que decir qué falta.
      expect(String(metrica.motivo || '').length).toBeGreaterThan(20);
    }
  });

  it('el CAC no se calcula sin altas, por más presupuesto que haya', async () => {
    // Es la division por cero que un tablero descuidado convierte en Infinity
    // o en 0, y las dos son mentira.
    const ue = await getUnitEconomics(PLAN_CARGADO);

    if (ue.adquisicion.altas30.valor === null) {
      expect(ue.adquisicion.cacPorRegistro.valor).toBeNull();
      expect(ue.adquisicion.cacPorRegistro.motivo).toMatch(/altas/i);
    } else {
      // Si hay altas, el CAC tiene que ser un número finito y positivo.
      expect(Number.isFinite(ue.adquisicion.cacPorRegistro.valor)).toBe(true);
      expect(ue.adquisicion.cacPorRegistro.valor).toBeGreaterThan(0);
    }
  });

  it('cada métrica declara si fue medida o supuesta', async () => {
    /**
     * Un supuesto marcado es una hipótesis; un supuesto sin marcar, con el
     * tiempo, se convierte en un hecho que nadie verificó. Es exactamente cómo
     * la tabla de comisiones terminó diciendo 8%/3%/1% mientras el código
     * cobraba otra cosa.
     */
    const ue = await getUnitEconomics(PLAN_CARGADO);
    const ORIGENES = ['medido', 'supuesto', 'mixto', 'sin-datos'];

    const revisar = (m: any, donde: string) => {
      expect(ORIGENES).toContain(m.origen);
      if (m.valor === null) expect(m.origen).toBe('sin-datos');
      if (m.origen === 'sin-datos') expect(m.valor).toBeNull();
    };

    revisar(ue.adquisicion.gastoMarketingMensual, 'gasto');
    revisar(ue.valor.ticketPromedio, 'ticket');
    revisar(ue.valor.churnMensualPct, 'churn');
    revisar(ue.caja.runwayMeses, 'runway');
    for (const esc of ['pesimista', 'moderado', 'optimista']) {
      revisar(ue.valor.ltv[esc], `ltv ${esc}`);
      revisar(ue.salud.ltvSobreCac[esc], `ratio ${esc}`);
    }
  });

  it('el presupuesto de adquisición no se lleva las líneas que no compran clientes', async () => {
    /**
     * Meter la infraestructura adentro del CAC infla el costo de adquirir y
     * hace parecer que la pauta no rinde, cuando lo que pasa es que se está
     * contando el hosting como si fuera publicidad.
     *
     * Del plan cargado, sólo "Meta Ads / adquisición" (USD 3.000) cuenta; la
     * infraestructura (USD 900) no. Así que el gasto de adquisición tiene que
     * ser menor que la quema total.
     */
    const ue = await getUnitEconomics(PLAN_CARGADO);
    expect(ue.adquisicion.gastoMarketingMensual.valor).toBeGreaterThan(0);
    expect(ue.caja.quemaMensual.valor).toBeGreaterThan(
      ue.adquisicion.gastoMarketingMensual.valor as number,
    );
  });

  it('los tres escenarios de churn salen del mismo supuesto y están ordenados', async () => {
    // Derivados y no escritos aparte: si alguien corrige el plan, los tres se
    // mueven juntos. Tres números sueltos terminan contradiciendose.
    const ue = await getUnitEconomics(PLAN_CARGADO);
    const c = ue.valor.churnPorEscenario;

    expect(c.optimista).toBeLessThan(c.moderado);
    expect(c.moderado).toBeLessThan(c.pesimista);
    expect(c.moderado).toBe(12); // el del plan, sin tocar
  });

  it('avisa cuando el plan se contradice consigo mismo', async () => {
    // El plan cargado tiene USD 85 en un bloque y EUR 22 en el otro: no es un
    // redondeo, son dos negocios distintos.
    const ue = await getUnitEconomics(PLAN_CARGADO);
    expect(ue.contexto.inconsistenciaDelPlan).toMatch(/dos tickets/i);
  });

  it('el veredicto lidera con el margen negativo cuando lo hay', async () => {
    /**
     * Es el hallazgo más caro de descubrir tarde: si atender un contrato cuesta
     * más que la comisión que deja, ninguna cantidad de usuarios arregla el
     * negocio. No depende de tener datos —es aritmética sobre los supuestos—
     * asi que tiene que decirse antes que "todavía no hay usuarios".
     */
    const ue = await getUnitEconomics(PLAN_CARGADO);
    if (ue.valor.desglosePorContrato && ue.valor.desglosePorContrato.margen < 0) {
      expect(ue.salud.veredicto).toMatch(/margen negativo/i);
      expect(ue.salud.veredicto).not.toMatch(/^No hay negocio que medir/);
    }
  });

  it('el desglose por contrato cierra: comisión menos costo es el margen', async () => {
    const ue = await getUnitEconomics(PLAN_CARGADO);
    const d = ue.valor.desglosePorContrato;
    if (!d) return;
    expect(d.comisionGanada - d.costoVariable).toBe(d.margen);
    expect(d.comisionGanada).toBeLessThanOrEqual(d.ticket);
  });
});
