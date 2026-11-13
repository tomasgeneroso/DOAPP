import { Op, fn, col } from 'sequelize';
import { Job } from '../models/sql/Job.model.js';
import { Contract } from '../models/sql/Contract.model.js';
import { armarEstadisticasDeTrabajos, type ConteosDeTrabajos } from '../../shared/admin/estadisticasDeTrabajos.js';

type CuentaPorEstado = { estado: string; n: string | number };

function aMapa(filas: CuentaPorEstado[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const f of filas) m[f.estado] = Number(f.n) || 0;
  return m;
}

/**
 * Cuenta los trabajos y los contratos por situación (pedido del dueño, 2026-11-13). Solo cuenta: no devuelve ids ni montos ni datos de personas.
 */
export async function estadisticasDeTrabajos(ahora: Date = new Date()) {
  const [porEstadoDeTrabajo, porEstadoDeContrato, abiertosVencidos, pausadosPorInactividad, pausadosPorAdministracion, faltaPagar, pagados] = await Promise.all([
    Job.findAll({ attributes: [['status', 'estado'], [fn('COUNT', col('id')), 'n']], group: ['status'], raw: true }) as unknown as Promise<CuentaPorEstado[]>,
    Contract.findAll({ attributes: [['status', 'estado'], [fn('COUNT', col('id')), 'n']], group: ['status'], raw: true }) as unknown as Promise<CuentaPorEstado[]>,
    Job.count({ where: { status: 'open', startDate: { [Op.lt]: ahora } } }),
    Job.count({ where: { status: 'paused', pausedForInactivityAt: { [Op.ne]: null }, pausedByAdmin: false } as never }),
    Job.count({ where: { status: 'paused', pausedByAdmin: true } as never }),
    Contract.count({ where: { status: 'completed', paymentStatus: 'pending_payout' } as never }),
    Contract.count({ where: { status: 'completed', paymentStatus: 'completed' } as never }),
  ]);

  const t = aMapa(porEstadoDeTrabajo);
  const c = aMapa(porEstadoDeContrato);

  const conteos: ConteosDeTrabajos = {
    borrador: t.draft ?? 0,
    sinPagar: t.pending_payment ?? 0,
    esperandoAprobacion: t.pending_approval ?? 0,
    abiertos: t.open ?? 0,
    abiertosConFechaVencida: abiertosVencidos,
    pausados: t.paused ?? 0,
    pausadosPorInactividad,
    pausadosPorAdministracion,
    suspendidosSinFechaDeFin: t.suspended ?? 0,
    enCurso: t.in_progress ?? 0,
    terminados: t.completed ?? 0,
    cancelados: t.cancelled ?? 0,
    contratosPorEmpezar: (c.pending ?? 0) + (c.ready ?? 0) + (c.accepted ?? 0),
    contratosEnProceso: c.in_progress ?? 0,
    contratosEsperandoConfirmacion: c.awaiting_confirmation ?? 0,
    contratosEnDisputa: (c.disputed ?? 0) + (c.in_review ?? 0),
    contratosTerminadosFaltaPagar: faltaPagar,
    contratosTerminadosPagados: pagados,
  };

  return { generadoEl: ahora.toISOString(), ...armarEstadisticasDeTrabajos(conteos) };
}
