import { Op, fn, col, literal } from 'sequelize';
import { Advertisement } from '../models/sql/Advertisement.model.js';
import { Job } from '../models/sql/Job.model.js';
import { User } from '../models/sql/User.model.js';
import { DIAS_PROMOCIONADOS_PARA_USAR_IMPRESIONES, PERFILES_POR_DIA, precioDelDiaEur, type PrecioDelDia, type SenalesDePrecio } from '../../shared/pricing/promocionDePerfil.js';

/**
 * Las señales con las que se calcula el precio de un día de promoción (ver `shared/pricing/promocionDePerfil.ts`). Salen de datos propios de DOAPP y se guardan 10 minutos
 * en memoria: el precio no cambia con cada pantalla que se abre, y la consulta de usuarios activos no hace falta repetirla por cada día del calendario.
 */
const VIGENCIA_MS = 10 * 60 * 1000;
let general: { en: number; valor: { usuariosActivos30d: number; usuariosConApp30d: number; impresionesPorDia: number | null } } | null = null;
const porRubro = new Map<string, { en: number; n: number }>();

const hace30Dias = () => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

async function senalesGenerales() {
  if (general && Date.now() - general.en < VIGENCIA_MS) return general.valor;
  const desde = hace30Dias();
  const activos = await User.count({ where: { lastLogin: { [Op.gte]: desde }, isBanned: false } as any });
  // «Con la app»: tiene al menos un aviso push registrado (la app del celular lo registra al ingresar).
  const conApp = await User.count({ where: { lastLogin: { [Op.gte]: desde }, isBanned: false, [Op.and]: [literal('COALESCE(array_length("fcm_tokens", 1), 0) > 0')] } as any });
  // Impresiones reales de los días ya promocionados en los últimos 30 días.
  const dias = await Advertisement.findAll({
    where: { adType: 'profile', paymentStatus: 'paid', startDate: { [Op.gte]: desde, [Op.lte]: new Date() } } as any,
    attributes: ['impressions'],
    raw: true,
  });
  const impresionesPorDia = dias.length >= DIAS_PROMOCIONADOS_PARA_USAR_IMPRESIONES ? dias.reduce((s: number, d: any) => s + (Number(d.impressions) || 0), 0) / dias.length : null;
  const valor = { usuariosActivos30d: activos, usuariosConApp30d: conApp, impresionesPorDia };
  general = { en: Date.now(), valor };
  return valor;
}

async function trabajosDeLosRubros(rubros: string[]): Promise<number> {
  const clave = [...rubros].sort().join(',');
  const guardado = porRubro.get(clave);
  if (guardado && Date.now() - guardado.en < VIGENCIA_MS) return guardado.n;
  const where: any = { createdAt: { [Op.gte]: hace30Dias() }, status: { [Op.in]: ['open', 'in_progress', 'completed', 'pending_approval'] } };
  if (rubros.length > 0) where.category = { [Op.in]: rubros };
  const n = await Job.count({ where });
  porRubro.set(clave, { en: Date.now(), n });
  return n;
}

/** Cuántos perfiles ya promocionados (pagos) hay en cada día, indexado por «AAAA-MM-DD». */
export async function reservasPorDia(desde: Date, hasta: Date, excluirUsuarioId?: string): Promise<Map<string, number>> {
  const filas: any[] = await Advertisement.findAll({
    where: { adType: 'profile', paymentStatus: 'paid', status: { [Op.in]: ['active', 'paused'] }, startDate: { [Op.gte]: desde, [Op.lte]: hasta }, ...(excluirUsuarioId ? { advertiserId: { [Op.ne]: excluirUsuarioId } } : {}) } as any,
    attributes: ['startDate', [fn('COUNT', col('id')), 'n']],
    group: ['startDate'],
    raw: true,
  });
  const m = new Map<string, number>();
  for (const f of filas) m.set(new Date(f.startDate).toISOString().slice(0, 10), Number(f.n) || 0);
  return m;
}

export interface PerfilParaPrecio {
  rating: number;
  reviews: number;
  rubros: string[];
}

/** El precio (en euros, sin IVA) de cada uno de esos días para ese perfil. */
export async function preciosPorDia(perfil: PerfilParaPrecio, dias: Date[], excluirUsuarioId?: string): Promise<Array<PrecioDelDia & { fecha: string; reservasDelDia: number; agotado: boolean }>> {
  if (dias.length === 0) return [];
  const [g, trabajos] = await Promise.all([senalesGenerales(), trabajosDeLosRubros(perfil.rubros)]);
  const ordenados = [...dias].sort((a, b) => a.getTime() - b.getTime());
  const reservas = await reservasPorDia(new Date(ordenados[0].getTime() - 24 * 3600 * 1000), new Date(ordenados[ordenados.length - 1].getTime() + 24 * 3600 * 1000), excluirUsuarioId);
  return dias.map((d) => {
    const fecha = d.toISOString().slice(0, 10);
    const reservasDelDia = reservas.get(fecha) ?? 0;
    const senales: SenalesDePrecio = { ...g, trabajosDelRubro30d: trabajos, reservasDelDia, rating: perfil.rating, reviews: perfil.reviews };
    return { ...precioDelDiaEur(senales), fecha, reservasDelDia, agotado: reservasDelDia >= PERFILES_POR_DIA };
  });
}

/** Para las pruebas: olvida lo guardado. */
export function olvidarSenalesDePrecio(): void {
  general = null;
  porRubro.clear();
}
