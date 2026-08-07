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

// ── MATRÍCULAS (profesionales) ──────────────────────────────────────────
// A user counts as professional the same way User.getCredibilityInfo() decides
// it, so this registry and the credibility ladder can never disagree.
const LICENSE_COLS = [
  { key: 'name', label: 'Profesional' },
  { key: 'email', label: 'Email' },
  { key: 'profession', label: 'Profesión' },
  { key: 'licenseNumber', label: 'Nº matrícula' },
  { key: 'licenseCategory', label: 'Categoría' },
  { key: 'licenseCertNumber', label: 'Nº certificado' },
  { key: 'licenseStatus', label: 'Estado matrícula' },
  { key: 'hasLicenseDoc', label: 'Documento' },
  { key: 'licenseRejectedReason', label: 'Motivo rechazo' },
  { key: 'licenseVerifiedByName', label: 'Verificada por' },
  { key: 'licenseVerifiedAt', label: 'Fecha verificación' },
  { key: 'insuranceStatus', label: 'Estado seguro' },
  { key: 'insuranceExpiresAt', label: 'Vence seguro' },
  { key: 'dniVerified', label: 'Identidad' },
  { key: 'createdAt', label: 'Registrado' },
] as const;

/**
 * A professional with no document at all still belongs in the registry — that
 * is precisely the row an admin is looking for. So "missing" is a value here,
 * never a reason to filter the person out. `missing` names what is absent so
 * the label reads the same way in each registry ("falta seguro" vs "falta
 * matrícula") instead of a generic "sin documento".
 */
function verificationLabel(verified: boolean, status: string | null, hasDoc: boolean, missing = 'documento'): string {
  if (verified) return 'aprobada';
  if (status === 'rejected') return 'rechazada';
  if (hasDoc) return 'pendiente';
  return `falta ${missing}`;
}

/**
 * Who belongs in the professional registries. Shared by matrículas and seguros
 * so the two can never show different populations — a professional missing a
 * document must still appear, with the gap shown as a value in the row.
 *
 * Deliberately a superset of User.getCredibilityInfo()'s `isProfessional`
 * (profession | licenseNumber | licenseDocumentUrl): it also catches anyone
 * holding an insurance document. A registry that is narrower than the rule
 * driving the users' pending tasks would hide exactly the people being chased;
 * being wider only costs an extra row.
 */
const PROFESSIONAL_SCOPE = [
  { profession: { [Op.ne]: null } },
  { licenseNumber: { [Op.ne]: null } },
  { licenseDocumentUrl: { [Op.ne]: null } },
  { insuranceDocumentUrl: { [Op.ne]: null } },
];

async function licenseRecords(search: string, status: string) {
  const where: any = { [Op.or]: PROFESSIONAL_SCOPE };
  if (search?.trim()) {
    where[Op.and] = [{
      [Op.or]: [
        { name: { [Op.iLike]: `%${search.trim()}%` } },
        { email: { [Op.iLike]: `%${search.trim()}%` } },
        { licenseNumber: { [Op.iLike]: `%${search.trim()}%` } },
      ],
    }];
  }

  const users = await User.findAll({ where, order: [['createdAt', 'DESC']], limit: 5000 });
  const verifiers = await nameMap(users.map((u: any) => u.licenseVerifiedBy));

  const rows = users.map((u: any) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    profession: u.profession,
    licenseNumber: u.licenseNumber,
    licenseCategory: u.licenseCategory,
    licenseCertNumber: u.licenseCertNumber,
    licenseStatus: verificationLabel(!!u.licenseVerified, u.licenseVerificationStatus, !!u.licenseDocumentUrl, 'matrícula'),
    hasLicenseDoc: !!u.licenseDocumentUrl,
    licenseDocumentUrl: u.licenseDocumentUrl,
    licenseRejectedReason: u.licenseRejectedReason,
    licenseVerifiedByName: verifiers[u.licenseVerifiedBy] || '',
    licenseVerifiedAt: u.licenseVerifiedAt,
    insuranceStatus: verificationLabel(!!u.insuranceVerified, u.insuranceVerificationStatus, !!u.insuranceDocumentUrl, 'seguro'),
    insuranceExpiresAt: u.insuranceExpiresAt,
    dniVerified: !!u.dniVerified,
    createdAt: u.createdAt,
  }));

  // Filter on the derived label so the admin can pull "todo lo pendiente" in one go.
  return status ? rows.filter((r) => r.licenseStatus === status) : rows;
}

