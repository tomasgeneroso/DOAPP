import { config } from '../config/env.js';

/**
 * A dónde devuelve Mercado Pago a quien terminó de pagar.
 *
 * El problema: Mercado Pago siempre devolvía a una página web de DOAPP (`/payment/success`, `/contracts/<id>?pago=ok`).
 * Quien pagó desde la APP del celular pagó en el navegador del teléfono, y esa página web necesita una sesión iniciada
 * en ESE navegador (que casi nadie tiene): mostraba un error aunque el pago hubiera salido bien.
 *
 * La solución: los pedidos de pago que mandan `origen: 'app'` vuelven a `/payment/app-return`, una página pública (no
 * necesita sesión) que dice «volvé a la app» y trae un botón para abrirla. La app confirma el pago por su cuenta (ver
 * `mobile/services/pagos.ts`). Todo lo demás (la web) sigue exactamente igual.
 */
export type TipoDeRetornoApp = 'publicacion' | 'aumento' | 'cotizacion' | 'contrato' | 'orden';

export function esOrigenApp(origen: unknown): boolean {
  return origen === 'app';
}

export function urlsDeRetorno(
  origen: unknown,
  web: { exito: string; cancelado: string },
  app: { tipo: TipoDeRetornoApp; ids?: Record<string, string> },
): { successUrl: string; cancelUrl: string } {
  if (!esOrigenApp(origen)) return { successUrl: web.exito, cancelUrl: web.cancelado };

  const base = String(process.env.CLIENT_URL || config.clientUrl || '').replace(/\/+$/, '');
  // El tipo y el estado los fija el servidor: un id con esos nombres no los puede pisar.
  const consulta = (estado: 'ok' | 'cancelado') =>
    new URLSearchParams([
      ['tipo', app.tipo],
      ['estado', estado],
      ...Object.entries(app.ids || {}).filter(([k]) => k !== 'tipo' && k !== 'estado'),
    ]).toString();
  return {
    successUrl: `${base}/payment/app-return?${consulta('ok')}`,
    cancelUrl: `${base}/payment/app-return?${consulta('cancelado')}`,
  };
}
