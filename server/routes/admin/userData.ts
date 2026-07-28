import { Router, Response } from 'express';
import { Op } from 'sequelize';
import { protect, authorize, AuthRequest } from '../../middleware/auth.js';
import { User } from '../../models/sql/User.model.js';

/**
 * Detailed user "registry" for admins: the full data profile of each user
 * (identity, KYC, professional, account, activity), searchable + CSV export.
 * Separate from /admin/users which is the operational management view.
 */
const router = Router();
router.use(protect, authorize('admin', 'super_admin', 'owner'));

function buildWhere(search?: string): any {
  if (!search || !String(search).trim()) return {};
  const q = `%${String(search).trim()}%`;
  return {
    [Op.or]: [
      { name: { [Op.iLike]: q } },
      { username: { [Op.iLike]: q } },
      { email: { [Op.iLike]: q } },
      { phone: { [Op.iLike]: q } },
      { dni: { [Op.iLike]: q } },
    ],
  };
}

function toRecord(u: any) {
  const cred = u.getCredibilityInfo?.() || { score: 0, max: 2 };
  const kyc = u.kycData || {};
  const idv = kyc.id_verifications?.[0] || kyc.id_verification || {};
  return {
    id: u.id,
    name: u.name,
    username: u.username || '',
    email: u.email,
    phone: u.phone || '',
    phoneVerified: !!u.phoneVerified,
    emailVerified: !!u.isVerified,
    dni: u.dni || '',
    dniVerified: !!u.dniVerified,
    kycStatus: u.kycStatus || '',
    credibility: `${cred.score}/${cred.max}`,
    role: u.adminRole || u.role || 'user',
    membershipTier: u.membershipTier || 'free',
    profession: u.profession || '',
    licenseNumber: u.licenseNumber || '',
    licenseVerified: !!u.licenseVerified,
    insuranceVerified: !!u.insuranceVerified,
    city: u.city || '',
    state: u.state || '',
    balanceArs: Number(u.balanceArs || 0),
    completedJobs: u.completedJobs || 0,
    rating: Number(u.rating || 0),
    reviewsCount: u.reviewsCount || 0,
    kycName: [idv.first_name, idv.last_name].filter(Boolean).join(' '),
    kycDocument: idv.document_number || '',
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt || null,
  };
}

// GET /api/admin/user-data  — paginated, searchable
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { page = 1, limit = 25, search = '' } = req.query;
    const { rows, count } = await User.findAndCountAll({
      where: buildWhere(search as string),
      attributes: { exclude: ['password', 'twoFactorSecret', 'twoFactorBackupCodes'] },
      order: [['createdAt', 'DESC']],
      limit: Number(limit),
      offset: (Number(page) - 1) * Number(limit),
    });
    res.json({
      success: true,
      data: rows.map(toRecord),
      pagination: { total: count, page: Number(page), limit: Number(limit), totalPages: Math.ceil(count / Number(limit)) },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Error del servidor' });
  }
});

const CSV_COLUMNS: Array<{ key: keyof ReturnType<typeof toRecord>; label: string }> = [
  { key: 'name', label: 'Nombre' },
  { key: 'username', label: 'Usuario' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Teléfono' },
  { key: 'phoneVerified', label: 'Tel. verificado' },
  { key: 'emailVerified', label: 'Email verificado' },
  { key: 'dni', label: 'DNI' },
  { key: 'dniVerified', label: 'DNI verificado' },
  { key: 'kycStatus', label: 'Estado KYC' },
  { key: 'kycName', label: 'Nombre (KYC)' },
  { key: 'kycDocument', label: 'Documento (KYC)' },
  { key: 'credibility', label: 'Credibilidad' },
  { key: 'role', label: 'Rol' },
  { key: 'membershipTier', label: 'Membresía' },
  { key: 'profession', label: 'Profesión' },
  { key: 'licenseNumber', label: 'Matrícula' },
  { key: 'licenseVerified', label: 'Matrícula verif.' },
  { key: 'insuranceVerified', label: 'Seguro verif.' },
  { key: 'city', label: 'Ciudad' },
  { key: 'state', label: 'Provincia' },
  { key: 'balanceArs', label: 'Balance ARS' },
  { key: 'completedJobs', label: 'Trabajos' },
  { key: 'rating', label: 'Rating' },
  { key: 'reviewsCount', label: 'Reseñas' },
  { key: 'createdAt', label: 'Registro' },
  { key: 'lastLoginAt', label: 'Último acceso' },
];

function csvCell(v: any): string {
  if (v === null || v === undefined) return '';
  let s: string;
  if (typeof v === 'boolean') s = v ? 'Sí' : 'No';
  else if (v instanceof Date) s = v.toISOString().split('T')[0];
  else s = String(v);
  if (/[",\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

// GET /api/admin/user-data/export.csv  — all rows matching the search
router.get('/export.csv', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { search = '' } = req.query;
    const users = await User.findAll({
      where: buildWhere(search as string),
      attributes: { exclude: ['password', 'twoFactorSecret', 'twoFactorBackupCodes'] },
      order: [['createdAt', 'DESC']],
    });
    const header = CSV_COLUMNS.map((c) => c.label).join(',');
    const lines = users.map((u) => {
      const rec = toRecord(u) as any;
      return CSV_COLUMNS.map((c) => csvCell(rec[c.key])).join(',');
    });
    const csv = [header, ...lines].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=usuarios-${new Date().toISOString().split('T')[0]}.csv`);
    res.send('﻿' + csv); // BOM so Excel reads UTF-8
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Error del servidor' });
  }
});

export default router;
