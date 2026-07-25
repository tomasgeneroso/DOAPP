import { Router, Response } from 'express';
import { Op } from 'sequelize';
import { protect, authorize, AuthRequest } from '../../middleware/auth.js';
import { BannedIdentity } from '../../models/sql/BannedIdentity.model.js';
import { logAudit } from '../../utils/auditLog.js';

const router = Router();
router.use(protect, authorize('admin', 'super_admin', 'owner'));

/**
 * GET /admin/banned-identities
 * Permanent registry of banned emails + DNIs (survives account deletion).
 * Supports ?search=, ?status=active|inactive|all, pagination.
 */
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { page = 1, limit = 20, search = '', status = 'active' } = req.query;
    const where: any = {};
    if (status === 'active') where.isActive = true;
    else if (status === 'inactive') where.isActive = false;

    if (search) {
      const q = `%${String(search).trim()}%`;
      where[Op.or] = [
        { email: { [Op.iLike]: q } },
        { dni: { [Op.iLike]: q } },
        { name: { [Op.iLike]: q } },
      ];
    }

    const { rows, count } = await BannedIdentity.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: Number(limit),
      offset: (Number(page) - 1) * Number(limit),
    });

    res.json({
      success: true,
      data: rows,
      pagination: {
        total: count,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(count / Number(limit)),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Error del servidor' });
  }
});

/**
 * POST /admin/banned-identities
 * Manually add an identity to the registry (email required).
 */
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { email, dni, name, reason } = req.body;
    const normEmail = String(email || '').toLowerCase().trim();
    if (!normEmail) {
      res.status(400).json({ success: false, message: 'El email es obligatorio' });
      return;
    }

    const existing = await BannedIdentity.findOne({ where: { email: normEmail } });
    if (existing) {
      res.status(409).json({ success: false, message: 'Esa identidad ya está en el registro', data: existing });
      return;
    }

    const entry = await BannedIdentity.create({
      email: normEmail,
      dni: dni || null,
      name: name || null,
      reason: reason || 'Agregado manualmente por un administrador',
      bannedBy: req.user!.id,
      isActive: true,
    });

    await logAudit({
      req,
      action: 'ban_user',
      category: 'user',
      description: `Identidad ${normEmail} agregada manualmente al registro de baneados`,
      targetModel: 'BannedIdentity',
      targetId: entry.id,
      targetIdentifier: normEmail,
    });

    res.status(201).json({ success: true, data: entry });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Error del servidor' });
  }
});

/**
 * PUT /admin/banned-identities/:id
 * Edit an identity record (email, dni, name, reason, isActive).
 */
router.put('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const entry = await BannedIdentity.findByPk(req.params.id);
    if (!entry) {
      res.status(404).json({ success: false, message: 'Registro no encontrado' });
      return;
    }

    const { email, dni, name, reason, isActive } = req.body;
    const updates: any = {};
    if (email !== undefined) {
      const normEmail = String(email).toLowerCase().trim();
      if (!normEmail) {
        res.status(400).json({ success: false, message: 'El email no puede quedar vacío' });
        return;
      }
      // Prevent collapsing two records into a duplicate email.
      const clash = await BannedIdentity.findOne({ where: { email: normEmail, id: { [Op.ne]: entry.id } } });
      if (clash) {
        res.status(409).json({ success: false, message: 'Ya existe otro registro con ese email' });
        return;
      }
      updates.email = normEmail;
    }
    if (dni !== undefined) updates.dni = dni || null;
    if (name !== undefined) updates.name = name || null;
    if (reason !== undefined) updates.reason = reason || entry.reason;
    if (isActive !== undefined) updates.isActive = !!isActive;

    await entry.update(updates);

    await logAudit({
      req,
      action: 'update_user',
      category: 'user',
      description: `Registro de identidad baneada ${entry.email} editado`,
      targetModel: 'BannedIdentity',
      targetId: entry.id,
      targetIdentifier: entry.email,
      metadata: { changedFields: Object.keys(updates) },
    });

    res.json({ success: true, data: entry });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Error del servidor' });
  }
});

/**
 * DELETE /admin/banned-identities/:id
 * Remove an identity from the registry (unblocks re-registration).
 */
router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const entry = await BannedIdentity.findByPk(req.params.id);
    if (!entry) {
      res.status(404).json({ success: false, message: 'Registro no encontrado' });
      return;
    }
    const email = entry.email;
    const id = entry.id;
    await entry.destroy();

    await logAudit({
      req,
      action: 'unban_user',
      category: 'user',
      description: `Identidad ${email} eliminada del registro de baneados`,
      targetModel: 'BannedIdentity',
      targetId: id,
      targetIdentifier: email,
    });

    res.json({ success: true, message: 'Registro eliminado' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Error del servidor' });
  }
});

export default router;
