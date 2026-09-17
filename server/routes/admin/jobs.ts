import express, { Response } from 'express';
import { protect } from '../../middleware/auth.js';
import { requireAdminRole } from '../../middleware/permissions.js';
import type { AuthRequest } from '../../types/index.js';
import { Job } from '../../models/sql/Job.model.js';
import { Contract } from '../../models/sql/Contract.model.js';
import { User } from '../../models/sql/User.model.js';
import { Payment } from '../../models/sql/Payment.model.js';
import { PaymentProof } from '../../models/sql/PaymentProof.model.js';
import { Op, literal } from 'sequelize';
import { isValidUUID } from '../../utils/sanitizer.js';
import { logAudit } from '../../utils/auditLog.js';

const escapeLike = (s: string) => s.replace(/[%_\\]/g, '\\$&');
import { socketService } from '../../index.js';

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

      // Búsqueda por título, descripción, ID parcial o UUID relacionado
      if (search) {
        const searchStr = search as string;
        if (/^[0-9a-f-]{4,}$/i.test(searchStr)) {
          // UUID fragment: match job ID, clientId, or resolve via related contract
          const contractsForSearch = await Contract.findAll({
            where: { [Op.or]: [literal(`CAST("contracts"."id" AS TEXT) ILIKE '%${escapeLike(searchStr)}%'`)] },
            attributes: ['jobId'],
            limit: 10,
          }).catch(() => []);

          const conditions: any[] = [
            literal(`CAST("jobs"."id" AS TEXT) ILIKE '%${escapeLike(searchStr)}%'`),
            literal(`CAST("jobs"."client_id" AS TEXT) ILIKE '%${escapeLike(searchStr)}%'`),
          ];
          const contractJobIds = contractsForSearch.map(c => c.jobId).filter(Boolean);
          if (contractJobIds.length > 0) {
            conditions.push({ id: { [Op.in]: contractJobIds } });
          }
          where[Op.or] = conditions;
        } else {
          where[Op.or] = [
            { title: { [Op.iLike]: `%${searchStr}%` } },
            { description: { [Op.iLike]: `%${searchStr}%` } },
            { summary: { [Op.iLike]: `%${searchStr}%` } },
          ];
        }
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
          {
            model: User,
            as: 'reviewer',
            attributes: ['id', 'name', 'email'],
            required: false,
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
 * GET /api/admin/jobs/board
 * Panel de publicaciones vivas, con el estado real de cada una.
 *
 * El listado general de trabajos ordena por fecha y muestra el status de la
 * base, que no alcanza para operar: "open" es lo mismo para una publicación de
 * ayer con seis cotizaciones que para una de hace un mes que nadie miró. Lo que
 * un administrador necesita saber es cuál está trabada y por qué.
 *
 * Los estados se calculan acá y no se guardan en una columna a propósito:
 * dependen del tiempo, así que una columna estaría desactualizada apenas se
 * escribe y habría que mantenerla con un cron que puede fallar en silencio.
 */
router.get(
  '/board',
  protect,
  requireAdminRole,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { diasHabilesDesde, DIAS_HABILES_ANTES_DE_PAUSAR } = await import(
        '../../services/quotePayment.js'
      );
      const { Proposal } = await import('../../models/sql/Proposal.model.js');

      const filtro = String(req.query.estado || 'todos');
      const limit = Math.min(Number(req.query.limit) || 100, 300);

      const jobs = await Job.findAll({
        where: { status: { [Op.in]: ['open', 'paused', 'pending_approval'] } },
        include: [{ model: User, as: 'client', attributes: ['id', 'name', 'email'], required: false }],
        order: [['createdAt', 'ASC']],
        limit,
      });

      // Cotizaciones por trabajo en una sola consulta: una por trabajo serían
      // cientos de idas a la base para pintar una tabla.
      const ids = jobs.map((j) => j.id);
      const propuestas = ids.length
        ? await Proposal.findAll({
            where: { jobId: { [Op.in]: ids } },
            attributes: ['id', 'jobId', 'status'],
          })
        : [];

      const porJob = new Map<string, { total: number; aceptadas: number }>();
      for (const p of propuestas as any[]) {
        const e = porJob.get(p.jobId) || { total: 0, aceptadas: 0 };
        e.total++;
        if (p.status === 'approved') e.aceptadas++;
        porJob.set(p.jobId, e);
      }

      const filas = jobs.map((job: any) => {
        const c = porJob.get(job.id) || { total: 0, aceptadas: 0 };
        const desde = job.resumedAt || job.createdAt;
        const dias = diasHabilesDesde(new Date(desde));
        const vencida = dias >= DIAS_HABILES_ANTES_DE_PAUSAR && c.aceptadas === 0;

        /**
         * "Pagada fantasma": pagada, vencida y sin cotización aceptada.
         *
         * No se pausa porque pagar compra permanencia, y esa promesa se
         * respeta. Pero sigue siendo una publicación que nadie atiende, y el
         * que cotiza sobre ella pierde el tiempo igual. Que aparezca marcada
         * acá permite que alguien llame al cliente antes de que el trabajador
         * se lleve la mala experiencia.
         */
        /**
         * Los estados distinguen DOS cosas distintas, y confundirlas fue el
         * error de la primera version:
         *
         *   el plazo    ¿superó los días hábiles de control?
         *   el cuello   ¿nadie cotizó, o cotizaron y el cliente no eligió?
         *
         * La segunda es la que dice qué hacer. Si nadie cotizó, el problema
         * está en la publicación: precio fuera de mercado, descripción pobre,
         * categoría sin trabajadores. Si cotizaron y el cliente no eligió, el
         * problema es el cliente y hay que llamarlo. Son dos llamados
         * distintos a dos personas distintas.
         */
        let estado:
          | 'pagada_fantasma'
          | 'pausada_inactividad'
          | 'vencida_nadie_cotizo'
          | 'vencida_sin_elegir'
          | 'sin_cotizaciones'
          | 'esperando_aprobacion'
          | 'cancelacion_pendiente'
          | 'normal';

        // El cliente pidió cancelar mientras esperaba aprobación: sale de la
        // cola de aprobar y entra a esta. Va primero porque decide sobre las
        // demás: no se aprueba lo que el dueño ya no quiere.
        if (job.cancellationRequestedAt) estado = 'cancelacion_pendiente';
        else if (job.status === 'pending_approval') estado = 'esperando_aprobacion';
        else if (job.pausedForInactivityAt) estado = 'pausada_inactividad';
        else if (vencida && job.publicationPaid) estado = 'pagada_fantasma';
        else if (vencida) estado = c.total === 0 ? 'vencida_nadie_cotizo' : 'vencida_sin_elegir';
        // Dentro del plazo pero ya lleva días sin que nadie cotice: es el aviso
        // temprano, cuando todavía se puede corregir el precio o el texto.
        else if (c.total === 0 && dias >= 3) estado = 'sin_cotizaciones';
        else estado = 'normal';

        return {
          id: job.id,
          titulo: job.title,
          estadoBase: job.status,
          estado,
          precio: Number(job.price) || 0,
          modo: job.pricingMode || 'fixed',
          pagada: !!job.publicationPaid,
          diasHabiles: dias,
          cotizaciones: c.total,
          cotizacionesAceptadas: c.aceptadas,
          publicadaEl: job.createdAt,
          reanudadaEl: job.resumedAt || null,
          cancelacionPedidaEl: job.cancellationRequestedAt || null,
          motivoCancelacion: job.cancellationReason || null,
          cliente: job.client
            ? { id: job.client.id, nombre: job.client.name, email: job.client.email }
            : null,
        };
      });

      let resultado = filtro === 'todos' ? filas : filas.filter((f) => f.estado === filtro);

      /**
       * El orden se aplica acá y no en la consulta.
       *
       * Dos de las columnas por las que uno quiere ordenar -- días hábiles y
       * cantidad de cotizaciones -- no existen como campo: se calculan después
       * de traer los datos. Ordenar en SQL sólo algunas y en memoria las otras
       * daría dos comportamientos distintos según la columna, que es peor que
       * ordenar todo igual.
       */
      const ordenarPor = String(req.query.ordenarPor || 'diasHabiles');
      const direccion = String(req.query.direccion || 'desc') === 'asc' ? 1 : -1;

      const ORDENABLES = new Set([
        'diasHabiles', 'cotizaciones', 'precio', 'titulo', 'publicadaEl', 'estado',
      ]);

      if (ORDENABLES.has(ordenarPor)) {
        resultado = [...resultado].sort((a: any, b: any) => {
          const x = a[ordenarPor];
          const y = b[ordenarPor];
          if (typeof x === 'string' && typeof y === 'string') {
            return x.localeCompare(y, 'es') * direccion;
          }
          return ((x ?? 0) - (y ?? 0)) * direccion;
        });
      }

      // Los totales se cuentan sobre todo lo traído, no sobre lo filtrado: si
      // no, el contador de "pagadas fantasma" mostraría 0 al filtrar por otra
      // cosa y no se podría navegar entre estados.
      const resumen = filas.reduce<Record<string, number>>((acc, f) => {
        acc[f.estado] = (acc[f.estado] || 0) + 1;
        return acc;
      }, {});

      res.json({
        success: true,
        data: resultado,
        resumen,
        umbralDiasHabiles: DIAS_HABILES_ANTES_DE_PAUSAR,
        orden: { ordenarPor, direccion: direccion === 1 ? 'asc' : 'desc' },
      });
    } catch (error: any) {
      console.error('Error armando el panel de publicaciones:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },
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

      if (!status || !['approved', 'rejected', 'cancelled'].includes(status)) {
        res.status(400).json({
          success: false,
          message: "Estado inválido. Debe ser 'approved', 'rejected' o 'cancelled' (aprobar el pedido de cancelación del cliente)",
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

      /**
       * No se aprueba lo que el dueño ya pidió cancelar. Si el admin quiere
       * publicarlo igual, primero tiene que hablar con el cliente; acá no hay
       * atajo.
       */
      if (status === 'approved' && (job as any).cancellationRequestedAt) {
        res.status(409).json({
          success: false,
          message: 'El cliente pidió cancelar esta publicación antes de que se apruebe. Aprobá la cancelación (status: "cancelled") en vez de publicarla.',
        });
        return;
      }
      if (status === 'cancelled' && !(job as any).cancellationRequestedAt) {
        res.status(400).json({
          success: false,
          message: 'Este trabajo no tiene un pedido de cancelación del cliente. Para darlo de baja usá "rejected".',
        });
        return;
      }

      const newStatus: any = status === 'approved' ? 'open' : 'cancelled';
      const previousStatus = job.status;
      const estabaAprobada = previousStatus !== 'pending_approval';

      await job.update({
        status: newStatus,
        rejectedReason: status === 'rejected' ? rejectedReason : null,
        reviewedBy: req.user.id,
        reviewedAt: new Date(),
        ...(status !== 'approved'
          ? { cancelledAt: new Date(), cancelledById: status === 'cancelled' ? job.clientId : req.user.id, cancelledByRole: status === 'cancelled' ? 'owner' : 'admin' }
          : {}),
      });

      /**
       * La plata. Rechazar una publicación pagada la dejaba en "cancelled" con
       * el dinero en escrow para siempre; aprobar la cancelación del cliente
       * no existía. Los dos casos son T&C 9.1 si nunca se aprobó: vuelve todo
       * menos la pasarela. Si ya estaba aprobada y el admin la da de baja,
       * rige 9.2/9.3.
       */
      let liquidacion: any = null;
      if (status !== 'approved' && (job as any).publicationPaid) {
        const { liquidarCancelacionDePublicacion } = await import('../../services/jobCancellation.js');
        const horas = (new Date(job.startDate).getTime() - Date.now()) / 3_600_000;
        const r = await liquidarCancelacionDePublicacion(job, {
          aprobada: estabaAprobada,
          horasHastaInicio: horas,
          actor: { id: String(req.user.id), tipo: 'admin' },
          motivo: status === 'rejected' ? (rejectedReason || 'rechazada por admin') : (job.cancellationReason || 'cancelación pedida por el cliente'),
        });
        liquidacion = r.liq;
      }

      void logAudit({
        req, action: `job.${status}`, category: 'contract',
        severity: status === 'approved' ? 'low' : 'medium',
        description: `${status === 'approved' ? 'Aprobó' : status === 'rejected' ? 'Rechazó' : 'Aprobó la cancelación pedida por el cliente de'} la publicación "${job.title}"${status === 'rejected' && rejectedReason ? ` (motivo: ${rejectedReason})` : ''}`,
        targetModel: 'Job', targetId: job.id, targetIdentifier: job.title,
        metadata: { previousStatus, newStatus, rejectedReason: rejectedReason || null, liquidacion },
      });

      // Refetch job with associations for socket notification
      const updatedJob = await Job.findByPk(id, {
        include: [
          { model: User, as: 'client', attributes: ['id', 'name', 'email', 'avatar'] },
          { model: User, as: 'reviewer', attributes: ['id', 'name', 'email'], required: false },
        ],
      });

      // Send real-time notifications
      if (updatedJob) {
        // Notify job owner
        socketService.notifyJobUpdate(job.id, job.clientId, {
          action: status === 'approved' ? 'approved' : 'rejected',
          job: updatedJob.toJSON(),
        });

        // Notify admin panel and all job listings
        socketService.notifyJobStatusChanged(updatedJob.toJSON(), previousStatus);
      }

      // Create notification for job owner
      const { Notification } = await import('../../models/sql/Notification.model.js');
      const notification = await Notification.create({
        recipientId: job.clientId,
        title: status === 'approved' ? 'Publicación aprobada' : status === 'rejected' ? 'Publicación rechazada' : 'Cancelación aprobada',
        message: status === 'approved'
          ? `Tu publicación "${job.title}" ha sido aprobada y ya está visible.`
          : status === 'rejected'
            ? `Tu publicación "${job.title}" fue rechazada.${rejectedReason ? ` Razón: ${rejectedReason}.` : ''}${liquidacion ? ` Se acreditaron $${Number(liquidacion.aCliente).toLocaleString('es-AR')} a tu saldo (todo lo que pagaste menos $${Number(liquidacion.costoPasarela).toLocaleString('es-AR')} de pasarela, que no vuelve).` : ''}`
            : `Se aprobó tu pedido de cancelar "${job.title}".${liquidacion ? ` Se acreditaron $${Number(liquidacion.aCliente).toLocaleString('es-AR')} a tu saldo (todo lo que pagaste menos $${Number(liquidacion.costoPasarela).toLocaleString('es-AR')} de pasarela, que no vuelve).` : ''}`,
        type: status === 'approved' ? 'success' : 'warning',
        category: 'jobs',
        relatedId: job.id,
        relatedModel: 'Job',
        actionText: 'Ver trabajo',
        data: { jobId: job.id },
      });

      // Send real-time notification
      socketService.notifyUser(job.clientId, "notification:new", notification.toJSON());

      res.json({
        success: true,
        message: status === 'approved' ? 'Publicación aprobada' : status === 'rejected' ? 'Publicación rechazada y saldo devuelto al cliente' : 'Cancelación aprobada y saldo devuelto al cliente',
        data: updatedJob,
        liquidacion,
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

/**
 * PUT /api/admin/jobs/:id/action
 * Ejecutar acción sobre una publicación (pausar/reanudar/cancelar)
 */
router.put(
  '/:id/action',
  protect,
  requireAdminRole,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { action, reason, permanent } = req.body;

      if (!action || !['pause', 'resume', 'cancel'].includes(action)) {
        res.status(400).json({
          success: false,
          message: "Acción inválida. Debe ser 'pause', 'resume' o 'cancel'",
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

      let newStatus: string;
      let message: string;
      let notificationMessage: string;

      switch (action) {
        case 'pause':
          if (job.status === 'suspended') {
            res.status(400).json({ success: false, message: 'La publicación ya está pausada' });
            return;
          }
          newStatus = 'suspended';
          message = 'Publicación pausada exitosamente';
          notificationMessage = reason
            ? `Tu publicación "${job.title}" ha sido pausada por el administrador. Razón: ${reason}`
            : `Tu publicación "${job.title}" ha sido pausada por el administrador.`;
          // Guardar estado anterior para poder reanudar
          await job.update({
            status: newStatus,
            previousStatus: job.status,
            rejectedReason: reason || null,
            reviewedBy: req.user.id,
            reviewedAt: new Date(),
          });
          break;

        case 'resume':
          if (job.status !== 'suspended') {
            res.status(400).json({ success: false, message: 'Solo se pueden reanudar publicaciones pausadas' });
            return;
          }
          newStatus = job.previousStatus || 'open';
          message = 'Publicación reanudada exitosamente';
          notificationMessage = `Tu publicación "${job.title}" ha sido reanudada por el administrador.`;
          await job.update({
            status: newStatus,
            previousStatus: null,
            rejectedReason: null,
            reviewedBy: req.user.id,
            reviewedAt: new Date(),
          });
          break;

        case 'cancel':
          if (job.status === 'cancelled') {
            res.status(400).json({ success: false, message: 'La publicación ya está cancelada' });
            return;
          }
          if (!reason) {
            res.status(400).json({ success: false, message: 'Debe proporcionar una razón para cancelar' });
            return;
          }
          newStatus = 'cancelled';
          message = permanent
            ? 'Publicación cancelada definitivamente'
            : 'Publicación cancelada exitosamente';
          notificationMessage = permanent
            ? `Tu publicación "${job.title}" ha sido cancelada definitivamente por el administrador y no podrá ser editada. Razón: ${reason}`
            : `Tu publicación "${job.title}" ha sido cancelada por el administrador. Puedes editarla y reenviarla para aprobación. Razón: ${reason}`;
          await job.update({
            status: newStatus,
            cancellationReason: reason,
            cancelledAt: new Date(),
            permanentlyCancelled: permanent === true,
            reviewedBy: req.user.id,
            reviewedAt: new Date(),
          });
          break;

        default:
          res.status(400).json({ success: false, message: 'Acción no válida' });
          return;
      }

      void logAudit({
        req, action: `job.${action}`, category: 'contract',
        severity: action === 'cancel' ? 'medium' : 'low',
        description: `${action === 'pause' ? 'Pausó' : action === 'resume' ? 'Reanudó' : 'Canceló'} la publicación "${job.title}"${reason ? ` (motivo: ${reason})` : ''}${action === 'cancel' && permanent ? ' [definitiva]' : ''}`,
        targetModel: 'Job', targetId: job.id, targetIdentifier: job.title,
        metadata: { action, newStatus, reason: reason || null, permanent: permanent === true },
      });

      // Crear notificación para el usuario
      const { Notification } = await import('../../models/sql/Notification.model.js');
      await Notification.create({
        recipientId: job.clientId,
        title: action === 'cancel' ? 'Publicación cancelada' : action === 'pause' ? 'Publicación pausada' : 'Publicación reanudada',
        message: notificationMessage,
        type: action === 'cancel' ? 'warning' : 'info',
        category: 'system',
        relatedId: job.id,
        relatedModel: 'Job',
      });

      // Refetch job with associations for socket notification
      const updatedJob = await Job.findByPk(id, {
        include: [
          { model: User, as: 'client', attributes: ['id', 'name', 'email', 'avatar'] },
          { model: User, as: 'reviewer', attributes: ['id', 'name', 'email'], required: false },
        ],
      });

      // Send real-time notifications
      if (updatedJob) {
        const previousStatus = action === 'resume' ? 'paused' : job.status;

        // Notify job owner
        socketService.notifyJobUpdate(job.id, job.clientId, {
          action: action,
          job: updatedJob.toJSON(),
        });

        // Notify admin panel and all job listings
        socketService.notifyJobStatusChanged(updatedJob.toJSON(), previousStatus);
      }

      res.json({
        success: true,
        message,
        data: updatedJob || job,
      });
    } catch (error: any) {
      console.error('Error executing job action:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error al ejecutar acción',
      });
    }
  }
);

// PUT /api/admin/jobs/:id/toggle-reviewer
// Toggle current admin user as reviewer (click to set, click again to unset)
router.put(
  '/:id/toggle-reviewer',
  protect,
  requireAdminRole,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const job = await Job.findByPk(req.params.id, {
        include: [{ model: User, as: 'reviewer', attributes: ['id', 'name', 'email'] }],
      });

      if (!job) {
        res.status(404).json({ success: false, message: 'Trabajo no encontrado' });
        return;
      }

      const userId = req.user.id;

      if ((job as any).reviewedBy === userId) {
        // Already reviewed by this user — unset
        await (job as any).update({ reviewedBy: null, reviewedAt: null });
        res.json({ success: true, reviewed: false, reviewedBy: null, reviewedAt: null, reviewer: null });
      } else {
        // Set reviewer
        await (job as any).update({ reviewedBy: userId, reviewedAt: new Date() });
        res.json({
          success: true,
          reviewed: true,
          reviewedBy: userId,
          reviewedAt: new Date(),
          reviewer: { id: req.user.id, name: req.user.name },
        });
      }
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

/**
 * GET /api/admin/jobs/:id/payment
 * Publication payment + proof details for a job (admin view on the publication page)
 */
router.get(
  '/:id/payment',
  protect,
  requireAdminRole,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      if (!isValidUUID(id)) {
        res.status(400).json({ success: false, message: 'ID inválido' });
        return;
      }

      const job = await Job.findByPk(id, {
        include: [{ model: User, as: 'client', attributes: ['id', 'name', 'email', 'avatar'] }],
      });
      if (!job) {
        res.status(404).json({ success: false, message: 'Trabajo no encontrado' });
        return;
      }

      let payment: any = null;
      let proof: any = null;
      if (job.publicationPaymentId) {
        const p = await Payment.findByPk(job.publicationPaymentId);
        if (p) {
          payment = {
            id: p.id,
            status: p.status,
            amount: Number((p as any).amount) || 0,
            platformFee: Number((p as any).platformFee) || 0,
            platformFeePercentage: Number((p as any).platformFeePercentage) || 0,
            paymentType: (p as any).paymentType,
            paymentMethod: (p as any).paymentMethod,
            mercadopagoPaymentId: (p as any).mercadopagoPaymentId,
            description: (p as any).description,
            createdAt: p.createdAt,
          };
          const pr = await PaymentProof.findOne({
            where: { paymentId: p.id, isActive: true },
            order: [['uploadedAt', 'DESC']],
          });
          if (pr) {
            proof = {
              id: pr.id,
              fileUrl: pr.fileUrl,
              fileType: pr.fileType,
              fileName: pr.fileName,
              status: pr.status,
              uploadedAt: pr.uploadedAt,
            };
          }
        }
      }

      res.json({
        success: true,
        data: {
          jobId: job.id,
          status: job.status,
          price: Number(job.price) || 0,
          publicationPaid: job.publicationPaid,
          publicationPaymentId: job.publicationPaymentId || null,
          client: (job as any).client || null,
          payment,
          proof,
        },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

export default router;
