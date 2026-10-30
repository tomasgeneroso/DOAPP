import express from 'express';
import type { Server } from 'node:http';

/**
 * El gemelo de los TERCEROS menores: lo único que el servidor consulta para poder mostrar precios. La cotización del dólar siempre es la misma
 * (así los montos de las pruebas no cambian de un día para otro).
 *
 *   GET /v1/dolares/blue    (dolarapi.com)
 *   GET /v2/latest          (api.bluelytics.com.ar)
 */
export const DOLAR_BLUE_DE_LAS_PRUEBAS = 1200;

export async function levantarGemeloDeTerceros(puerto: number): Promise<{ detener: () => Promise<void> }> {
  const app = express();
  app.get('/v1/dolares/blue', (_req, res) => res.json({ moneda: 'USD', casa: 'blue', nombre: 'Blue', compra: DOLAR_BLUE_DE_LAS_PRUEBAS - 20, venta: DOLAR_BLUE_DE_LAS_PRUEBAS, fechaActualizacion: new Date().toISOString() }));
  app.get('/v2/latest', (_req, res) =>
    res.json({ blue: { value_avg: DOLAR_BLUE_DE_LAS_PRUEBAS - 10, value_sell: DOLAR_BLUE_DE_LAS_PRUEBAS, value_buy: DOLAR_BLUE_DE_LAS_PRUEBAS - 20 }, oficial: { value_sell: DOLAR_BLUE_DE_LAS_PRUEBAS / 1.4 } }),
  );
  app.use((req, res) => {
    console.warn(`[terceros-gemelo] pedido sin respuesta preparada: ${req.method} ${req.originalUrl} (host original: ${req.headers['x-e2e-host-original'] || '?'})`);
    res.status(404).json({});
  });
  const servidor: Server = await new Promise((ok, mal) => {
    const s = app.listen(puerto, '127.0.0.1', () => ok(s));
    s.once('error', mal);
  });
  return { detener: () => new Promise<void>((ok) => servidor.close(() => ok())) };
}
