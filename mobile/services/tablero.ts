import { get } from './api';
import { leerLista } from './respuesta';

/**
 * Detalle del tablero por contrato: ingresos (contratos completados en los que sos el trabajador), gastos (completados en
 * los que sos el cliente) y contratos activos (pendiente, aceptado o en curso). Es el mismo cálculo que las pantallas de la
 * web; todo sale de `GET /contracts`, que ya devuelve solo los contratos de la persona.
 */

export type TipoDeDetalle = 'ingresos' | 'gastos' | 'activos';
export const TIPOS_DE_DETALLE: TipoDeDetalle[] = ['ingresos', 'gastos', 'activos'];
export const esTipoDeDetalle = (t: unknown): t is TipoDeDetalle => TIPOS_DE_DETALLE.includes(t as TipoDeDetalle);

export interface ContratoDelTablero {
  id?: string;
  _id?: string;
  status: string;
  price: number | string;
  startDate?: string;
  endDate?: string;
  completedAt?: string;
  createdAt?: string;
  job?: { title?: string };
  client?: { id?: string; name?: string };
  doer?: { id?: string; name?: string };
  clientId?: string;
  doerId?: string;
}

const ESTADOS_ACTIVOS = ['pending', 'accepted', 'in_progress'];

const idDe = (u: { id?: string } | undefined, plano?: string): string => String(u?.id ?? plano ?? '');
export const soyElCliente = (c: ContratoDelTablero, userId: unknown): boolean => !!userId && idDe(c.client, c.clientId) === String(userId);
export const soyElTrabajador = (c: ContratoDelTablero, userId: unknown): boolean => !!userId && idDe(c.doer, c.doerId) === String(userId);
const precioDe = (c: ContratoDelTablero): number => {
  const n = Number(c.price);
  return Number.isFinite(n) ? n : 0;
};

export interface ResumenDelDetalle {
  contratos: ContratoDelTablero[];
  cantidad: number;
  total: number;
  promedio: number;
  /** Solo en «activos»: cuántos hay en cada estado. */
  porEstado?: Record<string, number>;
}

export function resumirDetalle(tipo: TipoDeDetalle, contratos: ContratoDelTablero[] | null | undefined, userId: unknown): ResumenDelDetalle {
  const todos = Array.isArray(contratos) ? contratos : [];
  let lista: ContratoDelTablero[];
  if (tipo === 'ingresos') lista = todos.filter((c) => soyElTrabajador(c, userId) && c.status === 'completed');
  else if (tipo === 'gastos') lista = todos.filter((c) => soyElCliente(c, userId) && c.status === 'completed');
  else lista = todos.filter((c) => (soyElCliente(c, userId) || soyElTrabajador(c, userId)) && ESTADOS_ACTIVOS.includes(c.status));

  const total = lista.reduce((s, c) => s + precioDe(c), 0);
  const resumen: ResumenDelDetalle = {
    contratos: lista,
    cantidad: lista.length,
    total,
    promedio: lista.length ? total / lista.length : 0,
  };
  if (tipo === 'activos') {
    resumen.porEstado = { pending: 0, accepted: 0, in_progress: 0 };
    for (const c of lista) resumen.porEstado[c.status] = (resumen.porEstado[c.status] || 0) + 1;
  }
  return resumen;
}

export const TITULOS: Record<TipoDeDetalle, string> = {
  ingresos: 'Ingresos',
  gastos: 'Gastos',
  activos: 'Contratos activos',
};

export const AYUDAS: Record<TipoDeDetalle, string> = {
  ingresos: 'Contratos completados en los que fuiste el trabajador.',
  gastos: 'Contratos completados en los que fuiste el cliente.',
  activos: 'Contratos pendientes, aceptados o en curso.',
};

export const ETIQUETAS_DE_ESTADO: Record<string, string> = { pending: 'Pendiente', accepted: 'Aceptado', in_progress: 'En curso', completed: 'Completado' };

export const traerContratos = async (): Promise<ContratoDelTablero[] | null> => leerLista<ContratoDelTablero>(await get<any>('/contracts'), 'contracts') ?? null;
