import 'reflect-metadata';
import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
  Default,
  AllowNull,
  Index,
} from 'sequelize-typescript';
import { Job } from './Job.model.js';
import { User } from './User.model.js';

/**
 * JobTask Model - PostgreSQL/Sequelize
 *
 * Modelo de tareas asociadas a un trabajo.
 * - El dueño del trabajo (cliente) puede crear/editar/eliminar tareas
 * - Las tareas tienen un orden de ejecución
 * - Las tareas pueden depender de otras (bloqueo secuencial)
 * - 3 estados: pending, in_progress, completed
 */

export type TaskStatus = 'pending' | 'in_progress' | 'completed';

@Table({
  tableName: 'job_tasks',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['job_id'] },
    { fields: ['job_id', 'order_index'] },
    { fields: ['status'] },
    { fields: ['completed_at'] },
  ],
})
export class JobTask extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  id!: string;

  // ============================================
  // RELATIONSHIPS
  // ============================================

  @ForeignKey(() => Job)
  @AllowNull(false)
  @Index
  @Column(DataType.UUID)
  jobId!: string;

  @BelongsTo(() => Job)
  job!: Job;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column(DataType.UUID)
  createdById!: string;

  @BelongsTo(() => User, 'createdById')
  createdBy!: User;

  // ============================================
  // TASK INFORMATION
  // ============================================

  @AllowNull(false)
  @Column({
    type: DataType.STRING(200),
    validate: {
      len: {
        args: [1, 200],
        msg: 'El título de la tarea no puede exceder 200 caracteres',
      },
    },
  })
  title!: string;

  @Column(DataType.TEXT)
  description?: string;

  @Default(0)
  @Column(DataType.INTEGER)
  orderIndex!: number;

  // Optional due date for this task (only used as guide when job.singleDelivery is false)
  @Column(DataType.DATE)
  dueDate?: Date;

  // ============================================
  // STATUS
  // ============================================

  @Default('pending')
  @Column({
    type: DataType.ENUM('pending', 'in_progress', 'completed'),
  })
  status!: TaskStatus;

  @Column(DataType.DATE)
  startedAt?: Date;

  @Column(DataType.DATE)
  completedAt?: Date;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  completedById?: string;

  @BelongsTo(() => User, 'completedById')
  completedBy?: User;

  // ============================================
  // DEPENDENCIES (for sequential unlocking)
  // ============================================

  // If true, this task requires the previous task (by orderIndex) to be completed
  @Default(true)
  @Column(DataType.BOOLEAN)
  requiresPreviousCompletion!: boolean;

  // Optional: specific task ID that must be completed before this one
  @ForeignKey(() => JobTask)
  @Column(DataType.UUID)
  dependsOnTaskId?: string;

  @BelongsTo(() => JobTask, 'dependsOnTaskId')
  dependsOnTask?: JobTask;

  // ============================================
  // TASK CLAIM TRACKING
  // ============================================

  @Default(false)
  @Column(DataType.BOOLEAN)
  isClaimed!: boolean;

  @Column(DataType.DATE)
  claimedAt?: Date;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  claimedBy?: string;

  @BelongsTo(() => User, 'claimedBy')
  claimer?: User;

  @Column(DataType.TEXT)
  claimNotes?: string;

  // ============================================
  // EVIDENCE PHOTOS (required at job start)
  // ============================================

  @Default([])
  @Column(DataType.JSONB)
  evidencePhotos!: string[];

  @Column(DataType.DATE)
  evidenceUploadedAt?: Date;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  evidenceUploadedBy?: string;

  @BelongsTo(() => User, 'evidenceUploadedBy')
  evidenceUploader?: User;

  // ============================================
  // TIMESTAMPS
  // ============================================

  @Column(DataType.DATE)
  createdAt!: Date;

  @Column(DataType.DATE)
  updatedAt!: Date;

  // ============================================
  // VIRTUAL METHODS
  // ============================================

  /**
   * Check if this task is unlocked (can be started)
   * A task is unlocked if:
   * - It's the first task (orderIndex === 0)
   * - OR the previous task is completed
   * - OR requiresPreviousCompletion is false
   */
  isUnlocked(allTasks: JobTask[]): boolean {
    if (!this.requiresPreviousCompletion) {
      return true;
    }

    if (this.orderIndex === 0) {
      return true;
    }

    // Find the previous task
    const previousTask = allTasks.find(t => t.orderIndex === this.orderIndex - 1);
    if (!previousTask) {
      return true; // No previous task found, consider unlocked
    }

    return previousTask.status === 'completed';
  }

  /**
   * Get progress percentage for a list of tasks
   */
  static getProgressPercentage(tasks: JobTask[]): number {
    if (tasks.length === 0) return 0;
    const completedCount = tasks.filter(t => t.status === 'completed').length;
    return Math.round((completedCount / tasks.length) * 100);
  }
}
