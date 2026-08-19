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
  if (!workflow) return 'Falta DIDIT_WORKFLOW_ID';
  if (/^https?:\/\//i.test(workflow)) {
    return 'DIDIT_WORKFLOW_ID tiene una URL en lugar del id del workflow (usá sólo el identificador, no el link de verificación)';
  }
  return null;
}

/**
 * How many Didit rejections a user may collect before the manual document
 * upload is unlocked for them. Identity is Didit-only up to that point.
 */
export const KYC_MAX_ATTEMPTS = Number(process.env.KYC_MAX_ATTEMPTS) || 3;

/**
 * Whether this user may fall back to uploading documents by hand.
 *
 * Also true when Didit is not configured at all — otherwise a deployment
 * without KYC credentials would have no path to verify anyone.
 */
export function isManualKycUnlocked(user: { kycAttempts?: number | null }): boolean {
  if (!isDiditConfigured()) return true;
  return (user?.kycAttempts ?? 0) >= KYC_MAX_ATTEMPTS;
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
  KYC_MAX_ATTEMPTS,
};
