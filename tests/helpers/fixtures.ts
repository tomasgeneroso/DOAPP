import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { Contract } from '../../server/models/sql/Contract.model.js';

/**
 * Fixtures para los tests que hablan con la base de verdad.
 *
 * Por qué existe: siete suites fallaban enteras con "notNull Violation:
 * Job.summary cannot be null" y dos errores más del mismo tipo. Cada una
 * armaba su Job a mano con los cuatro campos que le interesaban, y cada vez
 * que el modelo suma una columna obligatoria se rompen todas a la vez. El
 * problema no era de los tests: era que la forma de un Job estaba copiada
 * siete veces.
 *
 * Acá está una sola vez, con valores que pasan las validaciones y que se
 * pueden pisar por parámetro. Si mañana el modelo pide un campo más, se agrega
 * en un lugar.
 *
 * Los identificadores llevan sufijo único porque los emails y usernames son
 * únicos en la base y las suites corren en serie sobre el mismo esquema: dos
 * tests que crean "client@test.com" se pisan, y el segundo falla por una razón
 * que no tiene nada que ver con lo que estaba probando.
 */

let n = 0;
const unico = () => `${Date.now().toString(36)}${(n++).toString(36)}`;

export async function crearUsuario(over: Partial<any> = {}): Promise<any> {
  const id = unico();
  return User.create({
    email: `u${id}@test.local`,
    username: `u${id}`,
    name: 'Usuario de prueba',
    password: 'password123',
    role: 'client',
    balanceArs: 0,
    ...over,
  } as any);
}

export async function crearTrabajo(clientId: string, over: Partial<any> = {}): Promise<any> {
  return Job.create({
    title: 'Trabajo de prueba',
    summary: 'Resumen del trabajo de prueba',
    description: 'Descripción del trabajo de prueba, lo bastante larga como para pasar las validaciones.',
    price: 1000,
    clientId,
    status: 'open',
    category: 'Reparaciones',
    tags: [],
    location: 'Almagro',
    remoteOk: false,
    // Siempre en el futuro: varias reglas (cancelación tardía, auto-selección)
    // miran la fecha de inicio, y un trabajo que empieza "ayer" hace que un
    // test mida otra cosa de la que cree medir.
    startDate: new Date(Date.now() + 7 * 86_400_000),
    endDateFlexible: false,
    allowCounterOffers: true,
    singleDelivery: true,
    urgency: 'medium',
    experienceLevel: 'intermediate',
    permanentlyCancelled: false,
    ...over,
  } as any);
}

export async function crearContrato(
  { jobId, clientId, doerId }: { jobId: string; clientId: string; doerId: string },
  over: Partial<any> = {},
): Promise<any> {
  const price = Number(over.price ?? 1000);
  return Contract.create({
    jobId,
    clientId,
    doerId,
    type: 'trabajo',
    price,
    totalPrice: price,
    status: 'in_progress',
    paymentStatus: 'escrow',
    // Los tres de términos: el modelo los exige porque un contrato sin
    // aceptación de términos no debería poder existir en producción.
    termsAccepted: true,
    termsAcceptedByClient: true,
    termsAcceptedByDoer: true,
    startDate: new Date(Date.now() + 7 * 86_400_000),
    endDate: new Date(Date.now() + 14 * 86_400_000),
    ...over,
  } as any);
}

/**
 * Una disputa ya abierta.
 *
 * `detailedDescription` es obligatoria en el modelo y los tests la escribían
 * como `description`, que Sequelize descarta en silencio: el create fallaba
 * con "cannot be null" y el test reportaba un 500 que no tenía nada que ver
 * con lo que estaba probando.
 */
export async function crearDisputa(
  { contractId, initiatedBy, against }: { contractId: string; initiatedBy: string; against: string },
  over: Partial<any> = {},
): Promise<any> {
  const { Dispute } = await import('../../server/models/sql/Dispute.model.js');
  return Dispute.create({
    contractId,
    initiatedBy,
    against,
    reason: 'Motivo de prueba',
    detailedDescription: 'Descripción detallada del reclamo de prueba.',
    category: 'quality_issues',
    // 'open' es el estado de una disputa que ya pasó por el reclamo directo.
    // Una recién creada por la ruta arranca en 'negotiation' (T&C 10.11).
    status: 'open',
    evidence: [],
    messages: [],
    logs: [],
    ...over,
  } as any);
}

/**
 * Un trabajo con su contrato y las dos partes, que es el escenario que casi
 * todos los tests necesitan como punto de partida.
 */
export async function crearEscenario(over: {
  usuario?: Partial<any>;
  trabajador?: Partial<any>;
  trabajo?: Partial<any>;
  contrato?: Partial<any>;
} = {}) {
  const cliente = await crearUsuario({ role: 'client', ...over.usuario });
  const trabajador = await crearUsuario({ role: 'doer', ...over.trabajador });
  const job = await crearTrabajo(cliente.id, over.trabajo);
  const contrato = await crearContrato(
    { jobId: job.id, clientId: cliente.id, doerId: trabajador.id },
    { price: Number(job.price), ...over.contrato },
  );
  return { cliente, trabajador, job, contrato };
}
