import { Op, fn, col, literal } from 'sequelize';
import { Contract } from '../models/sql/Contract.model.js';
import { Payment } from '../models/sql/Payment.model.js';
import { Job } from '../models/sql/Job.model.js';
import { User } from '../models/sql/User.model.js';
import currencyExchange from '../services/currencyExchange.js';

/**
 * Estado financiero real de la plataforma, medido contra el plan.
 *
 * La proyeccion de al lado responde "si pasa X, cuanto gano". Esto responde
 * "que esta pasando de verdad y cuanto me falta para cubrir los gastos", que
 * es la pregunta que importa todos los meses.
 *
 * Todo sale de la base. Ningun numero de aca es un supuesto: si un dato no se
 * puede calcular todavia -- porque no hay contratos, o no hay pagos -- se
 * devuelve en cero y se dice, en vez de rellenarlo con una estimacion que
 * despues nadie recuerda que era estimada.
 */

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

export interface LiveFinancials {
  calculadoEn: string;
  eurArs: number;

  usuarios: {
    total: number;
    nuevos30: number;
    activos30: number;
    verificados: number;
    trabajadores: number;
    clientes: number;
  };

  trabajos: {
    publicados30: number;
    abiertos: number;
    enCurso: number;
    completados30: number;
  };

  contratos: {
    creados30: number;
    completados30: number;
    cancelados30: number;
    disputados30: number;
    tasaFinalizacion: number;
    porUsuarioMes: number;
  };

  dinero: {
    brutoMovido30: number;
    comisionGanada30: number;
    ticketPromedio: number;
    comisionPromedioPct: number;
    enEscrow: number;
    pendientePagoTrabajadores: number;
  };

  objetivo: {
    costoFijoMensualArs: number;
    ingresoMensualArs: number;
    cobertura: number;
    faltaIngreso: number;
    contratosFaltantes: number;
    usuariosFaltantes: number;
    /** true = lo que falta se estimo con los supuestos del plan, no con datos reales */
    estimadoConPlan: boolean;
  };
}

