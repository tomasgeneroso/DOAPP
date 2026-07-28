/**
 * Didit KYC / identity verification (https://didit.me).
 *
 * Pluggable: needs DIDIT_API_KEY + DIDIT_WORKFLOW_ID to create sessions and
 * DIDIT_WEBHOOK_SECRET to verify webhooks. Without them the endpoints report
 * "not configured" instead of failing hard.
 *
 * Flow: create a session (vendor_data = our userId) → redirect the user to the
 * returned `url` → Didit runs document + liveness → we get a webhook and/or
 * fetch the decision. On "Approved" we mark the user's identity as verified
 * (credibility ladder level 1).
 */
import crypto from 'crypto';

const BASE_URL = process.env.DIDIT_BASE_URL || 'https://verification.didit.me';

export function isDiditConfigured(): boolean {
  return !!(process.env.DIDIT_API_KEY && process.env.DIDIT_WORKFLOW_ID);
}

export interface DiditSession {
  session_id: string;
  url: string;
  status: string;
}

/** Create a verification session. vendor_data links it back to our user. */
export async function createDiditSession(vendorData: string, callbackUrl?: string): Promise<DiditSession> {
  const apiKey = process.env.DIDIT_API_KEY;
  const workflowId = process.env.DIDIT_WORKFLOW_ID;
  if (!apiKey || !workflowId) throw new Error('Didit no está configurado (falta DIDIT_API_KEY / DIDIT_WORKFLOW_ID)');

  const body: Record<string, string> = { workflow_id: workflowId, vendor_data: vendorData };
  if (callbackUrl) body.callback = callbackUrl;

  const resp = await fetch(`${BASE_URL}/v3/session/`, {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new Error(`Didit API ${resp.status}: ${detail}`);
  }
  const data: any = await resp.json();
  return { session_id: data.session_id, url: data.url, status: data.status };
}

/** Fetch the authoritative decision for a session. */
export async function getDiditDecision(sessionId: string): Promise<any> {
  const apiKey = process.env.DIDIT_API_KEY;
  if (!apiKey) throw new Error('Didit no está configurado');
  const resp = await fetch(`${BASE_URL}/v3/session/${sessionId}/decision/`, {
    headers: { 'x-api-key': apiKey },
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new Error(`Didit decision ${resp.status}: ${detail}`);
  }
  return resp.json();
}

/**
 * Verify a webhook using the "Simple" signature scheme (X-Signature-Simple):
 *   HMAC-SHA256(secret, `${timestamp}:${session_id}:${status}:${webhook_type}`)
 * plus a 5-minute freshness window on X-Timestamp. Constant-time compared.
 */
export function verifyDiditWebhook(
  headers: { signature?: string; timestamp?: string },
  payload: { session_id?: string; status?: string; webhook_type?: string },
): boolean {
  const secret = process.env.DIDIT_WEBHOOK_SECRET;
  if (!secret) return false;
  const { signature, timestamp } = headers;
  if (!signature || !timestamp) return false;

  // Freshness: reject timestamps older than 5 minutes.
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;

  const message = `${timestamp}:${payload.session_id}:${payload.status}:${payload.webhook_type}`;
  const expected = crypto.createHmac('sha256', secret).update(message).digest('hex');

  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export default { isDiditConfigured, createDiditSession, getDiditDecision, verifyDiditWebhook };
