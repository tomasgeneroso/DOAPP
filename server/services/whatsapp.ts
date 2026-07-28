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

const GRAPH_VERSION = 'v18.0';

export interface WhatsAppResult {
  sent: boolean;
  dev?: boolean; // true when not configured (code was logged, not sent)
}

export async function sendWhatsAppCode(phone: string, code: string): Promise<WhatsAppResult> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  const to = String(phone || '').replace(/[^0-9]/g, '');

  if (!to) throw new Error('Número de teléfono inválido');

  if (!token || !phoneId) {
    // Not configured — log the code so verification can still be tested.
    console.log(`[whatsapp] (no configurado) código para ${to}: ${code}`);
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
    throw new Error(`WhatsApp API ${resp.status}: ${detail}`);
  }

  return { sent: true };
}

export default { sendWhatsAppCode };
