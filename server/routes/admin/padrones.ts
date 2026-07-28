import { Router, Response } from 'express';
import { Op } from 'sequelize';
import { protect, authorize, AuthRequest } from '../../middleware/auth.js';
import { User } from '../../models/sql/User.model.js';
import { Job } from '../../models/sql/Job.model.js';
import { Contract } from '../../models/sql/Contract.model.js';
import { Dispute } from '../../models/sql/Dispute.model.js';
import { Payment } from '../../models/sql/Payment.model.js';
import { WithdrawalRequest } from '../../models/sql/WithdrawalRequest.model.js';
import { Review } from '../../models/sql/Review.model.js';
import { Ticket } from '../../models/sql/Ticket.model.js';

/**
 * Registries ("padrones") for jobs, contracts and disputes: detailed tables +
 * CSV export, mirroring the users registry. Names are resolved via a single
 * lookup map so we don't depend on association aliases.
 */
const router = Router();
router.use(protect, authorize('admin', 'super_admin', 'owner'));

function csvCell(v: any): string {
  if (v === null || v === undefined) return '';
  let s: string;
  if (typeof v === 'boolean') s = v ? 'Sí' : 'No';
  else if (v instanceof Date) s = v.toISOString().split('T')[0];
  else s = String(v);
  if (/[",\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function nameMap(ids: (string | undefined | null)[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter(Boolean) as string[])];
  if (!unique.length) return {};
  const users = await User.findAll({ where: { id: { [Op.in]: unique } }, attributes: ['id', 'name', 'email'] });
  const m: Record<string, string> = {};
  for (const u of users) m[u.id] = `${u.name}${u.email ? ` <${u.email}>` : ''}`;
  return m;
}

function sendCsv(res: Response, filename: string, columns: Array<{ label: string }>, rows: string[][]) {
  const header = columns.map((c) => c.label).join(',');
  const lines = rows.map((r) => r.join(','));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=${filename}-${new Date().toISOString().split('T')[0]}.csv`);
  res.send('﻿' + [header, ...lines].join('\n'));
}

// ── JOBS ────────────────────────────────────────────────────────────────
const JOB_COLS = [
  { key: 'title', label: 'Título' },
  { key: 'category', label: 'Categoría' },
  { key: 'status', label: 'Estado' },
  { key: 'price', label: 'Precio ARS' },
  { key: 'maxWorkers', label: 'Cupos' },
  { key: 'client', label: 'Cliente' },
  { key: 'startDate', label: 'Inicio' },
  { key: 'createdAt', label: 'Creado' },
] as const;

async function jobRecords(search: string, status: string) {
  const where: any = {};
  if (search?.trim()) where.title = { [Op.iLike]: `%${search.trim()}%` };
  if (status) where.status = status;
  const jobs = await Job.findAll({ where, order: [['createdAt', 'DESC']], limit: 5000 });
  const names = await nameMap(jobs.map((j: any) => j.clientId));
  return jobs.map((j: any) => ({
    id: j.id, title: j.title, category: j.category, status: j.status,
    price: Number(j.price || 0), maxWorkers: j.maxWorkers || 1,
    client: names[j.clientId] || j.clientId, startDate: j.startDate, createdAt: j.createdAt,
  }));
}

router.get('/jobs', async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 25, search = '', status = '' } = req.query as any;
    const all = await jobRecords(search, status);
    const start = (Number(page) - 1) * Number(limit);
    res.json({ success: true, data: all.slice(start, start + Number(limit)),
      pagination: { total: all.length, page: Number(page), limit: Number(limit), totalPages: Math.ceil(all.length / Number(limit)) } });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});
router.get('/jobs/export.csv', async (req: AuthRequest, res: Response) => {
  try {
    const { search = '', status = '' } = req.query as any;
    const all = await jobRecords(search, status);
    sendCsv(res, 'trabajos', JOB_COLS as any, all.map((r: any) => JOB_COLS.map((c) => csvCell(r[c.key]))));
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

// ── CONTRACTS ───────────────────────────────────────────────────────────
const CONTRACT_COLS = [
  { key: 'status', label: 'Estado' },
  { key: 'price', label: 'Precio ARS' },
  { key: 'escrowStatus', label: 'Escrow' },
  { key: 'client', label: 'Cliente' },
  { key: 'doer', label: 'Doer' },
  { key: 'allocatedAmount', label: 'Asignado ARS' },
  { key: 'createdAt', label: 'Creado' },
] as const;

async function contractRecords(status: string) {
  const where: any = {};
  if (status) where.status = status;
  const contracts = await Contract.findAll({ where, order: [['createdAt', 'DESC']], limit: 5000 });
  const names = await nameMap(contracts.flatMap((c: any) => [c.clientId, c.doerId]));
  return contracts.map((c: any) => ({
    id: c.id, status: c.status, price: Number(c.price || 0), escrowStatus: c.escrowStatus,
    client: names[c.clientId] || c.clientId, doer: names[c.doerId] || c.doerId,
    allocatedAmount: Number(c.allocatedAmount || 0), createdAt: c.createdAt,
  }));
}

router.get('/contracts', async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 25, status = '' } = req.query as any;
    const all = await contractRecords(status);
    const start = (Number(page) - 1) * Number(limit);
    res.json({ success: true, data: all.slice(start, start + Number(limit)),
      pagination: { total: all.length, page: Number(page), limit: Number(limit), totalPages: Math.ceil(all.length / Number(limit)) } });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});
router.get('/contracts/export.csv', async (req: AuthRequest, res: Response) => {
  try {
    const all = await contractRecords((req.query as any).status || '');
    sendCsv(res, 'contratos', CONTRACT_COLS as any, all.map((r: any) => CONTRACT_COLS.map((c) => csvCell(r[c.key]))));
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

// ── DISPUTES ────────────────────────────────────────────────────────────
const DISPUTE_COLS = [
  { key: 'category', label: 'Categoría' },
  { key: 'status', label: 'Estado' },
  { key: 'reason', label: 'Motivo' },
  { key: 'resolution', label: 'Resolución' },
  { key: 'contractId', label: 'Contrato' },
  { key: 'createdAt', label: 'Creado' },
] as const;

async function disputeRecords(status: string) {
  const where: any = {};
  if (status) where.status = status;
  const disputes = await Dispute.findAll({ where, order: [['createdAt', 'DESC']], limit: 5000 });
  return disputes.map((d: any) => ({
    id: d.id, category: d.category, status: d.status, reason: d.reason,
    resolution: d.resolution || '', contractId: d.contractId, createdAt: d.createdAt,
  }));
}

router.get('/disputes', async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 25, status = '' } = req.query as any;
    const all = await disputeRecords(status);
    const start = (Number(page) - 1) * Number(limit);
    res.json({ success: true, data: all.slice(start, start + Number(limit)),
      pagination: { total: all.length, page: Number(page), limit: Number(limit), totalPages: Math.ceil(all.length / Number(limit)) } });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});
router.get('/disputes/export.csv', async (req: AuthRequest, res: Response) => {
  try {
    const all = await disputeRecords((req.query as any).status || '');
    sendCsv(res, 'disputas', DISPUTE_COLS as any, all.map((r: any) => DISPUTE_COLS.map((c) => csvCell(r[c.key]))));
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

// ── PAYMENTS ────────────────────────────────────────────────────────────
const PAYMENT_COLS = [
  { key: 'paymentType', label: 'Tipo de pago' },
  { key: 'status', label: 'Estado' },
  { key: 'amount', label: 'Monto' },
  { key: 'currency', label: 'Moneda' },
  { key: 'platformFee', label: 'Comisión plataforma' },
  { key: 'workerPaymentAmount', label: 'Pago al trabajador' },
  { key: 'payer', label: 'Pagador' },
  { key: 'recipient', label: 'Receptor' },
  { key: 'createdAt', label: 'Creado' },
] as const;

async function paymentRecords(status: string) {
  const where: any = {};
  if (status) where.status = status;
  const payments = await Payment.findAll({ where, order: [['createdAt', 'DESC']], limit: 5000 });
  const names = await nameMap(payments.flatMap((p: any) => [p.payerId, p.recipientId]));
  return payments.map((p: any) => ({
    id: p.id, paymentType: p.paymentType, status: p.status, amount: Number(p.amount || 0),
    currency: p.currency || 'ARS', platformFee: Number(p.platformFee || 0),
    workerPaymentAmount: Number(p.workerPaymentAmount || 0),
    payer: names[p.payerId] || p.payerId, recipient: p.recipientId ? (names[p.recipientId] || p.recipientId) : '',
    createdAt: p.createdAt,
  }));
}

router.get('/payments', async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 25, status = '' } = req.query as any;
    const all = await paymentRecords(status);
    const start = (Number(page) - 1) * Number(limit);
    res.json({ success: true, data: all.slice(start, start + Number(limit)),
      pagination: { total: all.length, page: Number(page), limit: Number(limit), totalPages: Math.ceil(all.length / Number(limit)) } });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});
router.get('/payments/export.csv', async (req: AuthRequest, res: Response) => {
  try {
    const all = await paymentRecords((req.query as any).status || '');
    sendCsv(res, 'pagos', PAYMENT_COLS as any, all.map((r: any) => PAYMENT_COLS.map((c) => csvCell(r[c.key]))));
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

// ── WITHDRAWALS ─────────────────────────────────────────────────────────
const WITHDRAWAL_COLS = [
  { key: 'status', label: 'Estado' },
  { key: 'amount', label: 'Monto ARS' },
  { key: 'alias', label: 'Alias' },
  { key: 'user', label: 'Usuario' },
  { key: 'adminNotes', label: 'Notas admin' },
  { key: 'createdAt', label: 'Creado' },
] as const;

async function withdrawalRecords(status: string) {
  const where: any = {};
  if (status) where.status = status;
  const ws = await WithdrawalRequest.findAll({ where, order: [['createdAt', 'DESC']], limit: 5000 });
  const names = await nameMap(ws.map((w: any) => w.userId));
  return ws.map((w: any) => ({
    id: w.id, status: w.status, amount: Number(w.amount || 0), alias: w.alias || '',
    user: names[w.userId] || w.userId, adminNotes: w.adminNotes || '', createdAt: w.createdAt,
  }));
}

router.get('/withdrawals', async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 25, status = '' } = req.query as any;
    const all = await withdrawalRecords(status);
    const start = (Number(page) - 1) * Number(limit);
    res.json({ success: true, data: all.slice(start, start + Number(limit)),
      pagination: { total: all.length, page: Number(page), limit: Number(limit), totalPages: Math.ceil(all.length / Number(limit)) } });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});
router.get('/withdrawals/export.csv', async (req: AuthRequest, res: Response) => {
  try {
    const all = await withdrawalRecords((req.query as any).status || '');
    sendCsv(res, 'retiros', WITHDRAWAL_COLS as any, all.map((r: any) => WITHDRAWAL_COLS.map((c) => csvCell(r[c.key]))));
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

// ── REVIEWS ─────────────────────────────────────────────────────────────
const REVIEW_COLS = [
  { key: 'rating', label: 'Rating' },
  { key: 'comment', label: 'Comentario' },
  { key: 'reviewer', label: 'Autor' },
  { key: 'reviewed', label: 'Reseñado' },
  { key: 'contractId', label: 'Contrato' },
  { key: 'createdAt', label: 'Creado' },
] as const;

async function reviewRecords() {
  const reviews = await Review.findAll({ order: [['createdAt', 'DESC']], limit: 5000 });
  const names = await nameMap(reviews.flatMap((r: any) => [r.reviewerId, r.reviewedId]));
  return reviews.map((r: any) => ({
    id: r.id, rating: Number(r.rating || 0), comment: r.comment || '',
    reviewer: names[r.reviewerId] || r.reviewerId, reviewed: names[r.reviewedId] || r.reviewedId,
    contractId: r.contractId, createdAt: r.createdAt,
  }));
}

router.get('/reviews', async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 25 } = req.query as any;
    const all = await reviewRecords();
    const start = (Number(page) - 1) * Number(limit);
    res.json({ success: true, data: all.slice(start, start + Number(limit)),
      pagination: { total: all.length, page: Number(page), limit: Number(limit), totalPages: Math.ceil(all.length / Number(limit)) } });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});
router.get('/reviews/export.csv', async (_req: AuthRequest, res: Response) => {
  try {
    const all = await reviewRecords();
    sendCsv(res, 'resenas', REVIEW_COLS as any, all.map((r: any) => REVIEW_COLS.map((c) => csvCell(r[c.key]))));
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

// ── TICKETS ─────────────────────────────────────────────────────────────
const TICKET_COLS = [
  { key: 'ticketNumber', label: 'Nº' },
  { key: 'subject', label: 'Asunto' },
  { key: 'category', label: 'Categoría' },
  { key: 'priority', label: 'Prioridad' },
  { key: 'status', label: 'Estado' },
  { key: 'creator', label: 'Creado por' },
  { key: 'createdAt', label: 'Creado' },
] as const;

async function ticketRecords(status: string) {
  const where: any = {};
  if (status) where.status = status;
  const tickets = await Ticket.findAll({ where, order: [['createdAt', 'DESC']], limit: 5000 });
  const names = await nameMap(tickets.map((t: any) => t.createdBy));
  return tickets.map((t: any) => ({
    id: t.id, ticketNumber: t.ticketNumber, subject: t.subject, category: t.category,
    priority: t.priority, status: t.status, creator: names[t.createdBy] || t.createdBy, createdAt: t.createdAt,
  }));
}

router.get('/tickets', async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 25, status = '' } = req.query as any;
    const all = await ticketRecords(status);
    const start = (Number(page) - 1) * Number(limit);
    res.json({ success: true, data: all.slice(start, start + Number(limit)),
      pagination: { total: all.length, page: Number(page), limit: Number(limit), totalPages: Math.ceil(all.length / Number(limit)) } });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});
router.get('/tickets/export.csv', async (req: AuthRequest, res: Response) => {
  try {
    const all = await ticketRecords((req.query as any).status || '');
    sendCsv(res, 'tickets', TICKET_COLS as any, all.map((r: any) => TICKET_COLS.map((c) => csvCell(r[c.key]))));
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

export default router;
