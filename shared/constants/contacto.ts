/**
 * Las direcciones de correo de DOAPP, en un solo lugar.
 *
 * ── Por qué existe este archivo ─────────────────────────────────────────────
 *
 * Los documentos legales le decían al usuario que escribiera a
 * `privacy@doapp.com`, `dpo@doapp.com`, `disputes@doapp.com` y
 * `support@doapp.com`. El dominio de la plataforma es **doapparg.com**:
 * `doapp.com` no es de DOAPP.
 *
 * O sea que la política de privacidad —el documento que explica cómo ejercer
 * derechos sobre datos personales— mandaba esos pedidos a un dominio ajeno,
 * con el nombre de quien escribía y lo que estuviera reclamando adentro. Lo
 * mismo con las disputas y el soporte.
 *
 * No fue una decisión: fue una dirección de ejemplo copiada veinte veces que
 * nadie volvió a mirar. Por eso ahora hay una sola constante y un test
 * (`tests/legal/correosDelDominio.test.ts`) que falla si algún documento legal
 * nombra una dirección fuera del dominio.
 *
 * ── Por qué una sola dirección ──────────────────────────────────────────────
 *
 * Porque es la única casilla que existe. Tener `privacy@`, `dpo@` y
 * `disputes@` escritos en los términos sin que esas casillas existan es peor
 * que no tenerlas: el usuario escribe, le rebota, y queda con la impresión
 * —correcta— de que la plataforma publicó un canal que no atiende.
 *
 * Cuando existan de verdad, se agregan acá y los documentos las toman solas.
 */

/** El dominio de la plataforma. Todo correo publicado tiene que estar acá. */
export const DOMINIO = 'doapparg.com';

/**
 * La casilla de soporte. Hoy es la única que existe, así que es la que
 * aparece en todos lados: soporte, privacidad, disputas y datos personales.
 */
export const SOPORTE = `support@${DOMINIO}`;

/**
 * Las direcciones por propósito.
 *
 * Hoy las cuatro apuntan a la misma casilla, y está bien: lo que no puede
 * pasar es que un documento nombre una dirección que no existe. Cuando se
 * creen las casillas específicas, se cambian acá y los documentos las toman
 * sin tocarlos — que es exactamente lo que no pasó la primera vez.
 */
export const CORREOS = {
  soporte: SOPORTE,
  privacidad: SOPORTE,
  /** Responsable de protección de datos (GDPR / Ley 25.326). */
  dpo: SOPORTE,
  disputas: SOPORTE,
  facturacion: SOPORTE,
  /**
   * El remitente de los correos automáticos.
   *
   * Tiene que ser una casilla real del dominio: el SMTP es de Hostinger sobre
   * doapparg.com, y mandar desde otro dominio hace que SPF y DKIM no validen.
   * El correo entonces no rebota —sería mejor si rebotara— sino que llega a
   * spam, que es la forma más silenciosa de que un aviso de pago no se lea.
   */
  remitente: SOPORTE,
} as const;

/** Todas las direcciones publicadas, para poder verificarlas de una. */
export const CORREOS_PUBLICADOS: string[] = Array.from(new Set(Object.values(CORREOS)));

/** Si una dirección pertenece al dominio de la plataforma. */
export function esDelDominio(correo: string): boolean {
  return correo.trim().toLowerCase().endsWith(`@${DOMINIO}`);
}
