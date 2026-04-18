import express, { Response } from "express";
import { protect, AuthRequest } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/permissions.js";
import { Job } from "../../models/sql/Job.model.js";
import { Contract } from "../../models/sql/Contract.model.js";
import { Payment } from "../../models/sql/Payment.model.js";
import { WithdrawalRequest } from "../../models/sql/WithdrawalRequest.model.js";
import { User } from "../../models/sql/User.model.js";
import { Op, literal } from "sequelize";
import { isValidUUID } from "../../utils/sanitizer.js";

const router = express.Router();

// Escape special LIKE characters to avoid SQL injection via ILIKE
const escapeLike = (s: string) => s.replace(/[%_\\]/g, '\\$&');

// Build a condition that matches UUID column partially (case-insensitive)
const uuidLike = (colName: string, search: string) =>
  literal(`CAST(${colName} AS TEXT) ILIKE '%${escapeLike(search)}%'`);

/**
 * Global admin search by ID (full UUID or partial)
 * GET /api/admin/search?id=<query>
 * Returns all matching records across Job, Contract, Payment, WithdrawalRequest, User
 */
router.get("/", protect, requireRole('admin', 'super_admin', 'owner'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.query;

    if (!id || typeof id !== 'string' || !id.trim()) {
      res.status(400).json({ success: false, message: "Se requiere un ID para buscar" });
      return;
    }

    const searchStr = id.trim();

    if (searchStr.length < 4) {
      res.status(400).json({ success: false, message: "El ID debe tener al menos 4 caracteres" });
      return;
    }

    const isFullUUID = isValidUUID(searchStr);

    const results: any = {
      job: null,
      contracts: [],
      payments: [],
      withdrawal: null,
      users: [],
    };

    // Helper to dedupe by id
    const addUnique = (arr: any[], item: any) => {
      if (item && !arr.find((r: any) => r.id === item.id)) arr.push(item);
    };

    const contractIncludes = [
      { model: User, as: 'client', attributes: ['id', 'name', 'email'] },
      { model: User, as: 'doer', attributes: ['id', 'name', 'email'] },
      { model: Job, as: 'job', attributes: ['id', 'title', 'status'] },
    ];

    const paymentIncludes = [
      { model: User, as: 'payer', attributes: ['id', 'name', 'email'] },
      { model: User, as: 'recipient', attributes: ['id', 'name', 'email'] },
    ];

    // ── JOB ──────────────────────────────────────────────
    const jobs = await Job.findAll({
      where: {
        [Op.or]: [
          uuidLike('"jobs"."id"', searchStr),
          ...(isFullUUID ? [{ publicationPaymentId: searchStr }] : []),
        ],
      },
      include: [{ model: User, as: 'client', attributes: ['id', 'name', 'email'] }],
      limit: 5,
    }).catch(() => []);
    if (jobs.length > 0) results.job = jobs[0];

    // ── CONTRACT ─────────────────────────────────────────
    const contracts = await Contract.findAll({
      where: {
        [Op.or]: [
          uuidLike('"contracts"."id"', searchStr),
          uuidLike('"contracts"."job_id"', searchStr),
          uuidLike('"contracts"."client_id"', searchStr),
          uuidLike('"contracts"."doer_id"', searchStr),
        ],
      },
      include: contractIncludes,
      limit: 10,
    }).catch(() => []);
    contracts.forEach(c => addUnique(results.contracts, c));

    // If we found a job, also get its contracts
    if (results.job) {
      const byJob = await Contract.findAll({
        where: { jobId: results.job.id },
        include: contractIncludes,
        limit: 10,
      }).catch(() => []);
      byJob.forEach(c => addUnique(results.contracts, c));
    }

    // ── PAYMENT ───────────────────────────────────────────
    const payments = await Payment.findAll({
      where: {
        [Op.or]: [
          uuidLike('"payments"."id"', searchStr),
          uuidLike('"payments"."contract_id"', searchStr),
          uuidLike('"payments"."payer_id"', searchStr),
        ],
      },
      include: paymentIncludes,
      limit: 10,
    }).catch(() => []);
    payments.forEach(p => addUnique(results.payments, p));

    // Payments for found contracts
    for (const c of results.contracts) {
      const cp = await Payment.findAll({
        where: { contractId: c.id },
        include: paymentIncludes,
        limit: 5,
      }).catch(() => []);
      cp.forEach(p => addUnique(results.payments, p));
    }

    // ── WITHDRAWAL ────────────────────────────────────────
    const withdrawals = await WithdrawalRequest.findAll({
      where: { [Op.or]: [uuidLike('"withdrawal_requests"."id"', searchStr)] },
      include: [{ model: User, attributes: ['id', 'name', 'email'] }],
      limit: 5,
    }).catch(() => []);
    if (withdrawals.length > 0) results.withdrawal = withdrawals[0];

    // ── USER ──────────────────────────────────────────────
    const users = await User.findAll({
      where: {
        [Op.or]: [
          uuidLike('"users"."id"', searchStr),
          { name: { [Op.iLike]: `%${escapeLike(searchStr)}%` } },
          { email: { [Op.iLike]: `%${escapeLike(searchStr)}%` } },
        ],
      },
      attributes: ['id', 'name', 'email', 'membershipType', 'balance', 'createdAt'],
      limit: 5,
    }).catch(() => []);
    results.users = users;

    const found = results.job || results.contracts.length > 0 || results.payments.length > 0 || results.withdrawal || results.users.length > 0;

    res.json({ success: true, data: results, found });
  } catch (error: any) {
    console.error("Admin search error:", error);
    res.status(500).json({ success: false, message: error.message || "Error en la búsqueda" });
  }
});

export default router;