export async function getLiveFinancials(plan: any): Promise<LiveFinancials> {
  const d30 = daysAgo(30);
  const d90 = daysAgo(90);

  const [
    usuariosTotal, usuariosNuevos, usuariosVerificados, trabajadores, clientes,
    contratosRecientes, contratosCreados, contratosCompletados,
    contratosCancelados, contratosDisputados,
    trabajosPublicados, trabajosAbiertos, trabajosEnCurso,
    ticketRow, comisionRow, brutoRow, escrowRow,
  ] = await Promise.all([
    User.count({ where: { isBanned: false } }),
    User.count({ where: { isBanned: false, createdAt: { [Op.gte]: d30 } } }),
    User.count({ where: { isBanned: false, isVerified: true } }).catch(() => 0),
    User.count({ where: { isBanned: false, role: { [Op.in]: ['doer', 'both'] } } }).catch(() => 0),
    User.count({ where: { isBanned: false, role: { [Op.in]: ['client', 'both'] } } }).catch(() => 0),

    Contract.findAll({
      where: { createdAt: { [Op.gte]: d30 } },
      attributes: ['clientId', 'doerId'],
      raw: true,
    }),
    Contract.count({ where: { createdAt: { [Op.gte]: d30 } } }),
    Contract.count({ where: { status: 'completed', updatedAt: { [Op.gte]: d30 } } }),
    Contract.count({ where: { status: 'cancelled', updatedAt: { [Op.gte]: d30 } } }),
    Contract.count({ where: { status: 'disputed', updatedAt: { [Op.gte]: d30 } } }),

    Job.count({ where: { createdAt: { [Op.gte]: d30 } } }),
    Job.count({ where: { status: 'open' } }),
    Job.count({ where: { status: 'in_progress' } }),

    // El ticket sale de 90 dias: con poco volumen, 30 dias es ruido.
    Contract.findOne({
      where: { status: 'completed', updatedAt: { [Op.gte]: d90 } },
      attributes: [[fn('AVG', col('price')), 'avg']],
      raw: true,
    }) as any,
    Payment.findOne({
      where: { status: 'completed', createdAt: { [Op.gte]: d90 }, amount: { [Op.gt]: 0 } },
      attributes: [[literal('AVG(platform_fee / NULLIF(amount, 0)) * 100'), 'avgPct']],
      raw: true,
    }) as any,
    Payment.findOne({
      where: { status: 'completed', createdAt: { [Op.gte]: d30 } },
      attributes: [
        [fn('SUM', col('amount')), 'bruto'],
        [fn('SUM', col('platform_fee')), 'comision'],
      ],
      raw: true,
    }) as any,
    Contract.findOne({
      where: { escrowStatus: 'held_escrow' },
      attributes: [[fn('SUM', col('price')), 'total'], [fn('COUNT', col('id')), 'n']],
      raw: true,
    }) as any,
  ]);

  // MAU: personas distintas con al menos un contrato en los ultimos 30 dias.
  const activos = new Set<string>();
  for (const c of contratosRecientes as any[]) {
    if (c.clientId) activos.add(String(c.clientId));
    if (c.doerId) activos.add(String(c.doerId));
  }
  const activos30 = activos.size;

  // Si la cotizacion no responde, se sigue con un valor de respaldo: el panel
  // tiene que abrir igual, con un numero aproximado, y no quedarse en blanco.
  const eurArs = await currencyExchange.getEURtoARSRate().catch(() => 1800);

  // El objetivo sale del plan guardado, no de una constante: si el owner
  // cambia sus costos, la meta se mueve con ellos.
  const fijosEur = Number(plan?.projection?.costs?.fijosMensuales) || 0;
  const costoFijoMensualArs = Math.round(fijosEur * eurArs);

  const comisionGanada30 = Math.round(Number(brutoRow?.comision) || 0);
  const ticketPromedio = Math.round(Number(ticketRow?.avg) || 0);
  const comisionPromedioPct = Math.round((Number(comisionRow?.avgPct) || 0) * 10) / 10;

  // Cuanto falta, expresado en las tres unidades en las que se puede actuar:
  // plata, contratos y usuarios.
  const faltaIngreso = Math.max(0, costoFijoMensualArs - comisionGanada30);

  // Durante la beta la comision real es 0, asi que no se puede deducir de los
  // datos cuanto aporta un contrato. Sin esto el panel mostraba "faltan 0
  // contratos", que se lee como objetivo cumplido cuando es exactamente lo
  // contrario. Se cae a los supuestos del plan y se avisa cual se uso.
  const pctPlan = Number(plan?.projection?.revenue?.comisionPct) || 0;
  const ticketPlanEur = Number(plan?.projection?.revenue?.ticket) || 0;
  const usandoPlan = comisionPromedioPct <= 0 || ticketPromedio <= 0;

  const pctBase = usandoPlan ? pctPlan : comisionPromedioPct;
  const ticketBase = ticketPromedio > 0 ? ticketPromedio : ticketPlanEur * eurArs;
  const comisionPorContrato = ticketBase * (pctBase / 100);

  const contratosFaltantes =
    comisionPorContrato > 0 ? Math.ceil(faltaIngreso / comisionPorContrato) : 0;

  const contratosPorUsuario =
    activos30 > 0 ? Math.round((contratosCompletados / activos30) * 100) / 100 : 0;
  const cpuPlan = Number(plan?.projection?.revenue?.contratosPorUsuario) || 0;
  const cpuBase = contratosPorUsuario > 0 ? contratosPorUsuario : cpuPlan;
  const usuariosFaltantes = cpuBase > 0 ? Math.ceil(contratosFaltantes / cpuBase) : 0;

  return {
    calculadoEn: new Date().toISOString(),
    eurArs: Math.round(eurArs * 100) / 100,

    usuarios: {
      total: usuariosTotal,
      nuevos30: usuariosNuevos,
      activos30,
      verificados: usuariosVerificados,
      trabajadores,
      clientes,
    },
    trabajos: {
      publicados30: trabajosPublicados,
      abiertos: trabajosAbiertos,
      enCurso: trabajosEnCurso,
      completados30: contratosCompletados,
    },
    contratos: {
      creados30: contratosCreados,
      completados30: contratosCompletados,
      cancelados30: contratosCancelados,
      disputados30: contratosDisputados,
      tasaFinalizacion:
        contratosCreados > 0
          ? Math.round((contratosCompletados / contratosCreados) * 1000) / 10
          : 0,
      porUsuarioMes: contratosPorUsuario,
    },
    dinero: {
      brutoMovido30: Math.round(Number(brutoRow?.bruto) || 0),
      comisionGanada30,
      ticketPromedio,
      comisionPromedioPct,
      enEscrow: Math.round(Number(escrowRow?.total) || 0),
      pendientePagoTrabajadores: Number(escrowRow?.n) || 0,
    },
    objetivo: {
      costoFijoMensualArs,
      ingresoMensualArs: comisionGanada30,
      cobertura:
        costoFijoMensualArs > 0
          ? Math.round((comisionGanada30 / costoFijoMensualArs) * 1000) / 10
          : 0,
      faltaIngreso,
      contratosFaltantes,
      usuariosFaltantes,
      estimadoConPlan: usandoPlan,
    },
  };
}
