/**
 * Job Model Tests - PostgreSQL/Sequelize
 *
 * Tests comprehensive job functionality including:
 * - Job creation with validation
 * - Status management (draft, open, in_progress, completed)
 * - Publication payment workflow
 * - Location and scheduling
 * - Relationships with User
 * - Hooks (date validation, normalization)
 */

import 'reflect-metadata';
import { Job } from '../../../server/models/sql/Job.model.js';
import { User } from '../../../server/models/sql/User.model.js';
import { sequelize } from '../../../server/config/database.js';

describe('Job Model - SQL', () => {
  let client: User;
  let doer: User;

  beforeEach(async () => {
    // Clean tables
    await sequelize.query('TRUNCATE TABLE "jobs" RESTART IDENTITY CASCADE');
    await sequelize.query('TRUNCATE TABLE "users" RESTART IDENTITY CASCADE');

    // Create test users
    client = await User.create({
      email: 'client@test.com',
      username: 'client',
      passwordHash: 'hash123',
      name: 'Client User',
      firstName: 'Client',
      lastName: 'User',
    });

    doer = await User.create({
      email: 'doer@test.com',
      username: 'doer',
      passwordHash: 'hash456',
      name: 'Doer User',
      firstName: 'Doer',
      lastName: 'User',
    });
  });

  afterAll(async () => {
    await sequelize.query('TRUNCATE TABLE "jobs" RESTART IDENTITY CASCADE');
    await sequelize.query('TRUNCATE TABLE "users" RESTART IDENTITY CASCADE');
  });

  // ============================================
  // CREATION & BASIC FIELDS
  // ============================================

  describe('Creation & Basic Fields', () => {
    it('should create a job with required fields', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      const job = await Job.create({
        title: 'Test Job',
        summary: 'A test job for unit tests',
        description: 'This is a detailed description of the test job',
        price: 10000,
        category: 'technology',
        location: 'Buenos Aires',
        clientId: client.id,
        startDate: tomorrow,
        endDate: nextWeek,
      });

      expect(job.id).toBeDefined();
      expect(job.title).toBe('Test Job');
      expect(job.summary).toBe('A test job for unit tests');
      expect(job.description).toBe('This is a detailed description of the test job');
      expect(parseFloat(job.price as any)).toBe(10000);
      expect(job.category).toBe('technology');
      expect(job.location).toBe('Buenos Aires');
      expect(job.clientId).toBe(client.id);
      expect(job.status).toBe('draft'); // default
      expect(job.urgency).toBe('medium'); // default
      expect(job.experienceLevel).toBe('intermediate'); // default
    });

    it('should enforce required fields', async () => {
      await expect(
        Job.create({
          title: 'Test',
          // missing summary
          description: 'Desc',
          price: 1000,
          category: 'tech',
          location: 'BA',
          clientId: client.id,
        })
      ).rejects.toThrow();
    });

    it('should validate title length', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      await expect(
        Job.create({
          title: 'a'.repeat(101), // exceeds 100 chars
          summary: 'Summary',
          description: 'Description',
          price: 1000,
          category: 'tech',
          location: 'BA',
          clientId: client.id,
          startDate: tomorrow,
          endDate: nextWeek,
        })
      ).rejects.toThrow();
    });

    it('should validate summary length', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      await expect(
        Job.create({
          title: 'Title',
          summary: 'a'.repeat(201), // exceeds 200 chars
          description: 'Description',
          price: 1000,
          category: 'tech',
          location: 'BA',
          clientId: client.id,
          startDate: tomorrow,
          endDate: nextWeek,
        })
      ).rejects.toThrow();
    });

    it('should validate description length', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      await expect(
        Job.create({
          title: 'Title',
          summary: 'Summary',
          description: 'a'.repeat(2001), // exceeds 2000 chars
          price: 1000,
          category: 'tech',
          location: 'BA',
          clientId: client.id,
          startDate: tomorrow,
          endDate: nextWeek,
        })
      ).rejects.toThrow();
    });
  });

  // ============================================
  // PRICING
  // ============================================

  describe('Pricing', () => {
    it('should store price as decimal', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      const job = await Job.create({
        title: 'Paid Job',
        summary: 'A job with specific price',
        description: 'Description',
        price: 12500.50,
        category: 'construction',
        location: 'Córdoba',
        clientId: client.id,
        startDate: tomorrow,
        endDate: nextWeek,
      });

      expect(parseFloat(job.price as any)).toBe(12500.50);
    });

    it('should reject negative prices', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      await expect(
        Job.create({
          title: 'Title',
          summary: 'Summary',
          description: 'Description',
          price: -100,
          category: 'tech',
          location: 'BA',
          clientId: client.id,
          startDate: tomorrow,
          endDate: nextWeek,
        })
      ).rejects.toThrow();
    });
  });

  // ============================================
  // LOCATION & COORDINATES
  // ============================================

  describe('Location & Coordinates', () => {
    it('should store location with coordinates', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      const job = await Job.create({
        title: 'Located Job',
        summary: 'Job with GPS coordinates',
        description: 'Description',
        price: 5000,
        category: 'delivery',
        location: 'Buenos Aires, Argentina',
        latitude: -34.6037,
        longitude: -58.3816,
        clientId: client.id,
        startDate: tomorrow,
        endDate: nextWeek,
      });

      expect(job.location).toBe('Buenos Aires, Argentina');
      expect(parseFloat(job.latitude as any)).toBeCloseTo(-34.6037, 4);
      expect(parseFloat(job.longitude as any)).toBeCloseTo(-58.3816, 4);
    });

    it('should support remote jobs', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      const job = await Job.create({
        title: 'Remote Job',
        summary: 'Work from anywhere',
        description: 'Description',
        price: 8000,
        category: 'design',
        location: 'Remote',
        remoteOk: true,
        clientId: client.id,
        startDate: tomorrow,
        endDate: nextWeek,
      });

      expect(job.remoteOk).toBe(true);
    });

    it('should normalize location (trim whitespace)', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      const job = await Job.create({
        title: '  Spaced Title  ',
        summary: 'Summary',
        description: 'Description',
        price: 1000,
        category: '  tech  ',
        location: '  Buenos Aires  ',
        clientId: client.id,
        startDate: tomorrow,
        endDate: nextWeek,
      });

      expect(job.title).toBe('Spaced Title');
      expect(job.category).toBe('tech');
      expect(job.location).toBe('Buenos Aires');
    });
  });

  // ============================================
  // SCHEDULING
  // ============================================

  describe('Scheduling', () => {
    it('should store start and end dates', async () => {
      const startDate = new Date('2025-12-01');
      const endDate = new Date('2025-12-15');

      const job = await Job.create({
        title: 'Scheduled Job',
        summary: 'Job with specific dates',
        description: 'Description',
        price: 15000,
        category: 'event',
        location: 'Rosario',
        clientId: client.id,
        startDate,
        endDate,
      });

      expect(job.startDate).toEqual(startDate);
      expect(job.endDate).toEqual(endDate);
    });

    it('should reject endDate before startDate', async () => {
      const startDate = new Date('2025-12-15');
      const endDate = new Date('2025-12-01'); // before startDate

      await expect(
        Job.create({
          title: 'Invalid Dates',
          summary: 'Summary',
          description: 'Description',
          price: 1000,
          category: 'tech',
          location: 'BA',
          clientId: client.id,
          startDate,
          endDate,
        })
      ).rejects.toThrow('La fecha de fin debe ser posterior a la fecha de inicio');
    });

    it('should reject endDate equal to startDate', async () => {
      const sameDate = new Date('2025-12-01');

      await expect(
        Job.create({
          title: 'Same Dates',
          summary: 'Summary',
          description: 'Description',
          price: 1000,
          category: 'tech',
          location: 'BA',
          clientId: client.id,
          startDate: sameDate,
          endDate: sameDate,
        })
      ).rejects.toThrow('La fecha de fin debe ser posterior a la fecha de inicio');
    });

    it('should calculate duration in days', async () => {
      const startDate = new Date('2025-12-01');
      const endDate = new Date('2025-12-08'); // 7 days later

      const job = await Job.create({
        title: 'Week Job',
        summary: 'One week duration',
        description: 'Description',
        price: 7000,
        category: 'project',
        location: 'Mendoza',
        clientId: client.id,
        startDate,
        endDate,
      });

      expect(job.getDurationDays()).toBe(7);
    });
  });

  // ============================================
  // STATUS & PRIORITY
  // ============================================

  describe('Status & Priority', () => {
    it('should default to draft status', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      const job = await Job.create({
        title: 'Draft Job',
        summary: 'Not published yet',
        description: 'Description',
        price: 1000,
        category: 'tech',
        location: 'BA',
        clientId: client.id,
        startDate: tomorrow,
        endDate: nextWeek,
      });

      expect(job.status).toBe('draft');
      expect(job.isDraft()).toBe(true);
    });

    it('should support all status values', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      const statuses: Array<'draft' | 'pending_payment' | 'open' | 'in_progress' | 'completed' | 'cancelled'> = [
        'draft',
        'pending_payment',
        'open',
        'in_progress',
        'completed',
        'cancelled',
      ];

      for (const status of statuses) {
        const job = await Job.create({
          title: `Job ${status}`,
          summary: 'Summary',
          description: 'Description',
          price: 1000,
          category: 'tech',
          location: 'BA',
          clientId: client.id,
          startDate: tomorrow,
          endDate: nextWeek,
          status,
        });

        expect(job.status).toBe(status);
      }
    });

    it('should set urgency levels', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      const urgencies: Array<'low' | 'medium' | 'high'> = ['low', 'medium', 'high'];

      for (const urgency of urgencies) {
        const job = await Job.create({
          title: `${urgency} urgency job`,
          summary: 'Summary',
          description: 'Description',
          price: 1000,
          category: 'tech',
          location: 'BA',
          clientId: client.id,
          startDate: tomorrow,
          endDate: nextWeek,
          urgency,
        });

        expect(job.urgency).toBe(urgency);
      }
    });

    it('should set experience levels', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      const levels: Array<'beginner' | 'intermediate' | 'expert'> = ['beginner', 'intermediate', 'expert'];

      for (const level of levels) {
        const job = await Job.create({
          title: `${level} level job`,
          summary: 'Summary',
          description: 'Description',
          price: 1000,
          category: 'tech',
          location: 'BA',
          clientId: client.id,
          startDate: tomorrow,
          endDate: nextWeek,
          experienceLevel: level,
        });

        expect(job.experienceLevel).toBe(level);
      }
    });
  });

  // ============================================
  // MEDIA & REQUIREMENTS
  // ============================================

  describe('Media & Requirements', () => {
    it('should store images array', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      const job = await Job.create({
        title: 'Job with Images',
        summary: 'Has multiple images',
        description: 'Description',
        price: 1000,
        category: 'design',
        location: 'BA',
        clientId: client.id,
        startDate: tomorrow,
        endDate: nextWeek,
        images: ['image1.jpg', 'image2.jpg', 'image3.jpg'],
      });

      expect(job.images).toEqual(['image1.jpg', 'image2.jpg', 'image3.jpg']);
    });

    it('should store tools required', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      const job = await Job.create({
        title: 'Construction Job',
        summary: 'Requires tools',
        description: 'Description',
        price: 5000,
        category: 'construction',
        location: 'BA',
        clientId: client.id,
        startDate: tomorrow,
        endDate: nextWeek,
        toolsRequired: ['hammer', 'drill', 'saw'],
      });

      expect(job.toolsRequired).toEqual(['hammer', 'drill', 'saw']);
    });

    it('should indicate if materials are provided', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      const job = await Job.create({
        title: 'Materials Provided Job',
        summary: 'All materials included',
        description: 'Description',
        price: 3000,
        category: 'repair',
        location: 'BA',
        clientId: client.id,
        startDate: tomorrow,
        endDate: nextWeek,
        materialsProvided: true,
      });

      expect(job.materialsProvided).toBe(true);
    });

    it('should store tags', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      const job = await Job.create({
        title: 'Tagged Job',
        summary: 'Has tags',
        description: 'Description',
        price: 1000,
        category: 'tech',
        location: 'BA',
        clientId: client.id,
        startDate: tomorrow,
        endDate: nextWeek,
        tags: ['urgent', 'remote', 'fulltime'],
      });

      expect(job.tags).toEqual(['urgent', 'remote', 'fulltime']);
    });
  });

  // ============================================
  // RELATIONSHIPS
  // ============================================

  describe('Relationships', () => {
    it('should belong to client user', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      const job = await Job.create({
        title: 'Client Job',
        summary: 'Created by client',
        description: 'Description',
        price: 1000,
        category: 'tech',
        location: 'BA',
        clientId: client.id,
        startDate: tomorrow,
        endDate: nextWeek,
      });

      const found = await Job.findByPk(job.id, {
        include: [{ model: User, as: 'client' }],
      });

      expect(found?.client).toBeDefined();
      expect(found?.client?.email).toBe('client@test.com');
    });

    it('should optionally belong to doer user', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      const job = await Job.create({
        title: 'Assigned Job',
        summary: 'Has assigned doer',
        description: 'Description',
        price: 1000,
        category: 'tech',
        location: 'BA',
        clientId: client.id,
        doerId: doer.id,
        startDate: tomorrow,
        endDate: nextWeek,
      });

      const found = await Job.findByPk(job.id, {
        include: [{ model: User, as: 'doer' }],
      });

      expect(found?.doer).toBeDefined();
      expect(found?.doer?.email).toBe('doer@test.com');
    });
  });

  // ============================================
  // PUBLICATION PAYMENT
  // ============================================

  describe('Publication Payment', () => {
    it('should mark job as published', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      const job = await Job.create({
        title: 'To Publish',
        summary: 'Will be published',
        description: 'Description',
        price: 1000,
        category: 'tech',
        location: 'BA',
        clientId: client.id,
        startDate: tomorrow,
        endDate: nextWeek,
      });

      const paymentId = '550e8400-e29b-41d4-a716-446655440000';
      await job.markAsPublished(paymentId, 500);

      expect(job.publicationPaymentId).toBe(paymentId);
      expect(job.publicationPaid).toBe(true);
      expect(job.publicationPaidAt).toBeDefined();
      expect(parseFloat(job.publicationAmount as any)).toBe(500);
      expect(job.status).toBe('open');
    });

    it('should check if job is published', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      const job = await Job.create({
        title: 'Published Job',
        summary: 'Already published',
        description: 'Description',
        price: 1000,
        category: 'tech',
        location: 'BA',
        clientId: client.id,
        startDate: tomorrow,
        endDate: nextWeek,
        status: 'open',
        publicationPaid: true,
      });

      expect(job.isPublished()).toBe(true);
    });

    it('should return false for unpublished job', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      const job = await Job.create({
        title: 'Draft Job',
        summary: 'Not published',
        description: 'Description',
        price: 1000,
        category: 'tech',
        location: 'BA',
        clientId: client.id,
        startDate: tomorrow,
        endDate: nextWeek,
      });

      expect(job.isPublished()).toBe(false);
    });
  });

  // ============================================
  // STATUS CHECKS
  // ============================================

  describe('Status Checks', () => {
    it('should check if job is available', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      const job = await Job.create({
        title: 'Available Job',
        summary: 'Open and paid',
        description: 'Description',
        price: 1000,
        category: 'tech',
        location: 'BA',
        clientId: client.id,
        startDate: tomorrow,
        endDate: nextWeek,
        status: 'open',
        publicationPaid: true,
      });

      expect(job.isAvailable()).toBe(true);
    });

    it('should return false for unpaid open job', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      const job = await Job.create({
        title: 'Unpaid Job',
        summary: 'Open but not paid',
        description: 'Description',
        price: 1000,
        category: 'tech',
        location: 'BA',
        clientId: client.id,
        startDate: tomorrow,
        endDate: nextWeek,
        status: 'open',
        publicationPaid: false,
      });

      expect(job.isAvailable()).toBe(false);
    });

    it('should check if job is completed', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      const job = await Job.create({
        title: 'Completed Job',
        summary: 'Already done',
        description: 'Description',
        price: 1000,
        category: 'tech',
        location: 'BA',
        clientId: client.id,
        startDate: tomorrow,
        endDate: nextWeek,
        status: 'completed',
      });

      expect(job.isCompleted()).toBe(true);
    });

    it('should check if job is draft', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      const draftJob = await Job.create({
        title: 'Draft',
        summary: 'Summary',
        description: 'Description',
        price: 1000,
        category: 'tech',
        location: 'BA',
        clientId: client.id,
        startDate: tomorrow,
        endDate: nextWeek,
        status: 'draft',
      });

      const pendingJob = await Job.create({
        title: 'Pending Payment',
        summary: 'Summary',
        description: 'Description',
        price: 1000,
        category: 'tech',
        location: 'BA',
        clientId: client.id,
        startDate: tomorrow,
        endDate: nextWeek,
        status: 'pending_payment',
      });

      expect(draftJob.isDraft()).toBe(true);
      expect(pendingJob.isDraft()).toBe(true);
    });
  });

  // ============================================
  // ANALYTICS
  // ============================================

  describe('Analytics', () => {
    it('should track view count', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      const job = await Job.create({
        title: 'Tracked Job',
        summary: 'Views tracked',
        description: 'Description',
        price: 1000,
        category: 'tech',
        location: 'BA',
        clientId: client.id,
        startDate: tomorrow,
        endDate: nextWeek,
      });

      expect(job.views).toBe(0);

      await job.incrementViews();
      expect(job.views).toBe(1);

      await job.incrementViews();
      expect(job.views).toBe(2);
    });
  });

  // ============================================
  // RATING & REVIEW
  // ============================================

  describe('Rating & Review', () => {
    it('should store rating and review', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      const job = await Job.create({
        title: 'Reviewed Job',
        summary: 'Has review',
        description: 'Description',
        price: 1000,
        category: 'tech',
        location: 'BA',
        clientId: client.id,
        startDate: tomorrow,
        endDate: nextWeek,
        rating: 5,
        review: 'Excellent work!',
      });

      expect(job.rating).toBe(5);
      expect(job.review).toBe('Excellent work!');
    });

    it('should validate rating range (1-5)', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      await expect(
        Job.create({
          title: 'Bad Rating',
          summary: 'Summary',
          description: 'Description',
          price: 1000,
          category: 'tech',
          location: 'BA',
          clientId: client.id,
          startDate: tomorrow,
          endDate: nextWeek,
          rating: 6, // exceeds max
        })
      ).rejects.toThrow();
    });

    it('should validate review length', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      await expect(
        Job.create({
          title: 'Long Review',
          summary: 'Summary',
          description: 'Description',
          price: 1000,
          category: 'tech',
          location: 'BA',
          clientId: client.id,
          startDate: tomorrow,
          endDate: nextWeek,
          review: 'a'.repeat(501), // exceeds 500 chars
        })
      ).rejects.toThrow();
    });
  });
});
