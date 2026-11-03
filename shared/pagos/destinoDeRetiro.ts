import { LEMON } from '../constants/bancos.js';

/**
 * A dónde se le transfiere un retiro: una cuenta de banco o billetera (CBU/CVU de 22 dígitos, con alias opcional) o Lemon, que se cobra con el
 * $lemontag, con el alias o con el CVU (alcanza con UNO de los tres). Una sola definición para el servidor (valida el pedido), la web y la app
 * (arman el formulario y muestran el destino), así los tres hablan de lo mismo.
 */
export interface DestinoDeRetiro {
  accountHolder: string;
  bankName: string;
  accountType?: 'savings' | 'checking';
  /** CBU de banco o CVU de billetera: 22 dígitos. */
  cbu?: string;
  alias?: string;
  /** Solo Lemon: el $lemontag, siempre con el «$» adelante y en minúsculas. */
  lemonTag?: string;
}

/** $lemontag: el «$» y de 3 a 30 letras, números, punto, guion o guion bajo. */
const LEMON_TAG = /^\$[a-z0-9._-]{3,30}$/;
/** Alias de CBU/CVU: de 6 a 20 caracteres entre letras, números, punto y guion. */
const ALIAS = /^[a-z0-9.-]{6,20}$/i;
const CBU = /^\d{22}$/;

export const esLemon = (bankName: unknown): boolean => String(bankName ?? '').trim().toLowerCase() === LEMON.toLowerCase();

/** Lo que escribió la persona, listo para guardar: sin espacios, en minúsculas y con el «$» adelante aunque no lo haya puesto. */
export function normalizarLemonTag(valor: unknown): string {
  const limpio = String(valor ?? '').trim().toLowerCase();
  if (!limpio) return '';
  return limpio.startsWith('$') ? limpio : `$${limpio}`;
}

export type ResultadoDeValidar = { ok: true; destino: DestinoDeRetiro } | { ok: false; message: string };

const texto = (v: unknown): v is string => typeof v === 'string';

/** Comprueba el destino que llegó (del formulario o del perfil) y lo devuelve normalizado. Nunca confía en el tipo de lo que recibe. */
export function validarDestino(entrada: unknown): ResultadoDeValidar {
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) return { ok: false, message: 'Información bancaria incompleta' };
  const e = entrada as Record<string, unknown>;

  for (const campo of ['accountHolder', 'bankName', 'cbu', 'alias', 'lemonTag', 'accountType'] as const) {
    if (e[campo] !== undefined && e[campo] !== null && e[campo] !== '' && !texto(e[campo])) {
      return { ok: false, message: campo === 'cbu' ? 'El CBU debe tener exactamente 22 dígitos' : 'Información bancaria incompleta' };
    }
  }
  const accountHolder = texto(e.accountHolder) ? e.accountHolder.trim() : '';
  const bankName = texto(e.bankName) ? e.bankName.trim() : '';
  if (!accountHolder || !bankName) return { ok: false, message: 'Información bancaria incompleta' };
  if (accountHolder.length > 120 || bankName.length > 80) return { ok: false, message: 'Información bancaria incompleta' };

  const cbuCrudo = texto(e.cbu) ? e.cbu : '';
  const aliasCrudo = texto(e.alias) ? e.alias.trim() : '';
  const tagCrudo = texto(e.lemonTag) ? normalizarLemonTag(e.lemonTag) : '';
  const accountType = e.accountType === 'checking' ? 'checking' : 'savings';

  if (cbuCrudo && !CBU.test(cbuCrudo)) return { ok: false, message: 'El CBU debe tener exactamente 22 dígitos' };
  if (aliasCrudo && !ALIAS.test(aliasCrudo)) return { ok: false, message: 'El alias tiene que tener entre 6 y 20 caracteres: letras, números, punto o guion.' };

  if (esLemon(bankName)) {
    if (tagCrudo && !LEMON_TAG.test(tagCrudo)) return { ok: false, message: 'El $lemontag tiene que empezar con $ y tener entre 3 y 30 letras, números, punto, guion o guion bajo.' };
    if (!cbuCrudo && !aliasCrudo && !tagCrudo) return { ok: false, message: 'Para cobrar en Lemon cargá tu $lemontag, tu alias o tu CVU.' };
    return {
      ok: true,
      destino: {
        accountHolder,
        bankName: LEMON,
        accountType,
        ...(cbuCrudo ? { cbu: cbuCrudo } : {}),
        ...(aliasCrudo ? { alias: aliasCrudo } : {}),
        ...(tagCrudo ? { lemonTag: tagCrudo } : {}),
      },
    };
  }

  if (!cbuCrudo) return { ok: false, message: 'Información bancaria incompleta' };
  return { ok: true, destino: { accountHolder, bankName, accountType, cbu: cbuCrudo, ...(aliasCrudo ? { alias: aliasCrudo } : {}) } };
}

