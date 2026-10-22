/**
 * Corrige las publicaciones que devolvieron su plata al saldo MÁS DE UNA VEZ por el mismo pago.
 *
 * Qué pasaba: una publicación cancelada sin trabajador devuelve su precio como saldo a favor. Reprogramarla la volvía a publicar con el mismo
 * pago, y si volvía a vencer sin postulantes se devolvía otra vez: un solo pago, dos (o más) devoluciones. Eso ya no ocurre (la devolución se
 * reconoce por pago y reprogramar pasa por pago), pero las devoluciones duplicadas que ya se acreditaron siguen en el saldo.
 *
 * Qué hace: por cada (publicación, pago) con más de una devolución por cancelación, deja la PRIMERA y descuenta el excedente con un asiento de
 * ajuste (queda en el libro, con `origen: correccion_doble_devolucion`). Es idempotente: no vuelve a corregir una publicación ya corregida.
 * Si el usuario ya no tiene saldo suficiente para el descuento, no toca nada y lo informa (hay que resolverlo a mano).
 *
 * Uso (en el servidor, desde la carpeta de la app):
 *   npx tsx server/scripts/corregirDobleDevolucion.ts            # solo muestra qué haría
 *   npx tsx server/scripts/corregirDobleDevolucion.ts --aplicar  # lo hace
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database.js';
import { debitarSaldo } from './quotePayment.js';

interface Devolucion {
  id: string;
  user_id: string;
  amount: string;
  created_at: string;
  job_id: string;
  pago_id: string | null;
}

const pesos = (n: number) => `$${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export interface ResultadoCorreccion {
  jobId: string;
  excedente: number;
  estado: 'corregida' | 'ya_corregida' | 'vista_previa' | 'no_se_pudo';
}

export async function corregirDobleDevolucion(aplicar: boolean, escribir: (t: string) => void = console.log): Promise<ResultadoCorreccion[]> {
  const resultados: ResultadoCorreccion[] = [];
  const filas = (await sequelize.query(
    `SELECT id, user_id, amount, created_at, metadata->>'jobId' AS job_id, metadata->>'pagoId' AS pago_id
       FROM balance_transactions
      WHERE type = 'refund' AND status = 'completed'
        AND metadata->>'origen' = 'cancelacion' AND metadata->>'jobId' IS NOT NULL
      ORDER BY created_at ASC`,
    { type: QueryTypes.SELECT },
  )) as Devolucion[];

  // Agrupadas por publicación y pago (sin pago anotado, por publicación sola)
  const grupos = new Map<string, Devolucion[]>();
  for (const f of filas) {
    const k = `${f.job_id}|${f.pago_id ?? ''}`;
    grupos.set(k, [...(grupos.get(k) ?? []), f]);
  }
  const duplicadas = [...grupos.values()].filter((g) => g.length > 1);

  if (duplicadas.length === 0) {
    escribir('No hay devoluciones duplicadas por cancelación. Nada que corregir.');
    return resultados;
  }

  escribir(`${duplicadas.length} publicación(es) con devolución duplicada:\n`);
  for (const g of duplicadas) {
    const [primera, ...resto] = g;
    const excedente = Math.round(resto.reduce((s, r) => s + Number(r.amount), 0) * 100) / 100;

    const [info] = (await sequelize.query(
      `SELECT j.title, u.email, u.balance_ars FROM jobs j JOIN users u ON u.id = j.client_id WHERE j.id = :jobId`,
      { replacements: { jobId: primera.job_id }, type: QueryTypes.SELECT },
    )) as Array<{ title: string; email: string; balance_ars: string }>;

    const [yaCorregida] = (await sequelize.query(
      `SELECT id FROM balance_transactions WHERE metadata->>'origen' = 'correccion_doble_devolucion' AND metadata->>'jobId' = :jobId AND metadata->>'pagoId' IS NOT DISTINCT FROM :pagoId LIMIT 1`,
      { replacements: { jobId: primera.job_id, pagoId: primera.pago_id }, type: QueryTypes.SELECT },
    )) as Array<{ id: string }>;

    escribir(`- "${info?.title}" de ${info?.email}`);
    escribir(`  devoluciones: ${g.map((r) => `${pesos(Number(r.amount))} (${new Date(r.created_at).toLocaleString('es-AR')})`).join(' + ')}`);
    escribir(`  se conserva la primera; excedente a descontar: ${pesos(excedente)}; saldo actual: ${pesos(Number(info?.balance_ars) || 0)}`);

    if (yaCorregida) {
      escribir('  YA CORREGIDA antes: se omite.\n');
      resultados.push({ jobId: primera.job_id, excedente, estado: 'ya_corregida' });
      continue;
    }
    if (!aplicar) {
      escribir('  (solo vista previa: falta --aplicar)\n');
      resultados.push({ jobId: primera.job_id, excedente, estado: 'vista_previa' });
      continue;
    }
    try {
      await debitarSaldo(primera.user_id, excedente, `Corrección: devolución duplicada de la publicación "${info?.title}"`, {
        relatedModel: 'Job',
        relatedId: primera.job_id,
        tipo: 'adjustment',
        metadata: {
          origen: 'correccion_doble_devolucion',
          jobId: primera.job_id,
          pagoId: primera.pago_id,
          devolucionesDuplicadas: resto.map((r) => r.id),
          conservada: primera.id,
        },
      });
      escribir(`  CORREGIDA: se descontaron ${pesos(excedente)}.\n`);
      resultados.push({ jobId: primera.job_id, excedente, estado: 'corregida' });
    } catch (e: any) {
      escribir(`  NO SE PUDO descontar (${e?.message}). Resolverlo a mano.\n`);
      resultados.push({ jobId: primera.job_id, excedente, estado: 'no_se_pudo' });
    }
  }
  return resultados;
}

export interface ResultadoRetiroSinSaldo {
  retiroId: string;
  userId: string;
  monto: number;
  saldo: number;
  estado: 'cancelado' | 'vista_previa' | 'solo_aviso';
}

/**
 * Retiros pedidos que ya no tienen con qué pagarse: el saldo se gastó mientras el retiro esperaba y, al aprobarlo, el descuento fallaría.
 * Un retiro PENDIENTE se cancela (no movió plata) y se le avisa a la persona; uno ya aprobado o en proceso solo se informa, porque lo está
 * gestionando un administrador. (Desde ahora, usar saldo con un retiro pendiente avisa antes y cancela ese retiro en el momento; esto es para
 * los que quedaron así antes del cambio.)
 */
