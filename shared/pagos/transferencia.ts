/**
 * Los datos que declara quien pagó por transferencia al subir el comprobante («Ya pagué»).
 *
 * Los usan la pantalla (para marcar lo que falta antes de enviar) y el servidor (que vuelve a validar: nada que llegue del navegador se da por
 * bueno). Lo que se pide sirve para que quien verifica el pago pueda cruzarlo con el extracto: número de operación, quién transfirió (nombre y
 * documento), desde qué banco y cuándo.
 */

export interface DatosDeTransferencia {
  /** Número de operación / referencia / comprobante de la transferencia. */
  numero: string;
  /** Nombre completo de la persona (o razón social) que hizo la transferencia. */
  nombre: string;
  /** DNI (7-8 dígitos) o CUIL/CUIT (11 dígitos) de esa persona. */
  documento: string;
  /** Banco o billetera desde la que salió la plata. */
  banco: string;
  /** Día en que se hizo, AAAA-MM-DD. */
  fecha: string;
}

export type ErroresDeTransferencia = Partial<Record<keyof DatosDeTransferencia | 'archivo', string>>;

export const TIPOS_DE_COMPROBANTE = ['pdf', 'png', 'jpg', 'jpeg'] as const;
export const TAMANO_MAXIMO_DEL_COMPROBANTE = 5 * 1024 * 1024; // el mismo límite que aplica el servidor al recibirlo
/** Una transferencia de hace más de esto ya no se acepta como «recién hecha»: que escriban a soporte. */
export const DIAS_MAXIMOS_DE_ANTIGUEDAD = 30;

const soloDigitos = (v: string) => v.replace(/\D/g, '');

/** El documento sin puntos ni guiones, o null si no es un DNI (7-8 dígitos) ni un CUIL/CUIT (11 dígitos con prefijo válido). */
export function documentoNormalizado(v: string): string | null {
  const d = soloDigitos(v);
  if (/^\d{7,8}$/.test(d)) return d;
  if (/^(20|23|24|25|26|27|30|33|34)\d{9}$/.test(d)) return d;
  return null;
}

export function validarDatosDeTransferencia(
  datos: Partial<DatosDeTransferencia>,
  opciones: { ahora?: Date; archivo?: { nombre: string; tamano: number } | null; exigirArchivo?: boolean } = {},
): { ok: boolean; errores: ErroresDeTransferencia } {
  const ahora = opciones.ahora ?? new Date();
  const e: ErroresDeTransferencia = {};
  const numero = (datos.numero ?? '').trim();
  const nombre = (datos.nombre ?? '').trim().replace(/\s+/g, ' ');
  const banco = (datos.banco ?? '').trim();
  const fecha = (datos.fecha ?? '').trim();

  if (numero.length < 4) e.numero = 'Ingresá el número de operación de la transferencia (lo ves en el comprobante).';
  else if (numero.length > 60 || !/^[\w\-./ ]+$/.test(numero)) e.numero = 'El número de operación solo puede tener letras, números y guiones.';

  if (nombre.length < 3 || !/\p{L}/u.test(nombre)) e.nombre = 'Ingresá el nombre completo de quien hizo la transferencia.';
  else if (nombre.length > 160) e.nombre = 'El nombre es demasiado largo.';

  if (!documentoNormalizado(datos.documento ?? '')) e.documento = 'Ingresá un DNI (7 u 8 dígitos) o un CUIL/CUIT (11 dígitos) válido.';

  if (banco.length < 2) e.banco = 'Ingresá el banco o la billetera desde la que transferiste.';
  else if (banco.length > 80) e.banco = 'El nombre del banco es demasiado largo.';

  const d = /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? new Date(`${fecha}T12:00:00`) : null;
  if (!d || Number.isNaN(d.getTime())) e.fecha = 'Ingresá la fecha en que hiciste la transferencia.';
  else {
    const hoy = new Date(ahora);
    hoy.setHours(23, 59, 59, 999);
    if (d.getTime() > hoy.getTime()) e.fecha = 'La fecha no puede ser futura.';
    else if (ahora.getTime() - d.getTime() > DIAS_MAXIMOS_DE_ANTIGUEDAD * 86_400_000) e.fecha = `La transferencia tiene más de ${DIAS_MAXIMOS_DE_ANTIGUEDAD} días: escribinos a soporte.`;
  }

  if (opciones.exigirArchivo !== false) {
    const a = opciones.archivo;
    if (!a) e.archivo = 'Adjuntá el comprobante (PDF, JPG o PNG).';
    else {
      const ext = a.nombre.split('.').pop()?.toLowerCase() ?? '';
      if (!(TIPOS_DE_COMPROBANTE as readonly string[]).includes(ext)) e.archivo = 'El comprobante tiene que ser un PDF, un JPG o un PNG.';
      else if (a.tamano > TAMANO_MAXIMO_DEL_COMPROBANTE) e.archivo = 'El comprobante pesa más de 5 MB.';
      else if (a.tamano <= 0) e.archivo = 'El archivo está vacío.';
    }
  }

  return { ok: Object.keys(e).length === 0, errores: e };
}
