import { Op, type WhereOptions } from 'sequelize';
import { Payment, RESOLVED_PAYMENT_STATUSES } from '../models/sql/Payment.model.js';
import { respaldadosPorLaPublicacion } from './pagosAlTrabajador.js';
import { WithdrawalRequest } from '../models/sql/WithdrawalRequest.model.js';
import { Job } from '../models/sql/Job.model.js';
import { Contract } from '../models/sql/Contract.model.js';
import { ContractCancellationRequest } from '../models/sql/ContractCancellationRequest.model.js';
import { Dispute } from '../models/sql/Dispute.model.js';
import { Ticket } from '../models/sql/Ticket.model.js';
import { User } from '../models/sql/User.model.js';
import { listarConflictosDeDni } from './identidadAReviser.js';
import { isBetaPhase } from './platformPhase.js';
import { POLITICAS } from '../../shared/constants/policies.js';
import { horasDesde, ordenarTareas, textoDeEspera, urgenciaDe, type CategoriaDePendiente, type TareaPendiente } from '../../shared/admin/pendientes.js';

/**
 * Lo que el administrador tiene que hacer, de todas las fuentes, ya clasificado y ordenado (ver `shared/admin/pendientes.ts`).
 *
 * Cada fuente se lee por separado y una que falla NO tira abajo el resto ni queda en silencio: se devuelve en `fallos` y la pantalla lo muestra. Un
 * panel que, cuando no pudo leer los retiros, dice «todo al día» es peor que no tener panel.
 */

/** Qué roles de administración ven cada categoría (los demás roles de administración no tienen tareas en esta lista). */
export const QUIEN_VE: Record<CategoriaDePendiente, readonly string[]> = {
  dinero: ['owner', 'super_admin', 'admin'],
  publicaciones: ['owner', 'super_admin', 'admin', 'support'],
  contratos: ['owner', 'super_admin', 'admin'],
  usuarios: ['owner', 'super_admin', 'admin', 'support'],
  soporte: ['owner', 'super_admin', 'admin', 'support'],
};

interface Lectura {
  cantidad: number;
  /** Desde cuándo espera la más vieja. */
  masViejaDesde: Date | null;
  /** Alguna de las pendientes la marcó como urgente quien la abrió. */
  prioridadAlta?: boolean;
}

interface Fuente {
  clave: string;
  categoria: CategoriaDePendiente;
  titulo: string;
  unidad: { uno: string; varios: string };
  ruta: string;
  /** Si solo algunos roles de la categoría pueden resolverla (no se le muestra a quien no puede hacer nada con ella). */
  soloPara?: readonly string[];
  leer: () => Promise<Lectura>;
}

const fechaDe = (fila: unknown, campo: string): Date | null => {
  const v = (fila as Record<string, unknown> | null)?.[campo];
  return v ? new Date(v as string | Date) : null;
};

/** Cuántas hay y cuándo se creó (o tocó por última vez) la más vieja. */
async function contar(modelo: any, where: WhereOptions, campoDeFecha = 'createdAt'): Promise<Lectura> {
  const [cantidad, masVieja] = await Promise.all([
    modelo.count({ where }),
    modelo.findOne({ where, order: [[campoDeFecha, 'ASC']], attributes: [campoDeFecha], raw: true }),
  ]);
  return { cantidad, masViejaDesde: fechaDe(masVieja, campoDeFecha) };
}

const HORAS_SIN_CERRAR_UN_TRABAJO = 48;

