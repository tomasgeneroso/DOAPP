import express, { Response } from 'express';
import { protect } from '../../middleware/auth.js';
import { requireAdminRole } from '../../middleware/permissions.js';
import type { AuthRequest } from '../../types/index.js';
import { Job } from '../../models/sql/Job.model.js';
import { User } from '../../models/sql/User.model.js';
import { Payment } from '../../models/sql/Payment.model.js';
import { PaymentProof } from '../../models/sql/PaymentProof.model.js';
import { Op } from 'sequelize';

const router = express.Router();

/**
 * GET /api/admin/jobs
 * Obtener lista de trabajos con filtros
 */
router.get(
  '/',
  protect,
  requireAdminRole,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { status, search, page = 1, limit = 50 } = req.query;

      const where: any = {};

      // Filtro por estado
      if (status && status !== 'all') {
        where.status = status;
      }

      // Búsqueda por título o descripción
      if (search) {
        where[Op.or] = [
          { title: { [Op.iLike]: `%${search}%` } },
          { description: { [Op.iLike]: `%${search}%` } },
          { summary: { [Op.iLike]: `%${search}%` } },
        ];
      }

      const offset = (Number(page) - 1) * Number(limit);

      const { count, rows: jobs } = await Job.findAndCountAll({
        where,
        include: [
          {
            model: User,
            as: 'client',
            attributes: ['id', 'name', 'email', 'avatar'],
          },
        ],
        order: [['createdAt', 'DESC']],
        limit: Number(limit),
        offset,
      });

      // Obtener los PaymentProofs para los jobs que tienen publicationPaymentId
      const jobsWithPaymentIds = jobs.filter(job => job.publicationPaymentId);
      const paymentIds = jobsWithPaymentIds.map(job => job.publicationPaymentId);

      // Buscar PaymentProofs asociados a estos pagos
      const paymentProofs = paymentIds.length > 0 ? await PaymentProof.findAll({
        where: {
          paymentId: { [Op.in]: paymentIds },
          isActive: true,
        },
        attributes: ['id', 'paymentId', 'fileUrl', 'fileType', 'fileName', 'status', 'uploadedAt'],
      }) : [];

      // Crear mapa de paymentId -> paymentProof
      const proofsByPaymentId = new Map();
      for (const proof of paymentProofs) {
        proofsByPaymentId.set(proof.paymentId, proof);
      }

      // Agregar paymentProof a cada job
      const jobsWithProofs = jobs.map(job => {
        const jobData = job.toJSON();
        if (job.publicationPaymentId) {
          const proof = proofsByPaymentId.get(job.publicationPaymentId);
          if (proof) {
            jobData.paymentProof = {
              id: proof.id,
              fileUrl: proof.fileUrl,
              fileType: proof.fileType,
              fileName: proof.fileName,
              status: proof.status,
              uploadedAt: proof.uploadedAt,
            };
          }
        }
        return jobData;
      });

      res.json({
        success: true,
        data: jobsWithProofs,
        pagination: {
          total: count,
          page: Number(page),
          pages: Math.ceil(count / Number(limit)),
          limit: Number(limit),
        },
      });
    } catch (error: any) {
      console.error('Error fetching jobs:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error al obtener publicaciones',
      });
    }
  }
);

/**
 * GET /api/admin/jobs/stats
 * Obtener estadísticas de publicaciones
 */
router.get(
  '/stats',
  protect,
  requireAdminRole,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const [total, pending, approved, rejected] = await Promise.all([
        Job.count(),
        Job.count({ where: { status: 'pending_approval' } }),
        Job.count({ where: { status: 'open' } }),
        Job.count({ where: { status: 'cancelled' } }),
      ]);

      res.json({
        success: true,
        data: {
          total,
          pending,
          approved,
          rejected,
        },
      });
    } catch (error: any) {
      console.error('Error fetching job stats:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error al obtener estadísticas',
      });
    }
  }
);

/**
 * PUT /api/admin/jobs/:id/status
 * Actualizar estado de una publicación (aprobar/rechazar)
 */
router.put(
  '/:id/status',
  protect,
  requireAdminRole,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { status, rejectedReason } = req.body;

      if (!status || !['approved', 'rejected'].includes(status)) {
        res.status(400).json({
          success: false,
          message: "Estado inválido. Debe ser 'approved' o 'rejected'",
        });
        return;
      }

      const job = await Job.findByPk(id, {
        include: [
          {
            model: User,
            as: 'client',
            attributes: ['id', 'name', 'email'],
          },
        ],
      });

      if (!job) {
        res.status(404).json({
          success: false,
          message: 'Publicación no encontrada',
        });
        return;
      }

      // Mapear status de admin a status de Job
      let newStatus: any;
      if (status === 'approved') {
        newStatus = 'open'; // Publicación aprobada y abierta
      } else {
        newStatus = 'cancelled'; // Publicación rechazada
      }

      // Actualizar job
      await job.update({
        status: newStatus,
        rejectedReason: status === 'rejected' ? rejectedReason : null,
        reviewedBy: req.user.id,
        reviewedAt: new Date(),
      });

      // TODO: Enviar notificación al usuario
      // Si es aprobado: "Tu publicación ha sido aprobada"
      // Si es rechazado: "Tu publicación ha sido rechazada: [razón]"

      res.json({
        success: true,
        message: `Publicación ${status === 'approved' ? 'aprobada' : 'rechazada'} exitosamente`,
        data: job,
      });
    } catch (error: any) {
      console.error('Error updating job status:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error al actualizar estado',
      });
    }
  }
);

export default router;
