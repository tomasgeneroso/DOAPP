/**
 * Los datos de la cuenta a la que los clientes hacen transferencias: salen SOLO del entorno (BANK_CBU, BANK_ALIAS y, si están, BANK_ACCOUNT_HOLDER,
 * BANK_CUIT, BANK_NAME).
 *
 * Antes la pantalla de pago mostraba un CBU, un CUIT y un alias de EJEMPLO escritos a mano, y el servidor caía a otro CBU falso si faltaba la
 * variable: un cliente podía transferir a una cuenta que no existe. Ahora, si no hay CBU ni alias reales, la transferencia no se ofrece; y los
 * valores de ejemplo del `.env.example` (`tu.alias`, `0000…`) cuentan como «sin configurar».
 */

export interface DatosBancarios {
  cbu?: string;
  alias?: string;
  accountHolder?: string;
  cuit?: string;
  bank?: string;
}

// Los de ejemplo del .env.example y los que tenía el código escritos a mano (el CUIT 30-12345678-9, el alias DOAPP.PAGOS…): nunca se le muestran a un cliente.
const PLACEHOLDERS = new Set(['tu.alias', 'tu banco', 'tu razon social', 'tu razón social', '00-00000000-0', '30-12345678-9', 'doapp.pagos']);

const limpio = (v: string | undefined): string | undefined => {
  const t = (v ?? '').trim();
  if (!t || PLACEHOLDERS.has(t.toLowerCase())) return undefined;
  return t;
};

/** Un CBU/CVU son 22 dígitos; el de ejemplo (todo ceros) o uno mal escrito no vale. */
export const esCbuValido = (cbu: string): boolean => /^\d{22}$/.test(cbu) && !/^0{22}$/.test(cbu);

export function datosBancarios(env: Record<string, string | undefined> = process.env): DatosBancarios | null {
  const cbuCrudo = limpio(env.BANK_CBU)?.replace(/\s+/g, '');
  const cbu = cbuCrudo && esCbuValido(cbuCrudo) ? cbuCrudo : undefined;
  const alias = limpio(env.BANK_ALIAS);
  if (!cbu && !alias) return null;
  return {
    ...(cbu && { cbu }),
    ...(alias && { alias }),
    ...(limpio(env.BANK_ACCOUNT_HOLDER) && { accountHolder: limpio(env.BANK_ACCOUNT_HOLDER) }),
    ...(limpio(env.BANK_CUIT) && { cuit: limpio(env.BANK_CUIT) }),
    ...(limpio(env.BANK_NAME) && { bank: limpio(env.BANK_NAME) }),
  };
}

/** Lo que se le responde a un pedido de transferencia cuando la cuenta no está configurada. */
export const TRANSFERENCIA_NO_DISPONIBLE = {
  success: false,
  code: 'TRANSFERENCIA_NO_DISPONIBLE',
  message: 'El pago por transferencia no está disponible en este momento. Elegí otro medio de pago o intentá más tarde.',
} as const;
