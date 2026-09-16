import { POLITICAS } from '../../shared/constants/policies.js';

/**
 * Que parte de un trabajo ve cada uno.
 *
 * GET /api/jobs y GET /api/jobs/:id son publicos y devolvian el objeto entero:
 * la calle y el numero de la casa, y el telefono y el email del cliente, a
 * cualquiera que navegara. Es la peor combinacion posible para una plataforma
 * donde un desconocido va a entrar a una casa.
 *
 * La regla, en dos partes:
 *
 *   Contacto (telefono, email)   no se muestra NUNCA entre usuarios. Para
 *                                hablar esta el chat, que ademas filtra que no
 *                                se arregle por afuera.
 *
 *   Direccion exacta             la ve el dueño siempre; el trabajador
 *                                contratado, desde DIRECCION_VISIBLE_HORAS_ANTES
 *                                del inicio o si ya empezo; un admin siempre.
 *                                Todos los demas ven barrio, CP y zona.
 *
 * Las funciones mutan y devuelven el mismo objeto plano (el toJSON de
 * Sequelize) para poder encadenarlas donde ya se arma la respuesta.
 */

const CAMPOS_DIRECCION = ['addressStreet', 'addressNumber', 'addressDetails'] as const;
const CAMPOS_CONTACTO = ['phone', 'email', 'dni', 'address'] as const;

interface UsuarioMinimo {
  id: string;
  adminRole?: string | null;
}

interface TrabajoPlano {
  clientId?: string;
  doerId?: string | null;
  selectedWorkers?: string[] | null;
  startDate?: string | Date | null;
  status?: string;
  client?: Record<string, unknown> | null;
  doer?: Record<string, unknown> | null;
  selectedWorkersData?: Array<Record<string, unknown>> | null;
  [k: string]: unknown;
}

export function esTrabajadorContratado(job: TrabajoPlano, userId: string): boolean {
  if (job.doerId && String(job.doerId) === String(userId)) return true;
  return Array.isArray(job.selectedWorkers) && job.selectedWorkers.map(String).includes(String(userId));
}

/** Si el trabajo ya empezo o falta menos que la ventana. */
export function estaPorEmpezar(job: TrabajoPlano, ahora = new Date()): boolean {
  if (job.status === 'in_progress') return true;
  if (!job.startDate) return false;
  const faltanHoras = (new Date(job.startDate).getTime() - ahora.getTime()) / 3_600_000;
  return faltanHoras <= POLITICAS.DIRECCION_VISIBLE_HORAS_ANTES;
}

export function puedeVerDireccion(job: TrabajoPlano, user?: UsuarioMinimo | null, ahora = new Date()): boolean {
  if (!user) return false;
  if (user.adminRole) return true;
  if (job.clientId && String(job.clientId) === String(user.id)) return true;
  return esTrabajadorContratado(job, user.id) && estaPorEmpezar(job, ahora);
}

export function ocultarDireccion<T extends TrabajoPlano>(job: T): T {
  for (const c of CAMPOS_DIRECCION) delete (job as any)[c];
  return job;
}

function sinContacto(u: Record<string, unknown> | null | undefined) {
  if (!u) return u;
  for (const c of CAMPOS_CONTACTO) delete u[c];
  return u;
}

export function ocultarContacto<T extends TrabajoPlano>(job: T): T {
  sinContacto(job.client);
  sinContacto(job.doer);
  if (Array.isArray(job.selectedWorkersData)) job.selectedWorkersData.forEach(sinContacto);
  return job;
}

/**
 * Lo que se devuelve a quien pide: sin contacto siempre; sin direccion salvo
 * que tenga derecho. Para listados, donde nadie necesita la direccion exacta,
 * pasar `user` undefined y listo.
 */
export function paraQuienMira<T extends TrabajoPlano>(job: T, user?: UsuarioMinimo | null, ahora = new Date()): T {
  ocultarContacto(job);
  if (!puedeVerDireccion(job, user, ahora)) ocultarDireccion(job);
  return job;
}