/**
 * Lo que identifica A DÓNDE VA la plata: para un banco es el CBU (corregir el titular o el alias no cambia la cuenta); para Lemon son los tres
 * identificadores, porque cualquiera de ellos puede ser el que se usa para transferir. Si la huella cambia, cambió el destino.
 */
export function huellaDelDestino(d: Partial<Pick<DestinoDeRetiro, 'bankName' | 'cbu' | 'alias' | 'lemonTag'>>): string {
  if (esLemon(d.bankName)) return `lemon|${normalizarLemonTag(d.lemonTag)}|${String(d.alias ?? '').trim().toLowerCase()}|${d.cbu ?? ''}`;
  return `cuenta|${d.cbu ?? ''}`;
}

/**
 * El destino que tiene guardado el perfil (lo que se guardó en `users.banking_info`; el CBU está cifrado y `descifrar` lo abre). Devuelve null si no
 * hay una cuenta usable. Un perfil viejo sin titular o sin banco usa el nombre de la persona y «Otro», así no pierde la cuenta que ya cargó.
 */
export function leerDestinoDelPerfil(
  guardado: unknown,
  descifrar: (cifrado: string) => string | null,
  nombreDeLaPersona = '',
): DestinoDeRetiro | null {
  if (!guardado || typeof guardado !== 'object') return null;
  const g = guardado as Record<string, unknown>;
  let cbu: string | undefined;
  if (texto(g.cbu) && g.cbu) {
    const abierto = CBU.test(g.cbu) ? g.cbu : descifrar(g.cbu);
    if (abierto && CBU.test(abierto)) cbu = abierto;
  }
  const bankName = texto(g.bankName) && g.bankName.trim() ? g.bankName.trim() : 'Otro';
  const r = validarDestino({
    accountHolder: (texto(g.accountHolder) && g.accountHolder.trim()) || nombreDeLaPersona,
    bankName,
    accountType: g.accountType,
    cbu,
    alias: texto(g.alias) ? g.alias : undefined,
    lemonTag: texto(g.lemonTag) ? g.lemonTag : undefined,
  });
  return r.ok ? r.destino : null;
}

/** Los últimos cuatro dígitos: alcanzan para reconocer la cuenta sin dejar el número entero a la vista. */
export const enmascararCbu = (cbu: unknown): string => {
  const limpio = String(cbu ?? '').replace(/\D/g, '');
  return limpio.length >= 4 ? `****${limpio.slice(-4)}` : '';
};

/** El destino en una frase corta para mostrarle a la persona (sin el número completo). */
export function etiquetaDelDestino(d: Partial<DestinoDeRetiro>): string {
  if (esLemon(d.bankName)) {
    const dato = d.lemonTag || d.alias || (d.cbu ? `CVU ${enmascararCbu(d.cbu)}` : '');
    return dato ? `Lemon · ${dato}` : 'Lemon';
  }
  const partes = [d.bankName || 'Cuenta', d.cbu ? `CBU ${enmascararCbu(d.cbu)}` : '', d.alias ? `alias ${d.alias}` : ''].filter(Boolean);
  return partes.join(' · ');
}
