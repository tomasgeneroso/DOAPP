import { Op } from 'sequelize';
import { User } from '../models/sql/User.model.js';
import { BannedIdentity } from '../models/sql/BannedIdentity.model.js';
import { compararIdentidad } from '../../shared/identidad/coincidencia.js';
import { dniValido, normalizarDni } from '../../shared/identidad/documentos.js';
import { aplicarIdentidadDeDidit, controlarCoincidencia, leerDocumento } from './identidadDeDidit.js';

/**
 * Registro en pasos: 1) correo y contraseña (o Google/X), 2) verificación de identidad con Didit, 3) datos prellenados desde el documento
 * para corregir y completar lo que falta.
 *
 * La cuenta se crea en el paso 1 con datos provisorios (`registrationPending = true`) y recién se «registra» (pending = false) al
 * terminar el paso 3. Lo que lee Didit del documento llena el formulario: nombres, apellidos y DNI; la persona corrige si hay un error de
 * lectura y completa lo que falta (usuario, teléfono y, en cuentas de X, el correo).
 */

const REGLA_DE_USUARIO = /^[a-zA-Z0-9._]+$/;

/** «TOMAS ANDRES» → «Tomas Andres». */
export function aTitulo(texto: string | null | undefined): string {
  return String(texto ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(^|[\s'-])(\p{L})/gu, (_m, previo: string, letra: string) => previo + letra.toUpperCase());
}

/** Un usuario provisorio, válido y libre: «u» + 8 caracteres. */
export async function usuarioProvisorio(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const candidato = `u${Math.random().toString(36).slice(2, 10)}`.slice(0, 12);
    // eslint-disable-next-line no-await-in-loop
    if (!(await User.findOne({ where: { username: candidato }, attributes: ['id'] }))) return candidato;
  }
  return `u${Date.now().toString(36)}`;
}

/** Una sugerencia de usuario a partir del correo, válida y libre. */
export async function sugerirUsuario(email: string | null | undefined, excluirId?: string): Promise<string> {
  let base = String(email ?? '').split('@')[0].toLowerCase().replace(/[^a-z0-9._]/g, '').replace(/^[._]+|[._]+$/g, '').replace(/[._]{2,}/g, '.').slice(0, 24);
  if (base.length < 3) base = 'usuario';
  let candidato = base;
  for (let n = 1; n < 50; n++) {
    // eslint-disable-next-line no-await-in-loop
    const otro = await User.findOne({ where: { username: candidato }, attributes: ['id'] });
    if (!otro || String(otro.id) === String(excluirId)) return candidato;
    candidato = `${base}${n}`.slice(0, 30);
  }
  return `${base}${Date.now().toString(36)}`.slice(0, 30);
}

export interface DatosDelRegistro {
  pendiente: boolean;
  verificada: boolean;
  kycStatus: string | null;
  /** Lo que Didit leyó del documento (para prellenar el formulario). */
  documento: { nombres: string; apellidos: string; dni: string } | null;
  /** Sugerencias para el formulario. */
  sugerido: { nombres: string; apellidos: string; dni: string; username: string; telefono: string };
  /** Qué falta que la persona escriba (la pantalla lo marca). */
  faltan: Array<'username' | 'email' | 'dni' | 'nombre'>;
  /** La cuenta no tiene correo (viene de X): hay que pedirlo. */
  pedirCorreo: boolean;
}

export async function datosDelRegistro(user: any): Promise<DatosDelRegistro> {
  const documento = user.kycData ? leerDocumento(user.kycData) : null;
  const doc = documento && (documento.nombres || documento.apellidos || documento.dni)
    ? { nombres: aTitulo(documento.nombres), apellidos: aTitulo(documento.apellidos), dni: documento.dni != null ? String(documento.dni) : '' }
    : null;
  const usernameActual = String(user.username || '');
  const esProvisorio = /^u[a-z0-9]{6,11}$/.test(usernameActual) && !user.googleId; // los provisorios del paso 1 no son un usuario elegido
  const sugerido = {
    nombres: doc?.nombres ?? '',
    apellidos: doc?.apellidos ?? '',
    dni: doc?.dni || (user.dni ? String(user.dni) : ''),
    username: esProvisorio ? await sugerirUsuario(user.email, String(user.id)) : usernameActual,
    telefono: user.phone ? String(user.phone) : '',
  };
  const faltan: DatosDelRegistro['faltan'] = [];
  if (!sugerido.nombres || !sugerido.apellidos) faltan.push('nombre');
  if (!sugerido.dni) faltan.push('dni');
  faltan.push('username');
  if (!user.email) faltan.push('email');
  return {
    pendiente: !!user.registrationPending,
    verificada: !!user.dniVerified,
    kycStatus: user.kycStatus ?? null,
    documento: doc,
    sugerido,
    faltan,
    pedirCorreo: !user.email,
  };
}

export type ResultadoDeCompletar =
  | { ok: true; verificada: boolean; enRevision: boolean }
  | { ok: false; estado: number; code?: string; field?: string; message: string };

export interface EntradaDeCompletar {
  nombres?: unknown;
  apellidos?: unknown;
  dni?: unknown;
  username?: unknown;
  phone?: unknown;
  email?: unknown;
}

const limpiarNombre = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
const esNombre = (v: string) => v.length >= 2 && v.length <= 60 && /^[\p{L}][\p{L}\s'.-]*$/u.test(v);

/**
 * Termina el registro: valida lo que la persona corrigió/completó, lo guarda y compara contra el documento de Didit. Si el nombre o el DNI
 * ya no coinciden con el documento, la cuenta queda registrada pero SIN verificar (en revisión): corregir un error de lectura es
 * legítimo, cambiar a otra persona no.
 */
export async function completarRegistro(user: any, entrada: EntradaDeCompletar, ahora: Date = new Date()): Promise<ResultadoDeCompletar> {
  if (!user.registrationPending) return { ok: false, estado: 400, code: 'REGISTRO_YA_COMPLETO', message: 'Tu registro ya está completo.' };

  const nombres = limpiarNombre(entrada.nombres);
  const apellidos = limpiarNombre(entrada.apellidos);
  if (!esNombre(nombres)) return { ok: false, estado: 400, field: 'nombres', message: 'Escribí tu nombre (solo letras).' };
  if (!esNombre(apellidos)) return { ok: false, estado: 400, field: 'apellidos', message: 'Escribí tu apellido (solo letras).' };

  if (!dniValido(entrada.dni)) return { ok: false, estado: 400, field: 'dni', message: 'El DNI debe tener entre 7 y 9 dígitos, solo números.' };
  const dni = normalizarDni(entrada.dni);

  const username = String(entrada.username ?? '').trim().toLowerCase();
  if (username.length < 3 || username.length > 30 || !REGLA_DE_USUARIO.test(username) || /^[._]|[._]$/.test(username) || /[._]{2,}/.test(username)) {
    return { ok: false, estado: 400, field: 'username', message: 'El usuario debe tener entre 3 y 30 caracteres: letras, números, puntos y guiones bajos (sin empezar ni terminar con punto o guión, ni dos seguidos).' };
  }

  const phone = String(entrada.phone ?? '').trim();
  if (phone && !/^[+\d][\d\s()-]{5,19}$/.test(phone)) return { ok: false, estado: 400, field: 'phone', message: 'El teléfono no es válido.' };

  let email = String(user.email ?? '');
  if (!email) {
    email = String(entrada.email ?? '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, estado: 400, field: 'email', message: 'Escribí tu correo.' };
    if (await User.findOne({ where: { email }, attributes: ['id'] })) return { ok: false, estado: 400, field: 'email', message: 'Ese correo ya está registrado.' };
  }

  const usuarioOcupado = await User.findOne({ where: { username, id: { [Op.ne]: user.id } }, attributes: ['id'] });
  if (usuarioOcupado) return { ok: false, estado: 400, field: 'username', message: 'Ese nombre de usuario ya está en uso.' };

  const dniOcupado = await User.findOne({ where: { dni, id: { [Op.ne]: user.id } }, attributes: ['id'] });
  if (dniOcupado) {
    return { ok: false, estado: 400, code: 'DNI_EN_USO', field: 'dni', message: 'Este DNI ya está registrado en otra cuenta. Si es tuyo, iniciá sesión con esa cuenta; si creés que es un error, escribinos desde el Centro de ayuda.' };
  }

  try {
    const baneada = await BannedIdentity.findOne({ where: { isActive: true, [Op.or]: [{ email: email.toLowerCase().trim() }, { dni }] } });
    if (baneada) return { ok: false, estado: 403, code: 'IDENTITY_BANNED', message: 'Esta identidad está suspendida en DOAPP. Si creés que es un error, escribí a soporte.' };
  } catch (e: any) {
    console.warn('[registro] control de identidad baneada omitido:', e?.message);
  }

  const name = `${nombres} ${apellidos}`;
  await user.update({ name, username, dni, phone: phone || user.phone || null, email, registrationPending: false, termsAcceptedAt: user.termsAcceptedAt ?? ahora });

  // Contra el documento: lo corregido tiene que seguir siendo de la misma persona.
  let verificada = !!user.dniVerified;
  let enRevision = false;
  if (user.kycStatus === 'Approved' && user.kycData) {
    const sombra = { id: user.id, name, dni, dniVerified: false, diditSessionId: user.diditSessionId };
    const updates: Record<string, any> = { kycStatus: 'Approved', dniVerified: true };
    const coincide = await controlarCoincidencia(sombra, updates, user.kycData);
    if (!coincide) {
      await user.update({ kycStatus: 'In Review', dniVerified: false, kycVerifiedAt: null });
      verificada = false;
      enRevision = true;
    } else {
      // CUIL y datos legales desde el documento (el DNI ya coincide, así que no se pisa).
      try { await aplicarIdentidadDeDidit(user, user.kycData); } catch (e: any) { console.warn('[registro] no se pudo completar la identidad:', e?.message); }
    }
  }
  return { ok: true, verificada, enRevision };
}

export { compararIdentidad };
