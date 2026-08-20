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

/**
 * Workflow "Free KYC" — OCR + prueba de vida + face match, USD 0,33 por sesion.
 *
 * Didit's own guidance is that workflow_id is not a secret and belongs in code
 * rather than the environment. That is right about secrecy, but it is still
 * deployment configuration: staging and production can point at different
 * workflows, the choice carries a per-verification cost (0,33 vs 0,65 with
 * AML), and a second country would want its own.
 *
 * So the correct value is committed here as the default and the env var stays
 * as an override. A missing or malformed DIDIT_WORKFLOW_ID can no longer take
 * identity verification down -- which is what happened when it held the
 * dashboard's verification link instead of the UUID. Valid ids come from
 * GET /v3/workflows/.
 */
export const DEFAULT_DIDIT_WORKFLOW_ID = 'f4e86bc9-1223-4366-af72-551d80a7c706';

/** Configured workflow, ignoring a value that plainly is not an id. */
export function getDiditWorkflowId(): string {
  const fromEnv = process.env.DIDIT_WORKFLOW_ID;
  if (!fromEnv || /^https?:\/\//i.test(fromEnv)) return DEFAULT_DIDIT_WORKFLOW_ID;
  return fromEnv;
}

export function isDiditConfigured(): boolean {
  return !diditConfigProblem();
}

/**
 * Why Didit cannot be used, or null when it can. Returning the reason (instead
 * of a bare boolean) keeps a misconfiguration diagnosable from the logs and the
 * admin side, rather than surfacing to the user as a blank "not available".
 *
 * The workflow id is checked for shape on purpose: pasting the verification
 * link from the Didit dashboard (https://verify.didit.me/u/<id>) instead of the
 * id itself passes a naive truthiness check and only fails later, when session
 * creation returns an opaque error.
 */
export function diditConfigProblem(): string | null {
  const key = process.env.DIDIT_API_KEY;
  const workflow = process.env.DIDIT_WORKFLOW_ID;

  if (!key) return 'Falta DIDIT_API_KEY';
  // Not fatal any more — getDiditWorkflowId() falls back to the committed
  // default — but still worth shouting about so the env gets corrected.
  if (workflow && /^https?:\/\//i.test(workflow)) {
    console.warn('[didit] DIDIT_WORKFLOW_ID tiene una URL en lugar del id; uso el workflow por defecto');
  }
  return null;
}

/**
 * How many Didit rejections a user may collect before the manual document
 * upload is unlocked for them. Identity is Didit-only up to that point.
 */
const KYC_ATTEMPTS_FALLBACK = 3;

/** Cached `max_retry_attempts` of the active workflow, filled at boot. */
let workflowRetryLimit: number | null = null;

/**
 * Pull the active workflow's retry limit from Didit and cache it.
 *
 * Call once at startup; it is fire-and-forget. Everything downstream reads the
 * cached value synchronously, so a failure here degrades to the fallback
 * instead of putting a network call on the /auth/me path.
 */
export async function refreshDiditWorkflowConfig(): Promise<void> {
  const apiKey = process.env.DIDIT_API_KEY;
  if (!apiKey) return;
  try {
    const resp = await fetch(`${BASE_URL}/v3/workflows/`, { headers: { 'x-api-key': apiKey } });
    if (!resp.ok) return;
    const data: any = await resp.json();
    const active = (data?.results || []).find((w: any) => w.workflow_id === getDiditWorkflowId());
    const limit = Number(active?.max_retry_attempts);
    if (Number.isFinite(limit) && limit > 0) {
      workflowRetryLimit = limit;
      console.log(`[didit] workflow ${active.workflow_label}: ${limit} reintentos permitidos`);
    }
  } catch (e: any) {
    console.warn('[didit] no pude leer la config del workflow:', e?.message);
  }
}

/**
 * How many rejections unlock the manual document upload.
 *
 * Derived from the workflow's own `max_retry_attempts` rather than hardcoded,
 * so the manual path opens exactly when Didit stops giving the user retries.
 * The two numbers happened to both be 3, which is precisely the kind of
 * coincidence that silently stops being true when someone edits the workflow.
 *
 * Precedence: explicit env override, then the workflow, then the fallback.
 */
export function getKycMaxAttempts(): number {
  const fromEnv = Number(process.env.KYC_MAX_ATTEMPTS);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return workflowRetryLimit ?? KYC_ATTEMPTS_FALLBACK;
}

/**
 * Whether this user may fall back to uploading documents by hand.
 *
 * Also true when Didit is not configured at all — otherwise a deployment
 * without KYC credentials would have no path to verify anyone.
 */
export function isManualKycUnlocked(user: { kycAttempts?: number | null }): boolean {
  if (!isDiditConfigured()) return true;
  return (user?.kycAttempts ?? 0) >= getKycMaxAttempts();
}

export interface DiditSession {
  session_id: string;
  url: string;
  status: string;
}

/** Create a verification session. vendor_data links it back to our user. */
export async function createDiditSession(vendorData: string, callbackUrl?: string): Promise<DiditSession> {
  const apiKey = process.env.DIDIT_API_KEY;
  const workflowId = getDiditWorkflowId();
  if (!apiKey) throw new Error('Didit no esta configurado (falta DIDIT_API_KEY)');

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

/** A media asset Didit holds for a session. `url` is always short-lived. */
export interface DiditMediaItem {
  key: string;
  label: string;
  url: string;
}

export interface DiditMedia {
  sessionId: string;
  status?: string;
  items: DiditMediaItem[];
  fetchedAt: string;
}

/**
 * Fetch the media Didit captured for a session (document images, portrait,
 * face-match and liveness frames) as freshly signed URLs.
 *
 * Deliberately NOT persisted anywhere. Didit's docs are explicit that these are
 * "short-lived presigned links: fetch them promptly or re-request the decision
 * to get fresh ones, and do not persist them as long-term references". So the
 * only thing we store is `user.diditSessionId`, and every admin view re-derives
 * the URLs through here. That keeps a single copy of the biometric data at the
 * processor instead of a second one on our disk.
 *
 * Field paths follow the v3 decision payload; each block is optional because a
 * workflow may not include every node.
 */
export async function getDiditMedia(sessionId: string): Promise<DiditMedia> {
  const decision: any = await getDiditDecision(sessionId);
  const items: DiditMediaItem[] = [];

  const push = (key: string, label: string, url: unknown) => {
    if (typeof url === 'string' && url) items.push({ key, label, url });
  };

  const id = decision?.id_verifications?.[0];
  if (id) {
    push('front_image', 'Documento — frente', id.front_image);
    push('back_image', 'Documento — dorso', id.back_image);
    push('full_front_image', 'Documento — frente (completo)', id.full_front_image);
    push('full_back_image', 'Documento — dorso (completo)', id.full_back_image);
    push('portrait_image', 'Foto del documento', id.portrait_image);
  }

  const face = decision?.face_matches?.[0];
  if (face) {
    push('face_source', 'Face match — origen', face.source_image);
    push('face_target', 'Face match — selfie', face.target_image);
  }

  const liveness = decision?.liveness_checks?.[0];
  if (liveness) {
    push('liveness_reference', 'Prueba de vida — referencia', liveness.reference_image);
    push('liveness_video', 'Prueba de vida — video', liveness.video_url);
  }

  return {
    sessionId,
    status: decision?.status,
    items,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Fold a fresh Didit status into the updates for a user, counting rejections.
 *
 * Counting has to be transition-based, not state-based: `/kyc/status` re-fetches
 * the decision on every call while the user is unverified, so incrementing
 * whenever the status *reads* "Declined" would add one per poll and unlock the
 * manual upload within seconds. `kyc/start` resets the status on each retry, so
 * "was not Declined → is Declined" fires exactly once per session.
 */
export function applyKycStatus(
  previousStatus: string | null | undefined,
  newStatus: string | null | undefined,
  currentAttempts: number | null | undefined,
): Record<string, any> {
  const updates: Record<string, any> = {};
  if (!newStatus) return updates;

  updates.kycStatus = newStatus;
  if (newStatus === 'Approved') {
    updates.dniVerified = true;
    updates.kycVerifiedAt = new Date();
  } else if (newStatus === 'Declined' && previousStatus !== 'Declined') {
    updates.kycAttempts = (currentAttempts ?? 0) + 1;
  }
  return updates;
}

export default {
  isDiditConfigured,
  isManualKycUnlocked,
  createDiditSession,
  getDiditDecision,
  getDiditMedia,
  verifyDiditWebhook,
  applyKycStatus,
  getKycMaxAttempts,
  refreshDiditWorkflowConfig,
};