router.get('/licenses', async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 25, search = '', status = '' } = req.query as any;
    const all = await licenseRecords(search, status);
    const start = (Number(page) - 1) * Number(limit);
    res.json({ success: true, data: all.slice(start, start + Number(limit)),
      pagination: { total: all.length, page: Number(page), limit: Number(limit), totalPages: Math.ceil(all.length / Number(limit)) } });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});
router.get('/licenses/export.csv', async (req: AuthRequest, res: Response) => {
  try {
    const q = req.query as any;
    const all = await licenseRecords(q.search || '', q.status || '');
    sendCsv(res, 'matriculas', LICENSE_COLS as any, all.map((r: any) => LICENSE_COLS.map((c) => csvCell(r[c.key]))));
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

// ── SEGUROS ─────────────────────────────────────────────────────────────
// Same population as the licence registry (professionals), viewed through the
// insurance columns, plus expiry tracking the licence registry has no use for.
const INSURANCE_COLS = [
  { key: 'name', label: 'Profesional' },
  { key: 'email', label: 'Email' },
  { key: 'profession', label: 'Profesión' },
  { key: 'insuranceStatus', label: 'Estado seguro' },
  { key: 'hasInsuranceDoc', label: 'Póliza' },
  { key: 'insuranceRejectedReason', label: 'Motivo rechazo' },
  { key: 'insuranceVerifiedByName', label: 'Verificado por' },
  { key: 'insuranceVerifiedAt', label: 'Fecha verificación' },
  { key: 'insuranceExpiresAt', label: 'Vencimiento' },
  { key: 'expiryState', label: 'Vigencia' },
  { key: 'licenseStatus', label: 'Estado matrícula' },
  { key: 'createdAt', label: 'Registrado' },
] as const;

function expiryState(expiresAt: Date | null, verified: boolean): string {
  if (!verified) return '—';
  if (!expiresAt) return 'sin vencimiento';
  const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000);
  if (days < 0) return 'vencido';
  if (days <= 30) return `vence en ${days}d`;
  return 'vigente';
}

async function insuranceRecords(search: string, status: string) {
  const where: any = { [Op.or]: PROFESSIONAL_SCOPE };
  if (search?.trim()) {
    where[Op.and] = [{
      [Op.or]: [
        { name: { [Op.iLike]: `%${search.trim()}%` } },
        { email: { [Op.iLike]: `%${search.trim()}%` } },
      ],
    }];
  }

  const users = await User.findAll({ where, order: [['createdAt', 'DESC']], limit: 5000 });
  const verifiers = await nameMap(users.map((u: any) => u.insuranceVerifiedBy));

  const rows = users.map((u: any) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    profession: u.profession,
    insuranceStatus: verificationLabel(!!u.insuranceVerified, u.insuranceVerificationStatus, !!u.insuranceDocumentUrl, 'seguro'),
    hasInsuranceDoc: !!u.insuranceDocumentUrl,
    insuranceDocumentUrl: u.insuranceDocumentUrl,
    insuranceRejectedReason: u.insuranceRejectedReason,
    insuranceVerifiedByName: verifiers[u.insuranceVerifiedBy] || '',
    insuranceVerifiedAt: u.insuranceVerifiedAt,
    insuranceExpiresAt: u.insuranceExpiresAt,
    expiryState: expiryState(u.insuranceExpiresAt, !!u.insuranceVerified),
    licenseStatus: verificationLabel(!!u.licenseVerified, u.licenseVerificationStatus, !!u.licenseDocumentUrl, 'matrícula'),
    createdAt: u.createdAt,
  }));

  // `status` filters the derived label, plus two expiry-only shortcuts that are
  // the whole reason this registry exists separately from matrículas.
  if (!status) return rows;
  if (status === 'vencido' || status === 'por_vencer') {
    return rows.filter((r) =>
      status === 'vencido' ? r.expiryState === 'vencido' : r.expiryState.startsWith('vence en'),
    );
  }
  return rows.filter((r) => r.insuranceStatus === status);
}

router.get('/insurances', async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 25, search = '', status = '' } = req.query as any;
    const all = await insuranceRecords(search, status);
    const start = (Number(page) - 1) * Number(limit);
    res.json({ success: true, data: all.slice(start, start + Number(limit)),
      pagination: { total: all.length, page: Number(page), limit: Number(limit), totalPages: Math.ceil(all.length / Number(limit)) } });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});
router.get('/insurances/export.csv', async (req: AuthRequest, res: Response) => {
  try {
    const q = req.query as any;
    const all = await insuranceRecords(q.search || '', q.status || '');
    sendCsv(res, 'seguros', INSURANCE_COLS as any, all.map((r: any) => INSURANCE_COLS.map((c) => csvCell(r[c.key]))));
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

export default router;
