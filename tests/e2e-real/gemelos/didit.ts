import express from 'express';
import { createHmac, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';

/**
 * El gemelo de DIDIT (verificación de identidad). El servidor crea una sesión, manda a la persona a la página de Didit, y después recibe un aviso
 * firmado y consulta la decisión. Acá la página pide los datos del documento (en Didit de verdad se sacan fotos del documento y de la cara) y decide.
 *
 *   POST /v3/session/                 crear la sesión → { session_id, url }
 *   GET  /v3/session/:id/decision/    la decisión: estado y datos leídos del documento (`id_verifications[0]`)
 *   GET  /v3/workflows/               la configuración del flujo (reintentos permitidos)
 *   GET  /verificar/:id               la página donde la persona pone los datos de su documento y confirma
 *
 * Cómo decide: por defecto aprueba. Un DNI que termina en `0000` lo RECHAZA (documento ilegible); uno que termina en `1111` lo deja EN REVISIÓN.
 * Las pruebas pueden forzar el resultado de la próxima sesión con `POST /__control/proxima-decision` (`Approved` | `Declined` | `In Review`).
 */
export interface OpcionesDeDidit {
  puerto: number;
  /** Dirección del aviso de Didit en DOAPP (`/api/auth/kyc/webhook`). */
  urlWebhook: string;
  secretoDelWebhook: string;
  workflowId: string;
}

interface Sesion {
  id: string;
  vendor_data: string;
  callback: string | null;
  status: string;
  documento: { document_number: string; first_name: string; last_name: string; full_name: string; date_of_birth: string } | null;
}

export async function levantarGemeloDeDidit(o: OpcionesDeDidit): Promise<{ detener: () => Promise<void> }> {
  const sesiones = new Map<string, Sesion>();
  const config = { proximaDecision: null as null | 'Approved' | 'Declined' | 'In Review' };
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.get('/v3/workflows/', (_req, res) => {
    res.json({ results: [{ workflow_id: o.workflowId, workflow_label: 'DOAPP (gemelo)', max_retry_attempts: 3 }] });
  });

  app.post('/v3/session/', (req, res) => {
    if (!req.headers['x-api-key']) return void res.status(401).json({ detail: 'falta la clave' });
    const id = randomUUID();
    sesiones.set(id, { id, vendor_data: String(req.body?.vendor_data || ''), callback: req.body?.callback || null, status: 'Not Started', documento: null });
    res.status(201).json({ session_id: id, url: `http://localhost:${o.puerto}/verificar/${id}`, status: 'Not Started' });
  });

  const decision = (s: Sesion) => ({
    session_id: s.id,
    status: s.status,
    vendor_data: s.vendor_data,
    workflow_id: o.workflowId,
    id_verifications: s.documento ? [{ status: s.status, ...s.documento, nationality: 'ARG', issuing_state: 'ARG', document_type: 'Identity Card' }] : [],
  });

  app.get('/v3/session/:id/decision/', (req, res) => {
    const s = sesiones.get(req.params.id);
    if (!s) return void res.status(404).json({ detail: 'sesión inexistente' });
    res.json(decision(s));
  });

  app.get('/verificar/:id', (req, res) => {
    const s = sesiones.get(req.params.id);
    if (!s) return void res.status(404).send('Sesión inexistente');
    res.send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Didit · Verificá tu identidad</title>
<style>body{font-family:system-ui,Arial;background:#101828;color:#fff;margin:0}main{max-width:460px;margin:24px auto;background:#1d2939;border-radius:12px;padding:24px}
label{display:block;margin:12px 0 4px;font-size:14px}input{width:100%;padding:10px;border-radius:6px;border:1px solid #475467;background:#0c111d;color:#fff;box-sizing:border-box}
button{margin-top:18px;width:100%;padding:12px;border:0;border-radius:6px;background:#7f56d9;color:#fff;font-size:16px;cursor:pointer}.aviso{background:#3b2f10;padding:8px;border-radius:6px;font-size:12px}</style></head><body><main>
<div class="aviso">Gemelo de pruebas de Didit: nada de lo que se hace acá es real.</div>
<h1>Verificá tu identidad</h1><p>Poné los datos tal como figuran en tu DNI.</p>
<form method="post" action="/verificar/${s.id}">
<label for="documento">Número de documento</label><input id="documento" name="documento" inputmode="numeric" autocomplete="off">
<label for="nombres">Nombres</label><input id="nombres" name="nombres" autocomplete="off">
<label for="apellidos">Apellidos</label><input id="apellidos" name="apellidos" autocomplete="off">
<label for="nacimiento">Fecha de nacimiento (AAAA-MM-DD)</label><input id="nacimiento" name="nacimiento" placeholder="1990-05-20" autocomplete="off">
<button type="submit">Verificar mi identidad</button></form></main></body></html>`);
  });

  app.post('/verificar/:id', async (req, res) => {
    const s = sesiones.get(req.params.id);
    if (!s) return void res.status(404).send('Sesión inexistente');
    const documento = String(req.body?.documento || '').replace(/\D/g, '');
    const nombres = String(req.body?.nombres || '').trim();
    const apellidos = String(req.body?.apellidos || '').trim();
    s.documento = { document_number: documento, first_name: nombres, last_name: apellidos, full_name: `${nombres} ${apellidos}`.trim(), date_of_birth: String(req.body?.nacimiento || '') };
    s.status = config.proximaDecision || (documento.endsWith('0000') ? 'Declined' : documento.endsWith('1111') ? 'In Review' : 'Approved');
    config.proximaDecision = null;

    const ts = String(Math.floor(Date.now() / 1000));
    const cuerpo = { session_id: s.id, status: s.status, vendor_data: s.vendor_data, webhook_type: 'status.updated', decision: decision(s) };
    const firma = createHmac('sha256', o.secretoDelWebhook).update(`${ts}:${s.id}:${s.status}:status.updated`).digest('hex');
    try {
      await fetch(o.urlWebhook, { method: 'POST', headers: { 'content-type': 'application/json', 'x-signature-simple': firma, 'x-timestamp': ts }, body: JSON.stringify(cuerpo) });
    } catch (e) {
      console.error('[didit-gemelo] no se pudo mandar el aviso a DOAPP:', (e as Error).message);
    }
    if (s.callback) {
      const u = new URL(s.callback);
      u.searchParams.set('verificationSessionId', s.id);
      u.searchParams.set('status', s.status);
      return void res.redirect(u.toString());
    }
    res.send('Listo. Ya podés volver a DOAPP.');
  });

  app.post('/__control/proxima-decision', (req, res) => {
    config.proximaDecision = req.body?.decision || null;
    res.json(config);
  });
  app.post('/__control/reiniciar', (_req, res) => {
    sesiones.clear();
    config.proximaDecision = null;
    res.json({ ok: true });
  });

  const servidor: Server = await new Promise((ok, mal) => {
    const s = app.listen(o.puerto, '127.0.0.1', () => ok(s));
    s.once('error', mal);
  });
  return { detener: () => new Promise<void>((ok) => servidor.close(() => ok())) };
}
