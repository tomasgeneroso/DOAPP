/**
 * Investiga un movimiento de saldo o una publicación: qué es, quién lo hizo, qué pago lo respalda y qué quedó en la auditoría. Solo LEE.
 *
 * Reúne en una salida lo que antes había que buscar a mano en la base (y con los nombres de columna que tiene cada tabla).
 *
 * Uso (en el servidor, desde la carpeta de la app):
 *   npx tsx server/scripts/investigarMovimiento.ts --movimiento=<id del asiento>
 *   npx tsx server/scripts/investigarMovimiento.ts --publicacion=<id de la publicación>
 *   npx tsx server/scripts/investigarMovimiento.ts --email=alguien@correo.com        (todos los movimientos de esa cuenta)
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase } from '../config/database.js';
import { User } from '../models/sql/User.model.js';
import { Job } from '../models/sql/Job.model.js';
import { Payment } from '../models/sql/Payment.model.js';
import { AuditLog } from '../models/sql/AuditLog.model.js';
import BalanceTransaction from '../models/sql/BalanceTransaction.model.js';
import { quienConfirmoElPago } from '../services/controlesDeDinero.js';

const carpeta = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(carpeta, '../../.env') });

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const pesos = (n: unknown) => `$${(Number(n) || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const quien = async (id?: string | null) => {
  if (!id) return '(nadie anotado)';
  const u: any = await User.findByPk(id, { attributes: ['id', 'name', 'email', 'role'] });
  return u ? `${u.name} <${u.email}> [${u.role}]` : `usuario ${id} (ya no existe)`;
};

async function mostrarPublicacion(jobId: string) {
  const j: any = await Job.findByPk(jobId);
  if (!j) return console.log(`\nPublicación ${jobId}: no existe`);
  console.log(`\n== Publicación "${j.title}" (${j.id}) ==`);
  console.log(`   estado: ${j.status} · precio: ${pesos(j.price)} · dueño: ${await quien(j.clientId)}`);
  // La «marca de pagada» (publication_paid) es solo un indicador de la publicación: puede estar en «no» aunque exista un pago registrado (por ejemplo, después de
  // una cancelación o una reprogramación). Lo que importa es el pago registrado y quién lo confirmó.
  console.log(`   marca «pagada» de la publicación (publication_paid): ${j.publicationPaid ? 'sí' : 'no'} · pago registrado: ${j.publicationPaymentId || 'NINGUNO'} · crédito vinculado: ${pesos(j.publicationCredit)}`);
  console.log(`   cancelada por: ${await quien(j.cancelledById)} (rol: ${j.cancelledByRole || '-'}) el ${j.cancelledAt ? new Date(j.cancelledAt).toLocaleString('es-AR') : '-'}`);
  console.log(`   motivo: ${j.cancellationReason || '-'}`);
  console.log(`   revisada/aprobada por: ${await quien(j.reviewedBy)} el ${j.reviewedAt ? new Date(j.reviewedAt).toLocaleString('es-AR') : '-'}`);
  if (j.publicationPaymentId) {
    const p: any = await Payment.findByPk(j.publicationPaymentId);
    console.log(p ? `   pago: ${pesos(p.amount)} ${p.currency} · estado ${p.status} · medio ${p.paymentMethod} · MP: ${p.mercadopagoStatus || '-'}` : '   pago: el registro no existe');
    if (p) {
      console.log(`   pagó: ${await quien(p.payerId)}`);
      console.log(`   aprobado por: ${await quien(p.approvedBy)}${p.approvedBy && String(p.approvedBy) === String(p.payerId) ? '   ⚠ LA MISMA CUENTA QUE PAGÓ' : ''}`);
      const conf = quienConfirmoElPago(p);
      console.log(`   confirmación: ${conf ?? 'nadie'}${(conf ?? '').startsWith('por un administrador') ? ' (a mano: ninguna pasarela comprobó que el dinero entró)' : ''}`);
    }
  } else {
    console.log('   ⚠ No hay pago registrado: nunca entró plata por esta publicación (contrato libre de comisión, de prueba o cargada a mano).');
  }
  // El registro de acciones apunta a lo que se tocó: la publicación y SU PAGO (ahí queda quién lo aprobó).
  const ids = [jobId, ...(j.publicationPaymentId ? [String(j.publicationPaymentId)] : [])];
  const logs: any[] = await AuditLog.findAll({ where: { targetId: ids } as any, order: [['createdAt', 'ASC']], limit: 100 });
  console.log(`   auditoría (${logs.length}):`);
  for (const l of logs) console.log(`     ${new Date(l.createdAt).toLocaleString('es-AR')} · ${l.targetModel} · ${l.action} · ${await quien(l.performedBy)} · ${l.description}`);
}

async function mostrarMovimiento(m: any) {
  console.log(`\n== Movimiento ${m.id} ==`);
  console.log(`   ${new Date(m.createdAt).toLocaleString('es-AR')} · tipo ${m.type} · ${pesos(m.amount)} · estado ${m.status}`);
  console.log(`   saldo antes → después: ${pesos(m.balanceBefore)} → ${pesos(m.balanceAfter)}`);
  console.log(`   cuenta: ${await quien(m.userId)}`);
  console.log(`   detalle: ${m.description}`);
  const meta = m.metadata || {};
  if (meta.actor) console.log(`   lo hizo: ${meta.actor.tipo} · ${await quien(meta.actor.id)}`);
  console.log(`   origen: ${meta.origen || '-'} · pago anotado: ${meta.pagoId || 'NINGUNO'}`);
  console.log(`   metadata completa: ${JSON.stringify(meta)}`);
  if (meta.jobId) await mostrarPublicacion(String(meta.jobId));
}

async function main() {
  await initDatabase();
  const movimiento = arg('movimiento');
  const publicacion = arg('publicacion');
  const email = arg('email');
  if (movimiento) {
    const m = await BalanceTransaction.findByPk(movimiento);
    if (!m) throw new Error('No existe ese movimiento');
    await mostrarMovimiento(m);
  } else if (publicacion) {
    await mostrarPublicacion(publicacion);
    const filas: any[] = await BalanceTransaction.findAll({ where: { type: 'refund' } as any, order: [['createdAt', 'ASC']] });
    for (const m of filas.filter((f) => f.metadata?.jobId === publicacion)) await mostrarMovimiento(m);
  } else if (email) {
    const u: any = await User.findOne({ where: { email: email.toLowerCase() }, attributes: ['id', 'name', 'email', 'balanceArs'] });
    if (!u) throw new Error('No existe ese usuario');
    console.log(`Cuenta: ${u.name} <${u.email}> · saldo ${pesos(u.balanceArs)}`);
    const filas: any[] = await BalanceTransaction.findAll({ where: { userId: u.id } as any, order: [['createdAt', 'ASC']] });
    for (const m of filas) await mostrarMovimiento(m);
  } else {
    throw new Error('Usá --movimiento=<id>, --publicacion=<id> o --email=<correo>');
  }
}

main()
  .catch((e) => {
    console.error('Error:', e?.message || e);
    process.exitCode = 1;
  })
  .finally(() => setTimeout(() => process.exit(), 500));
