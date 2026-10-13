import { del, put, upload, API_URL } from './api';

/**
 * Profesión y matrícula profesional, desde el celular.
 *
 * Lo mismo que la web (Configuración → Profesión y matrícula): la profesión, y para las reguladas el número de matrícula,
 * la categoría, el número de certificado y hasta DOS archivos (frente y reverso). Los archivos se guardan encriptados en el
 * servidor (Términos 4.6); DOAPP no verifica la matrícula. Lo que se guarda y quién la ve lo decide el servidor: acá se
 * arma el pedido, se valida lo evidente y se cuenta lo que responde.
 */

export const PROFESIONES: Array<{ valor: string; etiqueta: string }> = [
  { valor: '', etiqueta: 'Sin especificar' },
  { valor: 'gasista', etiqueta: 'Gasista matriculado' },
  { valor: 'electricista', etiqueta: 'Electricista matriculado' },
  { valor: 'plomero', etiqueta: 'Plomero' },
  { valor: 'maestro_mayor_obras', etiqueta: 'Maestro Mayor de Obras' },
  { valor: 'instalador_aire', etiqueta: 'Instalador de aire acondicionado / Termomecánica' },
  { valor: 'pintor', etiqueta: 'Pintor' },
  { valor: 'carpintero', etiqueta: 'Carpintero' },
  { valor: 'jardinero', etiqueta: 'Jardinero' },
  { valor: 'limpieza', etiqueta: 'Limpieza' },
  { valor: 'mecanico', etiqueta: 'Mecánico' },
  { valor: 'otro', etiqueta: 'Otro' },
];

/** Las que piden matrícula (las mismas que la web). */
export const PROFESIONES_REGULADAS = ['gasista', 'electricista', 'plomero', 'maestro_mayor_obras', 'instalador_aire'];

export const esRegulada = (profesion: unknown): boolean => PROFESIONES_REGULADAS.includes(String(profesion ?? ''));

export const etiquetaDeLaProfesion = (profesion: unknown): string =>
  PROFESIONES.find((p) => p.valor === String(profesion ?? ''))?.etiqueta || String(profesion ?? '') || 'Sin especificar';

export const LARGO_MAXIMO_DE_LA_MATRICULA = 40;
export const LARGO_MAXIMO_DE_LOS_DEMAS_DATOS = 100;

export interface DatosProfesionales {
  profession: string;
  licenseNumber: string;
  licenseCategory: string;
  licenseCertNumber: string;
}

export type ResultadoDeValidar = { ok: true; cuerpo: Record<string, string | null> } | { ok: false; error: string };

/**
 * Arma lo que se manda. Para una profesión regulada hacen falta los tres datos; para las demás se manda solo la profesión y
 * NO se tocan los datos de matrícula que ya hubiera (cambiar de profesión no borra una matrícula cargada).
 */
export function validarDatosProfesionales(d: DatosProfesionales): ResultadoDeValidar {
  const profesion = String(d.profession ?? '').trim();
  if (!esRegulada(profesion)) return { ok: true, cuerpo: { profession: profesion || null } };

  const numero = String(d.licenseNumber ?? '').trim();
  const categoria = String(d.licenseCategory ?? '').trim();
  const certificado = String(d.licenseCertNumber ?? '').trim();
  if (!numero) return { ok: false, error: 'Escribí el número de matrícula.' };
  if (!categoria) return { ok: false, error: 'Escribí la categoría.' };
  if (!certificado) return { ok: false, error: 'Escribí el número de certificado.' };
  if (numero.length > LARGO_MAXIMO_DE_LA_MATRICULA) return { ok: false, error: `El número de matrícula admite hasta ${LARGO_MAXIMO_DE_LA_MATRICULA} caracteres.` };
  if (categoria.length > LARGO_MAXIMO_DE_LOS_DEMAS_DATOS || certificado.length > LARGO_MAXIMO_DE_LOS_DEMAS_DATOS) {
    return { ok: false, error: `La categoría y el certificado admiten hasta ${LARGO_MAXIMO_DE_LOS_DEMAS_DATOS} caracteres.` };
  }
  return { ok: true, cuerpo: { profession: profesion, licenseNumber: numero, licenseCategory: categoria, licenseCertNumber: certificado } };
}

export type EstadoDeLaMatricula =
  | { tipo: 'rechazada'; texto: string; motivo?: string }
  | { tipo: 'declarada'; texto: string }
  | { tipo: 'sin_archivos'; texto: string }
  | { tipo: 'cargada'; texto: string };