export async function revisarRetirosSinSaldo(aplicar: boolean, escribir: (t: string) => void = console.log): Promise<ResultadoRetiroSinSaldo[]> {
  const { WithdrawalRequest } = await import('../models/sql/WithdrawalRequest.model.js');
  const { User } = await import('../models/sql/User.model.js');
  const { Notification } = await import('../models/sql/Notification.model.js');
  const { Op } = await import('sequelize');
  const resultados: ResultadoRetiroSinSaldo[] = [];

  const abiertos: any[] = await WithdrawalRequest.findAll({ where: { status: { [Op.in]: ['pending', 'approved', 'processing'] } } as any, order: [['createdAt', 'ASC']] });
  const porUsuario = new Map<string, any[]>();
  for (const w of abiertos) porUsuario.set(String(w.userId), [...(porUsuario.get(String(w.userId)) ?? []), w]);

  for (const [userId, retiros] of porUsuario) {
    const u: any = await User.findByPk(userId, { attributes: ['id', 'email', 'balanceArs'] });
    let saldo = Number(u?.balanceArs) || 0;
    for (const w of retiros) {
      const monto = Number(w.metadata?.saldoDebitado) > 0 ? Number(w.metadata.saldoDebitado) : Number(w.amount) || 0;
      if (saldo + 0.005 >= monto) {
        saldo = Math.round((saldo - monto) * 100) / 100; // alcanza: queda reservado
        continue;
      }
      escribir(`- Retiro ${w.id} de ${u?.email}: pide ${pesos(monto)} y el saldo es ${pesos(saldo)} (${w.status})`);
      if (w.status !== 'pending') {
        escribir('  Ya está aprobado/en proceso: lo gestiona un administrador. Solo aviso.\n');
        resultados.push({ retiroId: String(w.id), userId, monto, saldo, estado: 'solo_aviso' });
        continue;
      }
      if (!aplicar) {
        escribir('  (solo vista previa: falta --aplicar para cancelarlo)\n');
        resultados.push({ retiroId: String(w.id), userId, monto, saldo, estado: 'vista_previa' });
        continue;
      }
      w.status = 'cancelled';
      w.metadata = { ...(w.metadata || {}), canceladoPor: 'sistema', motivo: 'sin_saldo' };
      if (typeof w.changed === 'function') w.changed('metadata', true);
      await w.save();
      await Notification.create({
        recipientId: userId,
        type: 'warning',
        category: 'payment',
        title: 'Cancelamos tu solicitud de retiro',
        message: `Tu pedido de retiro por ${pesos(monto)} se canceló porque ese saldo se usó en otra cosa mientras esperaba. Si querés retirar lo que te queda, pedilo de nuevo desde Retiros.`,
        relatedModel: 'WithdrawalRequest',
        relatedId: String(w.id),
        read: false,
      } as any).catch(() => {});
      escribir('  CANCELADO y avisado.\n');
      resultados.push({ retiroId: String(w.id), userId, monto, saldo, estado: 'cancelado' });
    }
  }
  if (resultados.length === 0) escribir('No hay retiros pedidos sin saldo para pagarlos.');
  return resultados;
}