function fuentes(ahora: Date): Fuente[] {
  return [
    {
      clave: 'contracargos',
      categoria: 'dinero',
      titulo: 'Contracargos abiertos (vencen: hay que presentar el descargo)',
      unidad: { uno: 'contracargo', varios: 'contracargos' },
      ruta: '/admin/chargebacks',
      leer: async () => ({ cantidad: await Payment.count({ where: { status: 'disputed' } }), masViejaDesde: null }),
    },
    {
      clave: 'retencionesPorFraude',
      categoria: 'dinero',
      titulo: 'Contratos retenidos por sospecha de fraude',
      unidad: { uno: 'contrato', varios: 'contratos' },
      ruta: '/admin/contracts',
      leer: async () => ({
        cantidad: await Contract.count({ where: { fraudHoldAt: { [Op.ne]: null }, fraudHoldClearedAt: { [Op.is]: null } } as any }),
        masViejaDesde: null,
      }),
    },
    {
      clave: 'lugaresDelLanzamiento',
      categoria: 'dinero',
      titulo: 'Se completaron los lugares del beneficio de lanzamiento: decidí cuándo se empieza a cobrar la comisión (fase de la plataforma)',
      unidad: { uno: 'aviso', varios: 'avisos' },
      ruta: '/admin/platform',
      soloPara: ['owner'], // la fase la cambia solo el dueño (`routes/admin/platform.ts`)
      // Regla del dueño (2026-11-06): se cobra comisión desde que se llega al tope de cuentas. El cambio de fase NO se hace solo: lo hace una persona desde el panel
      // (con su contraseña de acción y su registro de auditoría). Este aviso existe para que no pase inadvertido. Solo aparece mientras siga la beta: con la fase
      // estable ya se cobra y no hay nada que decidir.
      leer: async () => {
        if (!(await isBetaPhase())) return { cantidad: 0, masViejaDesde: null };
        const entregados = await User.count({ where: { launchBenefitGrantedAt: { [Op.ne]: null }, mergedIntoId: { [Op.is]: null } } as any });
        if (entregados < POLITICAS.PRIMEROS_USUARIOS_CON_CONTRATOS_LIBRES) return { cantidad: 0, masViejaDesde: null };
        const ultimo = (await User.findOne({ where: { launchBenefitGrantedAt: { [Op.ne]: null } } as any, order: [['launchBenefitGrantedAt', 'DESC']], attributes: ['launchBenefitGrantedAt'], raw: true })) as { launchBenefitGrantedAt?: Date | null } | null;
        return { cantidad: 1, masViejaDesde: ultimo?.launchBenefitGrantedAt ? new Date(ultimo.launchBenefitGrantedAt) : null };
      },
    },
    {
      clave: 'retiros',
      categoria: 'dinero',
      titulo: 'Retiros por procesar',
      unidad: { uno: 'retiro', varios: 'retiros' },
      ruta: '/admin/withdrawals',
      leer: () => contar(WithdrawalRequest, { status: { [Op.in]: ['pending', 'approved', 'processing'] } }),
    },
    {
      clave: 'pagosPorVerificar',
      categoria: 'dinero',
      titulo: 'Pagos de clientes por verificar',
      unidad: { uno: 'pago', varios: 'pagos' },
      ruta: '/admin/financial-transactions',
      // La misma regla que la pestaña «Pendiente verificación» y el contador del panel financiero: si no, el número y la lista dirían cosas distintas.
      leer: () => contar(Payment, { status: { [Op.notIn]: RESOLVED_PAYMENT_STATUSES } }),
    },
    {
      clave: 'pagosAlTrabajador',
      categoria: 'dinero',
      titulo: 'Pagos a trabajadores por transferir',
      unidad: { uno: 'pago', varios: 'pagos' },
      ruta: '/admin/pending-payments',
      // Los pagos con un pago propio «confirmado para pagar» MÁS los contratos terminados que respalda el pago de la publicación (services/pagosAlTrabajador.ts):
      // el mismo criterio que la lista de «Pagos a trabajadores», o el número y la lista dirían cosas distintas.
      leer: async () => {
        const propios = await contar(Payment, { status: 'confirmed_for_payout' }, 'updatedAt');
        const porPublicacion = await respaldadosPorLaPublicacion();
        return { cantidad: propios.cantidad + porPublicacion.length, masViejaDesde: propios.masViejaDesde };
      },
    },
    {
      clave: 'publicaciones',
      categoria: 'publicaciones',
      titulo: 'Publicaciones por aprobar',
      unidad: { uno: 'publicación', varios: 'publicaciones' },
      ruta: '/admin/jobs',
      // `updatedAt`: el momento en que entró a revisión (se pagó), no el de cuando se creó el borrador.
      leer: () => contar(Job, { status: 'pending_approval' }, 'updatedAt'),
    },
    {
      clave: 'trabajosVencidos',
      categoria: 'publicaciones',
      titulo: 'Trabajos «en curso» cuya fecha de fin ya pasó y no se cerraron',
      unidad: { uno: 'trabajo', varios: 'trabajos' },
      ruta: '/admin/jobs',
      // Un trabajo se cierra solo a las 24 h de su fecha de fin (confirmación automática); si a las 48 h sigue en curso, algo lo frenó: un contrato que nunca
      // empezó, un pedido sin resolver o un trabajador sin confirmar. Alguien tiene que mirarlo.
      leer: () =>
        contar(
          Job,
          { status: 'in_progress', endDate: { [Op.ne]: null, [Op.lt]: new Date(ahora.getTime() - HORAS_SIN_CERRAR_UN_TRABAJO * 3_600_000) } } as any,
          'endDate',
        ),
    },
    {
      clave: 'cancelaciones',
      categoria: 'contratos',
      titulo: 'Cancelaciones de contrato por resolver (decidís el dinero)',
      unidad: { uno: 'pedido', varios: 'pedidos' },
      ruta: '/admin/contracts',
      leer: async () => {
        const base = await contar(ContractCancellationRequest, { status: 'pending' });
        const altas = await ContractCancellationRequest.count({ where: { status: 'pending', priority: { [Op.in]: ['high', 'urgent'] } } as any });
        return { ...base, prioridadAlta: altas > 0 };
      },
    },
    {
      clave: 'disputas',
      categoria: 'contratos',
      titulo: 'Disputas por resolver (hay plata retenida)',
      unidad: { uno: 'disputa', varios: 'disputas' },
      ruta: '/admin/disputes',
      leer: async () => {
        const donde = { status: { [Op.in]: ['open', 'in_review', 'awaiting_info'] } };
        const base = await contar(Dispute, donde);
        const altas = await Dispute.count({ where: { ...donde, priority: { [Op.in]: ['high', 'urgent'] } } as any });
        return { ...base, prioridadAlta: altas > 0 };
      },
    },
    {
      clave: 'identidadAReviser',
      categoria: 'usuarios',
      titulo: 'Identidades para revisar (documento repetido o posible cuenta duplicada)',
      unidad: { uno: 'caso', varios: 'casos' },
      ruta: '/admin/identidades',
      leer: async () => {
        const lista = await listarConflictosDeDni();
        const pendientes = lista.filter((c) => c.estado === 'pendiente');
        const fechas = pendientes.map((c) => new Date(c.detectadoEl).getTime()).filter((t) => !Number.isNaN(t));
        return { cantidad: pendientes.length, masViejaDesde: fechas.length ? new Date(Math.min(...fechas)) : null };
      },
    },
    {
      clave: 'verificaciones',
      categoria: 'usuarios',
      titulo: 'Verificaciones de identidad en revisión',
      unidad: { uno: 'verificación', varios: 'verificaciones' },
      ruta: '/admin/users',
      leer: () => contar(User, { kycStatus: 'In Review' }, 'updatedAt'),
    },
    {
      clave: 'tickets',
      categoria: 'soporte',
      titulo: 'Tickets de soporte sin atender',
      unidad: { uno: 'ticket', varios: 'tickets' },
      ruta: '/admin/tickets',
      leer: async () => {
        const base = await contar(Ticket, { status: 'open' });
        const altos = await Ticket.count({ where: { status: 'open', priority: { [Op.in]: ['high', 'urgent'] } } as any });
        return { ...base, prioridadAlta: altos > 0 };
      },
    },
  ];
}

