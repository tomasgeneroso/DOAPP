import express, { Response } from "express";
import { body, param, validationResult } from "express-validator";
import { JobTask } from "../models/sql/JobTask.model.js";
import { Job } from "../models/sql/Job.model.js";
import { Contract } from "../models/sql/Contract.model.js";
import { User } from "../models/sql/User.model.js";
import { protect } from "../middleware/auth.js";
import type { AuthRequest } from "../types/index.js";
import { socketService } from "../index.js";
import { Op } from 'sequelize';

const router = express.Router({ mergeParams: true }); // mergeParams to get :jobId from parent router

/**
 * Helper: Check if user is job owner (client)
 */
const isJobOwner = (job: Job, userId: string): boolean => {
  return job.clientId === userId;
};

/**
 * Helper: Check if user is a worker on this job
 */
const isJobWorker = async (job: Job, userId: string): Promise<boolean> => {
  // Check if user is the assigned doer
  if (job.doerId === userId) return true;

  // Check if user is in selectedWorkers array (for multi-worker jobs)
  if (job.selectedWorkers && Array.isArray(job.selectedWorkers)) {
    if (job.selectedWorkers.includes(userId)) return true;
  }

  // Check if user has an active contract for this job
  const contract = await Contract.findOne({
    where: {
      jobId: job.id,
      doerId: userId,
      status: { [Op.in]: ['active', 'in_progress', 'pending'] }
    }
  });

  return !!contract;
};

/**
 * Helper: Get all tasks for a job with unlock status
 */
const getTasksWithStatus = async (jobId: string): Promise<any[]> => {
  try {
    // Simple query without includes for reliability
    const tasks = await JobTask.findAll({
      where: { jobId },
      order: [['orderIndex', 'ASC']],
    });

    // Manually fetch user data if needed
    const tasksWithData = await Promise.all(tasks.map(async (task) => {
      const taskData = task.toJSON();
      taskData.isUnlocked = task.isUnlocked(tasks);

      // Fetch createdBy user if present
      if (task.createdById) {
        const createdByUser = await User.findByPk(task.createdById, {
          attributes: ['id', 'name', 'avatar']
        });
        taskData.createdBy = createdByUser?.toJSON() || null;
      }

      // Fetch completedBy user if present
      if (task.completedById) {
        const completedByUser = await User.findByPk(task.completedById, {
          attributes: ['id', 'name', 'avatar']
        });
        taskData.completedBy = completedByUser?.toJSON() || null;
      }

      return taskData;
    }));

    return tasksWithData;
  } catch (error: any) {
    console.error(`❌ Error getting tasks for job ${jobId}:`, error.message);
    return [];
  }
};

// @route   GET /api/jobs/:jobId/tasks
// @desc    Get all tasks for a job
// @access  Private (job owner or worker)
router.get("/", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { jobId } = req.params;

    const job = await Job.findByPk(jobId);
    if (!job) {
      res.status(404).json({ success: false, message: "Trabajo no encontrado" });
      return;
    }

    // Check access: must be job owner or worker
    const isOwner = isJobOwner(job, req.user.id);
    const isWorker = await isJobWorker(job, req.user.id);

    if (!isOwner && !isWorker) {
      res.status(403).json({
        success: false,
        message: "No tienes permiso para ver las tareas de este trabajo"
      });
      return;
    }

    const tasks = await getTasksWithStatus(jobId);
    const progress = JobTask.getProgressPercentage(tasks);

    res.json({
      success: true,
      tasks,
      progress,
      totalTasks: tasks.length,
      completedTasks: tasks.filter(t => t.status === 'completed').length,
      isOwner,
      isWorker,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor"
    });
  }
});

