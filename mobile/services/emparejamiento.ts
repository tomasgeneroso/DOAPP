import { post, put } from './api';

/**
 * Aceptar el contrato y emparejarse con el código, desde el celular.
 *
 * Flujo del contrato: lo aprueba administración («ready») → las dos partes lo aceptan («accepted») → se paga la garantía →
 * dentro de las 24 horas antes del inicio, cada parte confirma el código de emparejamiento → empieza («in_progress»).
 * Las reglas son las del servidor; esto sólo decide qué se le ofrece a cada persona y qué se le dice.
 */

export interface ContratoParaEmparejar {
  status?: string;
  termsAcceptedByClient?: boolean;
  termsAcceptedByDoer?: boolean;
  startDate?: string;
  pairingCode?: string | null;
  clientConfirmedPairing?: boolean;
  doerConfirmedPairing?: boolean;
}

/** El código sólo se puede generar desde 24 horas antes de la fecha de inicio. */
export const HORAS_ANTES_DEL_INICIO = 24;
/**
 * El código es el personal de quien lo genera: hoy de 6 caracteres (antes de 4) y la columna admite hasta 8. No se fija
 * un largo: se escribe hasta el máximo y, con el código a la vista, se pide el largo exacto del que se muestra.
 */
export const LARGO_MINIMO_DEL_CODIGO = 4;
export const LARGO_MAXIMO_DEL_CODIGO = 8;

export function horasHastaElInicio(c: { startDate?: string } | null | undefined, ahora: number = Date.now()): number | null {
  if (!c?.startDate) return null;
  const inicio = new Date(c.startDate).getTime();
  return Number.isFinite(inicio) ? (inicio - ahora) / 3_600_000 : null;
}

export const ambasPartesAceptaron = (c: ContratoParaEmparejar | null | undefined): boolean =>
  Boolean(c?.termsAcceptedByClient && c?.termsAcceptedByDoer);

/** ¿Se le ofrece aceptar el contrato? Sólo con el contrato aprobado por administración y si esa persona todavía no lo aceptó. */
export function puedeAceptarElContrato(c: ContratoParaEmparejar | null | undefined, soyCliente: boolean, soyTrabajador: boolean): boolean {
  if (!c || String(c.status) !== 'ready') return false;
  return (soyCliente && !c.termsAcceptedByClient) || (soyTrabajador && !c.termsAcceptedByDoer);
}

/** Generar el código: contrato aceptado por las dos partes, a menos de 24 horas del inicio y sin código todavía. */
export function puedeGenerarElCodigo(c: ContratoParaEmparejar | null | undefined, ahora: number = Date.now()): boolean {
  const horas = horasHastaElInicio(c, ahora);
  return Boolean(
    c &&
      String(c.status) === 'accepted' &&
      ambasPartesAceptaron(c) &&
      horas !== null &&
      horas > 0 &&
      horas <= HORAS_ANTES_DEL_INICIO &&
      !c.pairingCode,
  );
}

/** ¿Se muestra la sección de emparejamiento? Con código: hasta que el contrato termina. Sin código: sólo en la ventana de las 24 horas. */
export function mostrarEmparejamiento(c: ContratoParaEmparejar | null | undefined, ahora: number = Date.now()): boolean {
  if (!c || !ambasPartesAceptaron(c)) return false;
  if (c.pairingCode) return ['accepted', 'in_progress'].includes(String(c.status));
  return puedeGenerarElCodigo(c, ahora);
}

/** ¿Esta persona todavía tiene que confirmar el código? Sólo mientras el contrato está «aceptado» y hay código. */
export function puedeConfirmarMiParte(c: ContratoParaEmparejar | null | undefined, soyCliente: boolean, soyTrabajador: boolean): boolean {
  if (!c || !c.pairingCode || String(c.status) !== 'accepted') return false;
  return (soyCliente && !c.clientConfirmedPairing) || (soyTrabajador && !c.doerConfirmedPairing);
}

/** El código se escribe en mayúsculas, sin espacios ni símbolos, hasta el máximo que admite el servidor. */
export function normalizarCodigo(texto: string): string {
  return String(texto ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, LARGO_MAXIMO_DEL_CODIGO);
}

/** Largo del código que se muestra en pantalla, o el máximo si todavía no se conoce. */
export const largoEsperadoDelCodigo = (mostrado: unknown): number => {
  const n = normalizarCodigo(String(mostrado ?? '')).length;
  return n >= LARGO_MINIMO_DEL_CODIGO ? n : LARGO_MAXIMO_DEL_CODIGO;
};

/** ¿Alcanza lo escrito para enviarlo? Con el código mostrado, el mismo largo; sin él, al menos el mínimo. */
export const codigoCompleto = (texto: string, mostrado?: unknown): boolean => {
  const n = normalizarCodigo(texto).length;
  if (mostrado !== undefined && normalizarCodigo(String(mostrado ?? '')).length >= LARGO_MINIMO_DEL_CODIGO) {
    return n === largoEsperadoDelCodigo(mostrado);
  }
  return n >= LARGO_MINIMO_DEL_CODIGO;
};

/** Tras un código incorrecto o vencido se ofrece iniciar el trabajo sin código (con las dos partes presentes). */
export function sugerirInicioSinCodigo(mensaje: unknown): boolean {
  return /incorrecto|expirado/i.test(String(mensaje ?? ''));
}

export interface ResultadoDeEmparejar {
  ok: boolean;
  mensaje: string;
  /** El servidor dice que el contrato ya estaba iniciado: no hay nada que confirmar, y no es un error. */
  yaIniciado?: boolean;
}

/** Traduce la respuesta de generar, confirmar o iniciar sin código. */
export function interpretarEmparejamiento(res: any, mensajePorDefecto: string): ResultadoDeEmparejar {
  if (res?.success === true) {
    return { ok: true, mensaje: String(res?.message || mensajePorDefecto), yaIniciado: res?.alreadyStarted === true };
  }
  return { ok: false, mensaje: String(res?.message || 'No se pudo completar. Probá de nuevo en un momento.') };
}

export async function aceptarElContrato(contractId: string): Promise<ResultadoDeEmparejar> {
  return interpretarEmparejamiento(await put<any>(`/contracts/${contractId}/accept`, {}), 'Aceptaste el contrato.');
}

export async function generarElCodigo(contractId: string): Promise<ResultadoDeEmparejar> {
  return interpretarEmparejamiento(await post<any>(`/contracts/${contractId}/generate-pairing`, {}), 'Código generado.');
}

export async function confirmarElCodigo(contractId: string, codigo: string): Promise<ResultadoDeEmparejar> {
  return interpretarEmparejamiento(
    await post<any>(`/contracts/${contractId}/confirm-pairing`, { code: normalizarCodigo(codigo) }),
    'Código confirmado.',
  );
}

export async function iniciarSinCodigo(contractId: string): Promise<ResultadoDeEmparejar> {
  return interpretarEmparejamiento(await post<any>(`/contracts/${contractId}/force-start-pairing`, {}), 'Registramos que estás presente.');
}