export interface PendientesDelAdmin {
  tareas: TareaPendiente[];
  /** Las fuentes que no se pudieron leer (lo que falta en `tareas` por este motivo, no porque no haya trabajo). */
  fallos: string[];
  generadoEl: string;
}

/** Los pendientes que le corresponden a este rol de administración, de lo más urgente a lo menos. */
export async function pendientesDelAdmin(adminRole: string, ahora: Date = new Date()): Promise<PendientesDelAdmin> {
  const visibles = fuentes(ahora).filter((f) => QUIEN_VE[f.categoria].includes(adminRole) && (!f.soloPara || f.soloPara.includes(adminRole)));
  const fallos: string[] = [];

  const lecturas = await Promise.all(
    visibles.map(async (f) => {
      try {
        return { f, lectura: await f.leer() };
      } catch (e) {
        console.error(`[pendientes del admin] no se pudo leer «${f.clave}»:`, (e as Error).message);
        fallos.push(f.titulo);
        return null;
      }
    }),
  );

  const tareas: TareaPendiente[] = [];
  for (const l of lecturas) {
    if (!l || l.lectura.cantidad <= 0) continue;
    const { f, lectura } = l;
    const espera = horasDesde(lectura.masViejaDesde, ahora);
    const hace = textoDeEspera(espera);
    tareas.push({
      clave: f.clave,
      categoria: f.categoria,
      titulo: f.titulo,
      detalle: `${lectura.cantidad} ${lectura.cantidad === 1 ? f.unidad.uno : f.unidad.varios}${hace ? ` · la más vieja espera ${hace}` : ''}`,
      cantidad: lectura.cantidad,
      esperaHoras: espera === null ? null : Math.round(espera * 10) / 10,
      urgencia: urgenciaDe(f.clave, espera, lectura.prioridadAlta === true),
      ruta: f.ruta,
    });
  }

  return { tareas: ordenarTareas(tareas), fallos, generadoEl: ahora.toISOString() };
}