// @route   POST /api/jobs/:jobId/tasks
// @desc    Create a new task (job owner only)
// @access  Private (job owner only)
router.post(
  "/",
  protect,
  [
    body("title").trim().notEmpty().withMessage("El título es requerido").isLength({ max: 200 }),
    body("description").optional().trim(),
    body("orderIndex").optional().isInt({ min: 0 }),
    body("requiresPreviousCompletion").optional().isBoolean(),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ success: false, errors: errors.array() });
        return;
      }

      const { jobId } = req.params;
      const { title, description, orderIndex, requiresPreviousCompletion = true } = req.body;

      const job = await Job.findByPk(jobId);
      if (!job) {
        res.status(404).json({ success: false, message: "Trabajo no encontrado" });
        return;
      }

      // Only job owner can create tasks
      if (!isJobOwner(job, req.user.id)) {
        res.status(403).json({
          success: false,
          message: "Solo el dueño del trabajo puede crear tareas"
        });
        return;
      }

      // Determine order index
      let finalOrderIndex = orderIndex;
      if (finalOrderIndex === undefined) {
        // Get the max orderIndex and add 1
        const maxTask = await JobTask.findOne({
          where: { jobId },
          order: [['orderIndex', 'DESC']]
        });
        finalOrderIndex = maxTask ? maxTask.orderIndex + 1 : 0;
      }

      // Create task
      const task = await JobTask.create({
        jobId,
        createdById: req.user.id,
        title,
        description,
        orderIndex: finalOrderIndex,
        requiresPreviousCompletion,
        status: 'pending',
      });

      // Get updated tasks with status
      const tasks = await getTasksWithStatus(jobId);
      const progress = JobTask.getProgressPercentage(tasks);

      // Notify workers about new task via socket
      socketService.notifyJobUpdate(jobId, req.user.id, {
        action: 'task_created',
        task: task.toJSON(),
        tasks,
        progress,
      });

      res.status(201).json({
        success: true,
        message: "Tarea creada exitosamente",
        task: task.toJSON(),
        tasks,
        progress,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor"
      });
    }
  }
);

// @route   PUT /api/jobs/:jobId/tasks/:taskId
// @desc    Update a task (owner can edit all, worker can change status)
// @access  Private
router.put(
  "/:taskId",
  protect,
  [
    param("taskId").isUUID(),
    body("title").optional().trim().isLength({ min: 1, max: 200 }),
    body("description").optional().trim(),
    body("status").optional().isIn(['pending', 'in_progress', 'completed']),
    body("orderIndex").optional().isInt({ min: 0 }),
    body("requiresPreviousCompletion").optional().isBoolean(),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ success: false, errors: errors.array() });
        return;
      }

      const { jobId, taskId } = req.params;
      const { title, description, status, orderIndex, requiresPreviousCompletion } = req.body;

      const job = await Job.findByPk(jobId);
      if (!job) {
        res.status(404).json({ success: false, message: "Trabajo no encontrado" });
        return;
      }

      const task = await JobTask.findOne({
        where: { id: taskId, jobId }
      });

      if (!task) {
        res.status(404).json({ success: false, message: "Tarea no encontrada" });
        return;
      }

      const isOwner = isJobOwner(job, req.user.id);
      const isWorker = await isJobWorker(job, req.user.id);

      if (!isOwner && !isWorker) {
        res.status(403).json({
          success: false,
          message: "No tienes permiso para actualizar esta tarea"
        });
        return;
      }

      // Get all tasks to check unlock status
      const allTasks = await JobTask.findAll({
        where: { jobId },
        order: [['orderIndex', 'ASC']]
      });

      // Workers can only change status if task is unlocked
      if (!isOwner && isWorker) {
        // Workers can only update status
        if (title || description || orderIndex !== undefined || requiresPreviousCompletion !== undefined) {
          res.status(403).json({
            success: false,
            message: "Solo puedes cambiar el estado de las tareas"
          });
          return;
        }

        if (status) {
          // Check if task is unlocked
          if (!task.isUnlocked(allTasks)) {
            res.status(400).json({
              success: false,
              message: "Esta tarea está bloqueada. Debes completar las tareas anteriores primero."
            });
            return;
          }

          // Validate status transition
          const validTransitions: { [key: string]: string[] } = {
            'pending': ['in_progress'],
            'in_progress': ['completed', 'pending'],
            'completed': ['in_progress'], // Allow reverting
          };

          if (!validTransitions[task.status]?.includes(status)) {
            res.status(400).json({
              success: false,
              message: `No puedes cambiar de "${task.status}" a "${status}"`
            });
            return;
          }
        }
      }

      // Build update object
      const updateData: any = {};

      // Owner can update everything
      if (isOwner) {
        if (title !== undefined) updateData.title = title;
        if (description !== undefined) updateData.description = description;
        if (orderIndex !== undefined) updateData.orderIndex = orderIndex;
        if (requiresPreviousCompletion !== undefined) updateData.requiresPreviousCompletion = requiresPreviousCompletion;
      }

      // Both owner and worker can update status
      if (status !== undefined) {
        updateData.status = status;

        if (status === 'in_progress' && task.status === 'pending') {
          updateData.startedAt = new Date();
        }

        if (status === 'completed') {
          updateData.completedAt = new Date();
          updateData.completedById = req.user.id;
        } else if (task.status === 'completed' && status !== 'completed') {
          // Reverting from completed
          updateData.completedAt = null;
          updateData.completedById = null;
        }
      }

      await task.update(updateData);

      // Get updated tasks with status
      const tasks = await getTasksWithStatus(jobId);
      const progress = JobTask.getProgressPercentage(tasks);

      // Notify about task update via socket
      socketService.notifyJobUpdate(jobId, req.user.id, {
        action: 'task_updated',
        task: task.toJSON(),
        tasks,
        progress,
        updatedBy: req.user.id,
      });

      res.json({
        success: true,
        message: "Tarea actualizada exitosamente",
        task: task.toJSON(),
        tasks,
        progress,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor"
      });
    }
  }
);

