/**
 * Cotizaciones de respaldo: lo que se usa cuando las APIs de cambio no responden.
 *
 * Estaban escritas a mano en cuatro lugares y ya se habían desviado: `1,08` dólares por euro en el panel del plan
 * mientras `currencyExchange` ya decía `1,17` (el valor viejo se había dado de baja a propósito). Un respaldo sirve
 * para que una pantalla muestre algo aproximado, nunca para calcular un cobro: el cobro usa la cotización del día.
 * Si hay que actualizarlas, se cambian acá y se enteran todos.
 */

/** Pesos por euro. */
export const COTIZACION_EUR_ARS_DE_RESPALDO = 1800;

/** Dólares por euro. Deliberadamente un valor reciente, no el 1,08 viejo. */
export const USD_POR_EUR_DE_RESPALDO = 1.17;
