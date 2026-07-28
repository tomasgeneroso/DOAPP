import { Router, Response } from 'express';
import { Op } from 'sequelize';
import { protect, authorize, AuthRequest } from '../../middleware/auth.js';
import { User } from '../../models/sql/User.model.js';
import { Job } from '../../models/sql/Job.model.js';
import { Contract } from '../../models/sql/Contract.model.js';
import { Dispute } from '../../models/sql/Dispute.model.js';

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

export default router;
