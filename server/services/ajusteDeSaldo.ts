import { User } from '../models/sql/User.model.js';
import { Job } from '../models/sql/Job.model.js';
import { logMoneyEvent } from '../utils/auditLog.js';
import { acreditarSaldo, debitarSaldo } from './quotePayment.js';

/**
 * Ajuste manual del saldo de un usuario, con asiento en el libro (nunca se toca `balance_ars` a secas).
 *
 * Para corregir un movimiento que se acreditó mal. El ajuste queda en el historial como `adjustment` (o `bonus`, si acredita) con
 * `origen: ajuste_manual`, el motivo y quién lo hizo. Con `publicacion` queda atado a esa publicación: la auditoría y su expediente en el panel la
 * dan por corregida, y si lo descontado era el saldo vinculado a ella (para volver a publicarla), el vínculo baja con él.
 */

const pesos = (n: number) => `$${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const r2 = (n: number) => Math.round(n * 100) / 100;

export interface PedidoDeAjuste {
  email: string;
  /** Negativo = descontar; positivo = acreditar. */
  monto: number;
  motivo: string;
  publicacion?: string;
  aplicar: boolean;
}

export interface ResultadoDelAjuste {
  aplicado: boolean;
  saldoAntes: number;
  saldoDespues: number;
  creditoAntes: number | null;
  creditoDespues: number | null;
}

export async function ajustarSaldoDeUsuario(p: PedidoDeAjuste, escribir: (t: string) => void = console.log): Promise<ResultadoDelAjuste> {
  if (!p.email || !Number.isFinite(p.monto) || p.monto === 0 || !p.motivo || p.motivo.trim().length < 8) {
    throw new Error('Faltan datos: email, monto (distinto de 0) y motivo (al menos 8 caracteres).');
  }
  const user: any = await User.findOne({ where: { email: p.email.toLowerCase() }, attributes: ['id', 'email', 'name', 'balanceArs'] });
  if (!user) throw new Error(`No existe el usuario ${p.email}`);
  const antes = Number(user.balanceArs) || 0;
  const despues = r2(antes + p.monto);

  escribir(`Usuario: ${user.name} <${user.email}>`);
  escribir(`Saldo actual: ${pesos(antes)}  →  ${p.monto > 0 ? 'se acredita' : 'se descuenta'} ${pesos(Math.abs(p.monto))}  →  quedaría ${pesos(despues)}`);
  escribir(`Motivo: ${p.motivo}`);

  // El saldo vinculado a la publicación baja con lo descontado: si no, quedaría un «crédito» que ya no existe.
  let creditoAntes: number | null = null;
  let creditoDespues: number | null = null;
  if (p.publicacion) {
    escribir(`Corrige la publicación: ${p.publicacion}`);
    if (p.monto < 0) {
      const j: any = await Job.findByPk(p.publicacion, { attributes: ['id', 'publicationCredit'] });
      const credito = Number(j?.publicationCredit) || 0;
      if (j && credito > 0) {
        creditoAntes = credito;
        creditoDespues = Math.max(0, r2(credito - Math.abs(p.monto)));
        escribir(`Saldo vinculado a la publicación: ${pesos(credito)} → ${pesos(creditoDespues)}`);
      }
    }
  }
  if (despues < 0) throw new Error('El ajuste dejaría el saldo en negativo: no se hace.');
  if (!p.aplicar) {
    escribir('\n(solo vista previa: falta --aplicar)');
    return { aplicado: false, saldoAntes: antes, saldoDespues: antes, creditoAntes, creditoDespues };
  }

  // `corrigeLaPublicacion` (y no jobId/relatedId): no es un pago de la publicación con saldo, es la corrección de un movimiento.
  const metadata = { origen: 'ajuste_manual', motivo: p.motivo, autor: 'script ajustarSaldo', ...(p.publicacion ? { corrigeLaPublicacion: p.publicacion } : {}) };
  if (p.monto < 0) await debitarSaldo(String(user.id), Math.abs(p.monto), `Ajuste manual: ${p.motivo}`, { tipo: 'adjustment', metadata });
  // sin-espera: ajuste manual decidido por el dueño; no es plata de un pago de Mercado Pago que haya que esperar
  else await acreditarSaldo(String(user.id), p.monto, `Ajuste manual: ${p.motivo}`, { tipo: 'bonus', metadata });

  if (p.publicacion && creditoDespues !== null) await Job.update({ publicationCredit: creditoDespues } as any, { where: { id: p.publicacion } });

  const final: any = await User.findByPk(user.id, { attributes: ['balanceArs'] });
  const saldoFinal = Number(final.balanceArs) || 0;
  escribir(`\nHecho. Saldo ahora: ${pesos(saldoFinal)}`);
  await logMoneyEvent({
    action: 'BALANCE_ADJUSTED_MANUALLY',
    actor: 'script:ajustarSaldo',
    description: `Ajuste manual de ${pesos(p.monto)} a ${user.email}: ${p.motivo}`,
    severity: 'high',
    userId: String(user.id),
    monto: p.monto,
    metadata: { motivo: p.motivo, publicacion: p.publicacion ?? null, saldoAntes: antes, saldoDespues: saldoFinal },
  });
  return { aplicado: true, saldoAntes: antes, saldoDespues: saldoFinal, creditoAntes, creditoDespues };
}
