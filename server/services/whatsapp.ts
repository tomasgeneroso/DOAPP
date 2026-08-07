/**
 * WhatsApp sender for phone-verification codes (Meta WhatsApp Cloud API).
 *
 * Pluggable: if WHATSAPP_TOKEN + WHATSAPP_PHONE_ID are set in the env it sends
 * a real message; otherwise it just logs the code so the flow is testable
 * without credentials. To go live you (the account owner) create a Meta
 * Business + WhatsApp Cloud API app, then set:
 *   WHATSAPP_TOKEN=EAAG...            (permanent access token)
 *   WHATSAPP_PHONE_ID=1234567890      (phone number id)
 *   WHATSAPP_OTP_TEMPLATE=otp_code    (optional approved template name)
 * Business-initiated messages generally require an approved template; if
 * WHATSAPP_OTP_TEMPLATE is unset we fall back to a plain text message (works
 * inside a 24h customer-service window).
 */

const GRAPH_VERSION = 'v21.0';

/**
 * Template names that are present in the env but cannot actually deliver a
 * code. Treating them as "not configured" is deliberate: a half-configured
 * channel used to surface as a hard 502 on every attempt, which is worse than
 * the dev fallback because nothing upstream could tell the difference.
 *
 *  - the placeholder from this file's own example block
 *  - `hello_world`, Meta's sample template: accepts zero parameters and only
 *    exists in en_US, so sending an OTP through it always errors.
 */
const UNUSABLE_TEMPLATES = new Set(['nombre_de_tu_plantilla', 'otp_code', 'hello_world']);

export interface WhatsAppResult {
  sent: boolean;
  dev?: boolean; // true when not configured (code was logged, not sent)
}

export interface WhatsAppStatus {
  /** True when a code can plausibly be delivered. Drives the capability flag. */
  ready: boolean;
  reason?: string;
}

/**
 * Static readiness check — env only, no network call, safe to call per request.
 * It cannot know whether Meta will accept the send (the number may still be
 * unregistered), so treat it as a necessary-not-sufficient condition.
 */
export function getWhatsAppStatus(): WhatsAppStatus {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  const template = process.env.WHATSAPP_OTP_TEMPLATE;

  if (!token || !phoneId) return { ready: false, reason: 'Falta WHATSAPP_TOKEN o WHATSAPP_PHONE_ID' };
  if (!template) return { ready: false, reason: 'Falta WHATSAPP_OTP_TEMPLATE (una plantilla AUTHENTICATION aprobada)' };
  if (UNUSABLE_TEMPLATES.has(template)) {
    return { ready: false, reason: `WHATSAPP_OTP_TEMPLATE="${template}" no sirve para OTP (placeholder o plantilla de ejemplo sin parámetros)` };
  }
  return { ready: true };
}

export async function sendWhatsAppCode(phone: string, code: string): Promise<WhatsAppResult> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  const to = String(phone || '').replace(/[^0-9]/g, '');

  if (!to) throw new Error('Número de teléfono inválido');

  const status = getWhatsAppStatus();
  if (!status.ready) {
    // Log the code so the flow stays testable instead of dead-ending on a 502.
    console.warn(`[whatsapp] canal no listo (${status.reason}) — código para ${to}: ${code}`);
    return { sent: false, dev: true };
  }

  const templateName = process.env.WHATSAPP_OTP_TEMPLATE;
  const body = templateName
    ? {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: process.env.WHATSAPP_OTP_LANG || 'es' },
          components: [{ type: 'body', parameters: [{ type: 'text', text: code }] }],
        },
      }
    : {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: `Tu código de verificación de DoApp es: ${code}\nVence en 10 minutos. Si no fuiste vos, ignorá este mensaje.` },
      };

  const resp = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    // Meta buries the actionable part in error_user_msg; surface it so the log
    // says "the number is on an existing WhatsApp account" instead of "400".
    let human = detail;
    try {
      const parsed = JSON.parse(detail);
      human = parsed?.error?.error_user_msg || parsed?.error?.message || detail;
    } catch { /* not JSON — keep the raw body */ }
    throw new Error(`WhatsApp API ${resp.status}: ${human}`);
  }

  return { sent: true };
}

export default { sendWhatsAppCode };