/**
 * Cómo se le cuenta su estado. «Declarada» y no «verificada»: DOAPP no verifica matrículas contra ningún registro oficial,
 * decir lo contrario sería afirmar algo que no es cierto (Términos 4.4 y 4.6).
 */
export function estadoDeLaMatricula(u: {
  licenseVerified?: boolean;
  licenseVerificationStatus?: string;
  licenseRejectedReason?: string;
  licenseDocumentUrl?: string | null;
  licenseNumber?: string | null;
} | null | undefined): EstadoDeLaMatricula {
  if (!u) return { tipo: 'sin_archivos', texto: 'Todavía no cargaste tu matrícula.' };
  if (u.licenseVerificationStatus === 'rejected') {
    return {
      tipo: 'rechazada',
      texto: 'Matrícula rechazada. Actualizá tus datos y archivos y guardá para volver a pedir la revisión.',
      motivo: u.licenseRejectedReason || undefined,
    };
  }
  if (u.licenseVerified || u.licenseVerificationStatus === 'approved') {
    return { tipo: 'declarada', texto: 'Matrícula declarada. DOAPP no la verifica contra los registros oficiales.' };
  }
  if (!u.licenseDocumentUrl) return { tipo: 'sin_archivos', texto: 'Cargá la foto del frente de tu matrícula.' };
  return { tipo: 'cargada', texto: 'Matrícula cargada. Quedó registrada en tu perfil como declarada.' };
}

export type LadoDelArchivo = 'front' | 'back';

/**
 * Los archivos viven encriptados en el servidor y se piden por una ruta que decide quién los ve. La dirección completa se
 * arma solo si tiene exactamente esa forma: lo que venga raro no se abre.
 */
export function direccionDelArchivo(ruta: unknown, apiUrl: string = API_URL): string | null {
  const r = String(ruta ?? '');
  if (!/^\/api\/users\/[0-9a-f-]{36}\/license-document\/(front|back)$/i.test(r)) return null;
  const base = String(apiUrl || '').replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(base)) return null;
  return `${base}${r.replace(/^\/api/, '')}`;
}

export interface RespuestaDeArchivos {
  ok: boolean;
  mensaje: string;
  frente: string | null;
  dorso: string | null;
}

/** Traduce la respuesta de subir o quitar un archivo: qué direcciones quedan y qué decirle a la persona. */
export function interpretarArchivos(res: any, mensajePorDefecto: string): RespuestaDeArchivos {
  if (res?.success === true) {
    return {
      ok: true,
      mensaje: String(res?.message || mensajePorDefecto),
      frente: typeof res?.licenseDocumentUrl === 'string' ? res.licenseDocumentUrl : null,
      dorso: typeof res?.licenseDocumentBackUrl === 'string' ? res.licenseDocumentBackUrl : null,
    };
  }
  return { ok: false, mensaje: String(res?.message || 'No se pudo completar. Probá de nuevo.'), frente: null, dorso: null };
}

const TIPOS: Record<string, string> = { png: 'image/png', webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg' };

/** Nombre y tipo para el formulario de una imagen elegida (la extensión manda; lo desconocido va como JPEG). */
export function datosDelArchivo(uri: string, lado: LadoDelArchivo): { name: string; type: string } {
  const nombre = String(uri || '').split('?')[0].split('/').pop() || `matricula-${lado}.jpg`;
  const ext = (nombre.split('.').pop() || 'jpg').toLowerCase();
  const type = TIPOS[ext] || 'image/jpeg';
  return { name: nombre.includes('.') ? nombre : `${nombre}.jpg`, type };
}

export async function guardarDatosProfesionales(cuerpo: Record<string, string | null>): Promise<{ ok: boolean; mensaje: string }> {
  const res: any = await put<any>('/auth/settings', cuerpo);
  return res?.success === true
    ? { ok: true, mensaje: 'Guardado.' }
    : { ok: false, mensaje: String(res?.message || 'No se pudo guardar. Probá de nuevo.') };
}

export async function subirArchivoDeMatricula(lado: LadoDelArchivo, uri: string): Promise<RespuestaDeArchivos> {
  const { name, type } = datosDelArchivo(uri, lado);
  const fd = new FormData();
  fd.append(lado === 'front' ? 'licenseDocument' : 'licenseDocumentBack', { uri, name, type } as any);
  return interpretarArchivos(await upload<any>('/auth/license-document', fd), 'Archivo subido.');
}

export async function quitarArchivoDeMatricula(lado: LadoDelArchivo): Promise<RespuestaDeArchivos> {
  return interpretarArchivos(await del<any>(`/auth/license-document/${lado}`), 'Archivo quitado.');
}
