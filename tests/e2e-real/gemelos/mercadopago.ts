import express from 'express';
import { createHmac, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { IVA, getProcessingFeeRate } from '../../../shared/pricing/processingCost.js';

/**
 * El gemelo de MERCADO PAGO. Habla el mismo idioma que el de verdad en lo que DOAPP usa, así el servidor y la web corren sin cambios:
 *
 *   POST /checkout/preferences        crear la preferencia (devuelve `init_point`: la página de pago)
 *   GET  /checkout/:id                la página de pago: tarjeta o efectivo, con su formulario (la persona la llena en el navegador)
 *   GET  /v1/payments/:id             el pago, tal como lo lee DOAPP para verificarlo
 *   POST /v1/payments/:id/refunds     devolución total o parcial
 *   POST <webhook de DOAPP>           el aviso automático de «pago creado/actualizado», firmado con HMAC como el de verdad
 *
 * Cómo decide si un pago sale bien (las reglas de las tarjetas de prueba de Mercado Pago, más las de «una tarjeta real»):
 *   - titular APRO → aprobado · CONT → pendiente · OTHE → rechazado · FUND → sin fondos · SECU → código inválido · EXPI → vencimiento inválido · FORM → datos mal
 *   - cualquier otro titular se trata como una tarjeta real: se aprueba con código 123 y vencimiento futuro; código distinto → rechazado por
 *     código de seguridad; vencimiento pasado → rechazado por vencimiento (lo que el checklist hace «a propósito»).
 *   - «Efectivo» deja el pago pendiente hasta que se paga el cupón (`POST /__control/pagar-cupon/:id`).
 *
 * Lo que este gemelo NO puede decir: que Mercado Pago de verdad cobre y descuente lo mismo que DOAPP calcula. Eso se comprueba con UN pago real.
 */
export interface OpcionesDelGemelo {
  puerto: number;
  /** Dirección del aviso automático de DOAPP (la que se configura en el panel de Mercado Pago). */
  urlWebhook: string;
  secretoDelWebhook: string;
}

export interface Pago {
  id: number;
  status: string;
  status_detail: string;
  transaction_amount: number;
  currency_id: string;
  metadata: Record<string, unknown>;
  external_reference: string | null;
  payment_type_id: string;
  payment_method_id: string;
  installments: number;
  coupon_amount: number;
  card: { last_four_digits: string; first_six_digits: string; expiration_month: number; expiration_year: number; cardholder: { name: string } } | null;
  fee_details: Array<{ type: string; amount: number; fee_payer: string }>;
  transaction_details: { net_received_amount: number; total_paid_amount: number };
  transaction_amount_refunded: number;
  date_created: string;
  date_approved: string | null;
  money_release_date: string | null;
  preference_id: string;
}

interface Preferencia {
  id: string;
  body: any;
  creadaEl: string;
}

export interface ControlDelGemelo {
  detener: () => Promise<void>;
  pagos: Map<number, Pago>;
}

const peso = (n: number) => `$ ${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const redondear = (n: number) => Math.round(n * 100) / 100;

const HTML_BASE = (titulo: string, cuerpo: string) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titulo}</title><style>
body{font-family:system-ui,Arial,sans-serif;background:#ededed;margin:0;color:#333}
main{max-width:520px;margin:24px auto;background:#fff;border-radius:8px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,.2)}
h1{font-size:20px;margin:0 0 4px}.sub{color:#666;margin:0 0 16px;font-size:13px}
label{display:block;margin:12px 0 4px;font-size:14px}input,select{width:100%;padding:10px;border:1px solid #bbb;border-radius:6px;font-size:15px;box-sizing:border-box}
button{margin-top:18px;width:100%;padding:12px;border:0;border-radius:6px;background:#3483fa;color:#fff;font-size:16px;cursor:pointer}
button.sec{background:#fff;color:#3483fa;border:1px solid #3483fa}.total{font-size:26px;margin:8px 0}.aviso{background:#fff8e1;border:1px solid #ffe082;padding:8px;border-radius:6px;font-size:12px;margin-bottom:12px}
.tabs{display:flex;gap:8px;margin-bottom:8px}.tabs a{flex:1;text-align:center;padding:8px;border:1px solid #3483fa;border-radius:6px;text-decoration:none;color:#3483fa}.tabs a.activa{background:#3483fa;color:#fff}
</style></head><body><main>${cuerpo}</main></body></html>`;

export async function levantarGemeloDeMercadoPago(opciones: OpcionesDelGemelo): Promise<ControlDelGemelo> {
  const { puerto, urlWebhook, secretoDelWebhook } = opciones;
  const preferencias = new Map<string, Preferencia>();
  const pagos = new Map<number, Pago>();
  const pedidos: Array<{ cuando: string; metodo: string; ruta: string; cuerpo: unknown }> = [];
  const config = { modoWebhook: 'normal' as 'normal' | 'no_enviar', retrasoWebhookMs: 250, fallarDevoluciones: false, tasa: null as number | null };
  let siguientePago = 1_300_000_000 + Math.floor(Math.random() * 1000);

  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use((req, _res, next) => {
    if (!req.path.startsWith('/__control')) pedidos.push({ cuando: new Date().toISOString(), metodo: req.method, ruta: req.originalUrl, cuerpo: req.body });
    next();
  });

  const tasa = () => (config.tasa ?? getProcessingFeeRate());

  // ── La API que usa el servidor ──────────────────────────────────────────────────────────────────────────────────────────────
  app.post('/checkout/preferences', (req, res) => {
    if (!String(req.headers.authorization || '').startsWith('Bearer APP_USR-')) {
      res.status(401).json({ message: 'invalid access token', status: 401 });
      return;
    }
    const id = `${1_900_000_000}-${randomUUID()}`;
    preferencias.set(id, { id, body: req.body, creadaEl: new Date().toISOString() });
    res.status(201).json({
      id,
      init_point: `http://localhost:${puerto}/checkout/${encodeURIComponent(id)}`,
      sandbox_init_point: `http://localhost:${puerto}/checkout/${encodeURIComponent(id)}`,
      items: req.body?.items,
      date_created: new Date().toISOString(),
    });
  });

  app.get('/v1/payments/:id', (req, res) => {
    const p = pagos.get(Number(req.params.id));
    if (!p) {
      res.status(404).json({ message: 'Payment not found', error: 'not_found', status: 404, cause: [] });
      return;
    }
    res.json(p);
  });

  app.post('/v1/payments/:id/refunds', (req, res) => {
    const p = pagos.get(Number(req.params.id));
    if (!p) {
      res.status(404).json({ message: 'Payment not found', error: 'not_found', status: 404, cause: [] });
      return;
    }
    const falla = (descripcion: string) =>
      res.status(400).json({ message: descripcion, error: 'bad_request', status: 400, cause: [{ code: 2000, description: descripcion }] });
    if (config.fallarDevoluciones) return void falla('Mercado Pago no puede devolver este pago ahora');
    if (!['approved', 'refunded'].includes(p.status) && p.status !== 'approved') return void falla('El pago no está aprobado');
    const pedido = req.body && Number(req.body.amount) > 0 ? Number(req.body.amount) : null;
    const devolvible = redondear(p.transaction_amount - p.transaction_amount_refunded);
    const monto = pedido ?? devolvible;
    if (monto > devolvible + 0.005) return void falla('El monto supera lo que se puede devolver');
    p.transaction_amount_refunded = redondear(p.transaction_amount_refunded + monto);
    if (p.transaction_amount_refunded >= p.transaction_amount - 0.005) p.status = 'refunded';
    enviarWebhook('payment.updated', p.id);
    res.status(201).json({ id: Math.floor(Math.random() * 1e9), payment_id: p.id, amount: monto, status: 'approved', date_created: new Date().toISOString() });
  });

  // ── La página de pago (lo que ve y toca la persona) ─────────────────────────────────────────────────────────────────────────
  app.get('/checkout/:id', (req, res) => {
    const pref = preferencias.get(req.params.id);
    if (!pref) {
      res.status(404).send(HTML_BASE('Mercado Pago', '<h1>Esta página de pago no existe</h1>'));
      return;
    }
    const item = pref.body?.items?.[0] || {};
    const total = Number(item.unit_price) || 0;
    const modo = req.query.medio === 'efectivo' ? 'efectivo' : 'tarjeta';
    const base = `/checkout/${encodeURIComponent(pref.id)}`;
    const soloUnaCuota = Number(pref.body?.payment_methods?.installments) === 1;
    const cuotas = (soloUnaCuota ? [1] : [1, 3, 6, 12]).map((n) => `<option value="${n}">${n} ${n === 1 ? 'cuota' : 'cuotas'}</option>`).join('');
    const formulario =
      modo === 'tarjeta'
        ? `<form method="post" action="${base}/pagar"><input type="hidden" name="medio" value="tarjeta">
<label for="numero">Número de tarjeta</label><input id="numero" name="numero" inputmode="numeric" autocomplete="off">
<label for="titular">Nombre y apellido del titular</label><input id="titular" name="titular" autocomplete="off">
<label for="vencimiento">Vencimiento (MM/AA)</label><input id="vencimiento" name="vencimiento" placeholder="MM/AA" autocomplete="off">
<label for="codigo">Código de seguridad</label><input id="codigo" name="codigo" autocomplete="off">
<label for="documento">DNI del titular</label><input id="documento" name="documento" autocomplete="off">
<label for="cuotas">Cuotas</label><select id="cuotas" name="cuotas">${cuotas}</select>
<label for="cupon">Cupón de descuento (opcional)</label><input id="cupon" name="cupon" autocomplete="off">
<button type="submit">Pagar</button></form>`
        : `<form method="post" action="${base}/pagar"><input type="hidden" name="medio" value="efectivo">
<p>Generá el cupón y pagalo en Rapipago o Pago Fácil.</p><button type="submit">Generar cupón de pago</button></form>`;
    res.send(
      HTML_BASE(
        'Mercado Pago · Pagá',
        `<div class="aviso">Gemelo de pruebas de Mercado Pago: nada de lo que se hace acá es real.</div>
<h1>${item.title || 'Tu compra'}</h1><p class="sub">Vendedor: DOAPP</p><div class="total" data-testid="total-a-pagar">${peso(total)}</div>
<div class="tabs"><a class="${modo === 'tarjeta' ? 'activa' : ''}" href="${base}">Tarjeta</a><a class="${modo === 'efectivo' ? 'activa' : ''}" href="${base}?medio=efectivo">Efectivo</a></div>
${formulario}
<form method="get" action="${base}/volver"><button class="sec" type="submit">Volver al sitio</button></form>`,
      ),
    );
  });

  const volverA = (pref: Preferencia, pago: Pago | null, clave: 'success' | 'failure' | 'pending') => {
    const destino = pref.body?.back_urls?.[clave] || pref.body?.back_urls?.success;
    if (!destino) return null;
    const u = new URL(destino);
    if (pago) {
      u.searchParams.set('collection_id', String(pago.id));
      u.searchParams.set('collection_status', pago.status);
      u.searchParams.set('payment_id', String(pago.id));
      u.searchParams.set('status', pago.status);
      u.searchParams.set('payment_type', pago.payment_type_id);
      u.searchParams.set('merchant_order_id', String(pago.id + 1));
      u.searchParams.set('site_id', 'MLA');
    }
    u.searchParams.set('external_reference', pago?.external_reference || 'null');
    u.searchParams.set('preference_id', pref.id);
    return u.toString();
  };

  app.get('/checkout/:id/volver', (req, res) => {
    const pref = preferencias.get(req.params.id);
    const destino = pref && volverA(pref, null, 'failure');
    res.redirect(destino || `http://localhost:${puerto}/checkout/${encodeURIComponent(req.params.id)}`);
  });

  app.post('/checkout/:id/pagar', (req, res) => {
    const pref = preferencias.get(req.params.id);
    if (!pref) return void res.status(404).send('no existe');
    const item = pref.body?.items?.[0] || {};
    const monto = Number(item.unit_price) || 0;
    const medio = String(req.body?.medio || 'tarjeta');
    const f = req.body || {};

    let status = 'approved';
    let detalle = 'accredited';
    let tipo = 'credit_card';
    let metodo = 'visa';
    let tarjeta: Pago['card'] = null;
    let cuotas = Math.max(1, Number(f.cuotas) || 1);
    let cupon = 0;

    if (medio === 'efectivo') {
      status = 'pending';
      detalle = 'pending_waiting_payment';
      tipo = 'ticket';
      metodo = 'rapipago';
      cuotas = 1;
    } else {
      const numero = String(f.numero || '').replace(/\D/g, '');
      const titular = String(f.titular || '').trim();
      const [mm, aa] = String(f.vencimiento || '').split('/').map((x) => Number(x.trim()));
      const anio = aa < 100 ? 2000 + aa : aa;
      const vencida = !mm || !aa || mm < 1 || mm > 12 || new Date(anio, mm, 0, 23, 59, 59).getTime() < Date.now();
      tarjeta = { last_four_digits: numero.slice(-4), first_six_digits: numero.slice(0, 6), expiration_month: mm || 0, expiration_year: anio || 0, cardholder: { name: titular } };
      metodo = numero.startsWith('5') ? 'master' : 'visa';
      const mayus = titular.toUpperCase();
      if (numero.length < 13) {
        status = 'rejected';
        detalle = 'cc_rejected_bad_filled_card_number';
      } else if (mayus === 'CONT') {
        status = 'pending';
        detalle = 'pending_contingency';
      } else if (mayus === 'OTHE') {
        status = 'rejected';
        detalle = 'cc_rejected_other_reason';
      } else if (mayus === 'FUND') {
        status = 'rejected';
        detalle = 'cc_rejected_insufficient_amount';
      } else if (mayus === 'SECU' || (mayus !== 'APRO' && String(f.codigo || '').trim() !== '123')) {
        status = 'rejected';
        detalle = 'cc_rejected_bad_filled_security_code';
      } else if (mayus === 'EXPI' || (mayus !== 'APRO' && vencida)) {
        status = 'rejected';
        detalle = 'cc_rejected_bad_filled_date';
      } else if (mayus === 'FORM') {
        status = 'rejected';
        detalle = 'cc_rejected_bad_filled_other';
      }
      if (status === 'approved' && String(f.cupon || '').trim().toUpperCase() === 'DESC10') cupon = redondear(monto * 0.1);
    }

    const cobrado = redondear(monto - cupon);
    const comision = status === 'approved' ? redondear(cobrado * tasa() * (1 + IVA)) : 0;
    const ahora = new Date();
    const pago: Pago = {
      id: siguientePago++,
      status,
      status_detail: detalle,
      // Como la API real: `transaction_amount` es el precio del producto y el descuento viene aparte en `coupon_amount`; lo que sale de la tarjeta es `total_paid_amount`.
      transaction_amount: monto,
      currency_id: item.currency_id || 'ARS',
      metadata: pref.body?.metadata || {},
      external_reference: pref.body?.external_reference || null,
      payment_type_id: tipo,
      payment_method_id: metodo,
      installments: cuotas,
      coupon_amount: cupon,
      card: tarjeta,
      fee_details: status === 'approved' ? [{ type: 'mercadopago_fee', amount: comision, fee_payer: 'collector' }] : [],
      transaction_details: { net_received_amount: status === 'approved' ? redondear(cobrado - comision) : 0, total_paid_amount: cobrado },
      transaction_amount_refunded: 0,
      date_created: ahora.toISOString(),
      date_approved: status === 'approved' ? ahora.toISOString() : null,
      money_release_date: status === 'approved' ? new Date(ahora.getTime() + 10 * 86_400_000).toISOString() : null,
      preference_id: pref.id,
    };
    pagos.set(pago.id, pago);
    enviarWebhook('payment.created', pago.id);

    if (medio === 'efectivo') {
      res.send(
        HTML_BASE(
          'Mercado Pago · Cupón',
          `<h1>Tu cupón de pago está listo</h1><p>Pagalo en Rapipago o Pago Fácil para completar la compra. Número de pago: <strong data-testid="numero-de-pago">${pago.id}</strong></p>
<form method="get" action="/checkout/${encodeURIComponent(pref.id)}/seguir/${pago.id}"><button type="submit">Volver al sitio</button></form>`,
        ),
      );
      return;
    }
    const clave = status === 'approved' ? 'success' : status === 'pending' ? 'pending' : 'failure';
    if (status === 'rejected') {
      res.send(
        HTML_BASE(
          'Mercado Pago · Pago rechazado',
          `<h1>No pudimos procesar tu pago</h1><p data-testid="motivo-del-rechazo">${mensajeDeRechazo(detalle)}</p>
<form method="get" action="/checkout/${encodeURIComponent(pref.id)}"><button type="submit">Probar con otra tarjeta</button></form>
<form method="get" action="/checkout/${encodeURIComponent(pref.id)}/seguir/${pago.id}"><button class="sec" type="submit">Volver al sitio</button></form>`,
        ),
      );
      return;
    }
    res.redirect(volverA(pref, pago, clave) || '/');
  });

  app.get('/checkout/:id/seguir/:pago', (req, res) => {
    const pref = preferencias.get(req.params.id);
    const pago = pagos.get(Number(req.params.pago)) || null;
    if (!pref) return void res.status(404).send('no existe');
    const clave = !pago ? 'failure' : pago.status === 'approved' ? 'success' : pago.status === 'pending' ? 'pending' : 'failure';
    res.redirect(volverA(pref, pago, clave) || '/');
  });

  // ── El aviso automático (webhook) ───────────────────────────────────────────────────────────────────────────────────────────
  function enviarWebhook(accion: 'payment.created' | 'payment.updated', idPago: number) {
    if (config.modoWebhook === 'no_enviar') return;
    setTimeout(async () => {
      const ts = String(Date.now());
      const requestId = randomUUID();
      const firma = createHmac('sha256', secretoDelWebhook).update(`id:${idPago};request-id:${requestId};ts:${ts};`).digest('hex');
      const url = new URL(urlWebhook);
      url.searchParams.set('data.id', String(idPago));
      url.searchParams.set('type', 'payment');
      try {
        await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-signature': `ts=${ts},v1=${firma}`, 'x-request-id': requestId },
          body: JSON.stringify({ action: accion, api_version: 'v1', data: { id: String(idPago) }, date_created: new Date().toISOString(), id: Math.floor(Math.random() * 1e9), live_mode: true, type: 'payment', user_id: '1' }),
        });
      } catch (e) {
        console.error('[mp-gemelo] no se pudo mandar el aviso a DOAPP:', (e as Error).message);
      }
    }, config.retrasoWebhookMs);
  }

  // ── Control para las pruebas ────────────────────────────────────────────────────────────────────────────────────────────────
  app.get('/__control/estado', (_req, res) => res.json({ config, pagos: [...pagos.values()], preferencias: [...preferencias.values()], pedidos }));
  app.post('/__control/config', (req, res) => {
    Object.assign(config, req.body || {});
    res.json(config);
  });
  app.post('/__control/reiniciar', (_req, res) => {
    preferencias.clear();
    pagos.clear();
    pedidos.length = 0;
    Object.assign(config, { modoWebhook: 'normal', retrasoWebhookMs: 250, fallarDevoluciones: false, tasa: null });
    res.json({ ok: true });
  });
  /** El cupón de efectivo se paga: el pago pasa a aprobado y llega el aviso, como cuando alguien paga en Rapipago. */
  app.post('/__control/pagar-cupon/:id', (req, res) => {
    const p = pagos.get(Number(req.params.id));
    if (!p || p.status !== 'pending') return void res.status(404).json({ error: 'no hay un pago pendiente con ese número' });
    const comision = redondear(p.transaction_amount * tasa() * (1 + IVA));
    Object.assign(p, {
      status: 'approved',
      status_detail: 'accredited',
      date_approved: new Date().toISOString(),
      money_release_date: new Date(Date.now() + 10 * 86_400_000).toISOString(),
      fee_details: [{ type: 'mercadopago_fee', amount: comision, fee_payer: 'collector' }],
      transaction_details: { net_received_amount: redondear(p.transaction_amount - comision), total_paid_amount: p.transaction_amount },
    });
    enviarWebhook('payment.updated', p.id);
    res.json(p);
  });
  /** Reenvía el aviso de un pago (Mercado Pago repite sus avisos). */
  app.post('/__control/reenviar-aviso/:id', (req, res) => {
    enviarWebhook('payment.updated', Number(req.params.id));
    res.json({ ok: true });
  });

  const servidor: Server = await new Promise((ok, mal) => {
    const s = app.listen(puerto, '127.0.0.1', () => ok(s));
    s.once('error', mal);
  });

  return { pagos, detener: () => new Promise<void>((ok) => servidor.close(() => ok())) };
}

function mensajeDeRechazo(detalle: string): string {
  const m: Record<string, string> = {
    cc_rejected_bad_filled_security_code: 'Revisá el código de seguridad.',
    cc_rejected_bad_filled_date: 'Revisá la fecha de vencimiento.',
    cc_rejected_bad_filled_card_number: 'Revisá el número de tarjeta.',
    cc_rejected_bad_filled_other: 'Revisá los datos.',
    cc_rejected_insufficient_amount: 'Tu tarjeta no tiene fondos suficientes.',
    cc_rejected_other_reason: 'Tu tarjeta no pudo procesar el pago.',
  };
  return m[detalle] || 'No pudimos procesar el pago.';
}