// @route   DELETE /api/jobs/:jobId/tasks/:taskId
// @desc    Delete a task (job owner only)
// @access  Private (job owner only)
router.delete(
  "/:taskId",
  protect,
  [param("taskId").isUUID()],
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { jobId, taskId } = req.params;

      const job = await Job.findByPk(jobId);
      if (!job) {
        res.status(404).json({ success: false, message: "Trabajo no encontrado" });
        return;
      }

      // Only job owner can delete tasks
      if (!isJobOwner(job, req.user.id)) {
        res.status(403).json({
          success: false,
          message: "Solo el dueño del trabajo puede eliminar tareas"
        });
        return;
      }

      const task = await JobTask.findOne({
        where: { id: taskId, jobId }
      });

      if (!task) {
        res.status(404).json({ success: false, message: "Tarea no encontrada" });
        return;
      }

      const deletedOrderIndex = task.orderIndex;
      await task.destroy();

      // Reorder remaining tasks to fill the gap
      await JobTask.update(
        { orderIndex: JobTask.sequelize!.literal('order_index - 1') },
        {
          where: {
            jobId,
            orderIndex: { [Op.gt]: deletedOrderIndex }
          }
        }
      );

      // Get updated tasks with status
      const tasks = await getTasksWithStatus(jobId);
      const progress = JobTask.getProgressPercentage(tasks);

      // Notify about task deletion via socket
      socketService.notifyJobUpdate(jobId, req.user.id, {
        action: 'task_deleted',
        taskId,
        tasks,
        progress,
      });

      res.json({
        success: true,
        message: "Tarea eliminada exitosamente",
        tasks,
        progress,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor"
      });
    }
  }
);

// @route   PUT /api/jobs/:jobId/tasks/reorder
// @desc    Reorder tasks (job owner only)
// @access  Private (job owner only)
router.put(
  "/reorder",
  protect,
  [
    body("taskIds").isArray().withMessage("taskIds debe ser un array"),
    body("taskIds.*").isUUID().withMessage("Cada taskId debe ser un UUID válido"),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ success: false, errors: errors.array() });
        return;
      }

      const { jobId } = req.params;
      const { taskIds } = req.body;

      const job = await Job.findByPk(jobId);
      if (!job) {
        res.status(404).json({ success: false, message: "Trabajo no encontrado" });
        return;
      }

      // Only job owner can reorder tasks
      if (!isJobOwner(job, req.user.id)) {
        res.status(403).json({
          success: false,
          message: "Solo el dueño del trabajo puede reordenar tareas"
        });
        return;
      }

      // Verify all taskIds belong to this job
      const existingTasks = await JobTask.findAll({
        where: { jobId },
        attributes: ['id']
      });
      const existingIds = existingTasks.map(t => t.id);

      const invalidIds = taskIds.filter((id: string) => !existingIds.includes(id));
      if (invalidIds.length > 0) {
        res.status(400).json({
          success: false,
          message: "Algunos IDs de tareas no pertenecen a este trabajo"
        });
        return;
      }

      // Update order indices
      for (let i = 0; i < taskIds.length; i++) {
        await JobTask.update(
          { orderIndex: i },
          { where: { id: taskIds[i], jobId } }
        );
      }

      // Get updated tasks with status
      const tasks = await getTasksWithStatus(jobId);
      const progress = JobTask.getProgressPercentage(tasks);

      // Notify about reorder via socket
      socketService.notifyJobUpdate(jobId, req.user.id, {
        action: 'tasks_reordered',
        tasks,
        progress,
      });

      res.json({
        success: true,
        message: "Tareas reordenadas exitosamente",
        tasks,
        progress,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor"
      });
    }
  }
);

export default router;
