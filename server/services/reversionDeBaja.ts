/**
 * Deshace una baja de presupuesto que NO correspondía: la que se hizo con alguien ya elegido (hasta el 2026-11-27 la ruta lo permitía; reporte del dueño: «este contrato
 * debería ser de 40.000»). Devuelve el precio del trabajo y de los contratos al monto original y saca de la cuenta del cliente lo que se le había acreditado, con un
 * asiento de ajuste (nunca editando el saldo). Si el cliente ya gastó esa plata, no hace nada y lo dice. Sin `aplicar` solo muestra qué haría.
 */
import { Op, QueryTypes } from 'sequelize';
import { sequelize } from '../config/database.js';
import { Job } from '../models/sql/Job.model.js';
import { Contract } from '../models/sql/Contract.model.js';
import { User } from '../models/sql/User.model.js';
import { BalanceTransaction } from '../models/sql/BalanceTransaction.model.js';
import { conSistema } from '../db/contextoRls.js';
import { logMoneyEvent } from '../utils/auditLog.js';
import { debitarSaldo } from './quotePayment.js';
import { conElTrabajoBloqueado } from './cambioDePresupuesto.js';

const r2 = (n: number) => Math.round(n * 100) / 100;
const pesos = (n: number) => `$${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const SIN_PLAZA = ['cancelled', 'rejected'];

export interface PedidoDeReversion {
  publicacion: string;
  aplicar: boolean;
  /** Revertir aunque no se encuentre a nadie elegido antes de la baja. */
  forzar?: boolean;
}

export interface ResultadoDeLaReversion {
  aplicado: boolean;
  precioAntes: number;
  precioDespues: number;
  aDescontar: number;
  pendienteAnulado: number;
  contratos: Array<{ id: string; antes: number; despues: number }>;
}

interface Baja {
  id: string;
  monto: number;
  estado: string;
  creadoEl: Date;
  anterior: number;
  nuevo: number;
  pagoId: string | null;
}

const bajasDelTrabajo = async (trabajoId: string, cliente: string): Promise<Baja[]> => {
  const filas = (await conSistema(() =>
    sequelize.query(
      `SELECT id, amount, status::text AS status, created_at AS "creadoEl", metadata FROM balance_transactions
        WHERE user_id = :cliente AND type = 'refund' AND status IN ('completed', 'pending') AND amount > 0
          AND metadata->>'reason' LIKE 'price_decrease%' AND metadata->>'relatedId' = :trabajo AND metadata->>'revertidaPor' IS NULL
        ORDER BY created_at ASC`,
      { replacements: { cliente, trabajo: trabajoId }, type: QueryTypes.SELECT },
    ),
  )) as any[];
  return filas.map((f) => ({ id: String(f.id), monto: Number(f.amount), estado: String(f.status), creadoEl: new Date(f.creadoEl), anterior: Number(f.metadata?.oldPrice), nuevo: Number(f.metadata?.newPrice), pagoId: f.metadata?.pagoId ? String(f.metadata.pagoId) : null }));
};

export async function revertirBajaDePresupuesto(p: PedidoDeReversion, escribir: (t: string) => void = console.log): Promise<ResultadoDeLaReversion> {
  const trabajo: any = await conSistema(() => Job.findByPk(p.publicacion, { paranoid: false }));
  if (!trabajo) throw new Error(`No existe la publicación ${p.publicacion}`);
  const bajas = await bajasDelTrabajo(String(trabajo.id), String(trabajo.clientId));
  if (bajas.length === 0) throw new Error('Esta publicación no tiene bajas de precio sin revertir.');

  const contratos: any[] = await conSistema(() => Contract.findAll({ where: { jobId: trabajo.id, status: { [Op.notIn]: SIN_PLAZA } } as any }));
  // Solo se deshacen las que se hicieron con alguien ya elegido (su contrato existía antes de la baja).
  const indebidas = p.forzar ? bajas : bajas.filter((b) => contratos.some((c) => new Date(c.createdAt).getTime() <= b.creadoEl.getTime()));
  if (indebidas.length === 0) throw new Error('Las bajas de esta publicación se hicieron sin nadie elegido: son correctas. (--forzar las revierte igual).');
  if (indebidas.some((b) => !(b.anterior > 0))) throw new Error('Una de las bajas no guarda el precio anterior: hay que corregirla a mano.');

  const precioAntes = Number(trabajo.price);
  const original = indebidas[0].anterior;
  const aDescontar = r2(indebidas.filter((b) => b.estado === 'completed').reduce((s, b) => s + b.monto, 0));
  const pendienteAnulado = r2(indebidas.filter((b) => b.estado === 'pending').reduce((s, b) => s + b.monto, 0));
  const bajados = new Set(indebidas.map((b) => r2(b.nuevo)));
  // Un contrato se devuelve al monto original si quedó con un precio que salió de una de estas bajas.
  const cambios = contratos
    .filter((c) => bajados.has(r2(Number(c.price))) && r2(Number(c.price)) !== original)
    .map((c) => ({ contrato: c, id: String(c.id), antes: r2(Number(c.price)), despues: original }));
  if (cambios.length > 1) throw new Error('Hay más de un contrato con el precio bajado: el reparto hay que decidirlo a mano.');

  const cliente: any = await conSistema(() => User.findByPk(trabajo.clientId, { attributes: ['id', 'balanceArs'] }));
  const saldo = Number(cliente?.balanceArs) || 0;

  escribir(`Publicación: "${trabajo.title}" (${trabajo.id}), estado ${trabajo.status}`);
  for (const b of indebidas) escribir(`  Baja del ${b.creadoEl.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}: ${pesos(b.anterior)} → ${pesos(b.nuevo)}; acreditó ${pesos(b.monto)} (${b.estado === 'completed' ? 'en el saldo' : 'a favor pendiente'})`);
  escribir(`Precio del trabajo: ${pesos(precioAntes)} → ${pesos(original)}`);
  for (const c of contratos) {
    const cambio = cambios.find((x) => x.id === String(c.id));
    escribir(`Contrato ${c.id} (${c.status}): ${pesos(Number(c.price))}${cambio ? ` → ${pesos(cambio.despues)}` : ' (queda igual)'}`);
  }
  if (aDescontar > 0) escribir(`Saldo del cliente: ${pesos(saldo)} → ${pesos(r2(saldo - aDescontar))} (asiento de ajuste por ${pesos(aDescontar)})`);
  if (pendienteAnulado > 0) escribir(`A favor pendiente que se anula: ${pesos(pendienteAnulado)}`);

  const resultado: ResultadoDeLaReversion = { aplicado: false, precioAntes, precioDespues: original, aDescontar, pendienteAnulado, contratos: cambios.map(({ id, antes, despues }) => ({ id, antes, despues })) };
  if (aDescontar > saldo + 0.005) throw new Error(`El cliente ya no tiene ese saldo (tiene ${pesos(saldo)} y hay que descontar ${pesos(aDescontar)}): lo usó o lo retiró. Hay que resolverlo a mano.`);
  if (!p.aplicar) {
    escribir('\n(solo vista previa: falta --aplicar)');
    return resultado;
  }

  await conElTrabajoBloqueado(String(trabajo.id), async (job) => {
    // Con el candado se vuelve a mirar: otra corrida pudo haberlo hecho ya.
    const quedan = new Set((await bajasDelTrabajo(String(job.id), String(job.clientId))).map((b) => b.id));
    if (indebidas.some((b) => !quedan.has(b.id))) throw new Error('Otra corrida ya revirtió estas bajas.');
    const motivo = 'Corrección: se había bajado el presupuesto con una persona ya elegida';
    if (aDescontar > 0) {
      await debitarSaldo(String(job.clientId), aDescontar, `${motivo} ("${job.title}")`, {
        tipo: 'adjustment',
        metadata: { origen: 'reversion_de_baja', corrigeLaPublicacion: String(job.id), pagoId: indebidas.find((b) => b.pagoId)?.pagoId ?? undefined, movimientos: indebidas.map((b) => b.id), autor: 'script revertirBajaDePresupuesto' },
      });
    }
    for (const b of indebidas) {
      const fila: any = await conSistema(() => BalanceTransaction.findByPk(b.id));
      await conSistema(() => fila.update({ metadata: { ...(fila.metadata || {}), revertidaPor: 'revertirBajaDePresupuesto', revertidaEl: new Date().toISOString() }, ...(b.estado === 'pending' ? { status: 'failed' } : {}) }));
    }
    await job.update({
      price: original,
      priceChangeReason: motivo,
      priceChangedAt: new Date(),
      priceHistory: [...(job.priceHistory || []), { oldPrice: precioAntes, newPrice: original, reason: motivo, changedAt: new Date() }],
    } as any);
    for (const c of cambios) {
      const comision = Number(c.contrato.commission) || 0;
      await conSistema(() =>
        c.contrato.update({
          price: c.despues,
          totalPrice: r2(c.despues + comision),
          ...(c.contrato.allocatedAmount != null ? { allocatedAmount: c.despues } : {}),
          priceModificationHistory: [...(c.contrato.priceModificationHistory || []), { previousPrice: c.antes, newPrice: c.despues, modifiedBy: String(job.clientId), modifiedAt: new Date(), reason: motivo }],
        }),
      );
    }
  });

  await logMoneyEvent({
    action: 'BUDGET_DECREASE_REVERTED',
    actor: 'script:revertirBajaDePresupuesto',
    severity: 'high',
    description: `Se deshizo una baja de presupuesto hecha con una persona ya elegida: "${trabajo.title}" vuelve de ${pesos(precioAntes)} a ${pesos(original)}.`,
    userId: String(trabajo.clientId),
    monto: r2(aDescontar + pendienteAnulado),
    moneda: 'ARS',
    metadata: { trabajoId: String(trabajo.id), movimientos: indebidas.map((b) => b.id), contratos: resultado.contratos },
  });

  const { avisarPorTodosLados } = await import('./avisarPorTodosLados.js');
  for (const userId of [String(trabajo.clientId), ...contratos.map((c) => String(c.doerId))]) {
    await avisarPorTodosLados({
      userId,
      titulo: 'Corregimos el presupuesto de un trabajo',
      mensaje: `El presupuesto de "${trabajo.title}" volvió a su monto original: ${pesos(original)}. Se había cambiado cuando ya había una persona elegida.`,
      ruta: `/jobs/${trabajo.id}`,
      categoria: 'jobs',
      relatedModel: 'Job',
      relatedId: String(trabajo.id),
    }).catch((e) => escribir(`No se pudo avisar a una de las partes: ${e?.message}`));
  }

  escribir('\nHecho.');
  return { ...resultado, aplicado: true };
}
