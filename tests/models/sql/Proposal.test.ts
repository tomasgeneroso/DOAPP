/**
 * Proposal Model Tests - PostgreSQL/Sequelize
 *
 * Tests comprehensive proposal functionality including:
 * - Proposal creation with validation
 * - Status workflow (pending, approved, rejected, withdrawn)
 * - Counter-offer support
 * - Unique constraint (one proposal per freelancer per job)
 * - Relationships with User and Job
 */

import 'reflect-metadata';
import { Proposal } from '../../../server/models/sql/Proposal.model.js';
import { User } from '../../../server/models/sql/User.model.js';
import { Job } from '../../../server/models/sql/Job.model.js';
import { sequelize } from '../../../server/config/database.js';

describe('Proposal Model - SQL', () => {
  let client: User;
  let freelancer: User;
  let job: Job;

  beforeEach(async () => {
    // Clean tables
    await sequelize.query('TRUNCATE TABLE "proposals" RESTART IDENTITY CASCADE');
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

    freelancer = await User.create({
      email: 'freelancer@test.com',
      username: 'freelancer',
      passwordHash: 'hash456',
      name: 'Freelancer User',
      firstName: 'Freelancer',
      lastName: 'User',
    });

    // Create test job
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);

    job = await Job.create({
      title: 'Test Job',
      summary: 'A test job',
      description: 'Test description',
      price: 10000,
      category: 'technology',
      location: 'Buenos Aires',
      clientId: client.id,
      startDate: tomorrow,
      endDate: nextWeek,
    });
  });

  afterAll(async () => {
    await sequelize.query('TRUNCATE TABLE "proposals" RESTART IDENTITY CASCADE');
    await sequelize.query('TRUNCATE TABLE "jobs" RESTART IDENTITY CASCADE');
    await sequelize.query('TRUNCATE TABLE "users" RESTART IDENTITY CASCADE');
  });

  // ============================================
  // CREATION & BASIC FIELDS
  // ============================================

  describe('Creation & Basic Fields', () => {
    it('should create a proposal with required fields', async () => {
      const proposal = await Proposal.create({
        jobId: job.id,
        freelancerId: freelancer.id,
        clientId: client.id,
        coverLetter: 'I am interested in this job and have 5 years of experience.',
        proposedPrice: 10000,
        estimatedDuration: 7,
      });

      expect(proposal.id).toBeDefined();
      expect(proposal.jobId).toBe(job.id);
      expect(proposal.freelancerId).toBe(freelancer.id);
      expect(proposal.clientId).toBe(client.id);
      expect(proposal.coverLetter).toBe('I am interested in this job and have 5 years of experience.');
      expect(parseFloat(proposal.proposedPrice as any)).toBe(10000);
      expect(proposal.estimatedDuration).toBe(7);
      expect(proposal.status).toBe('pending'); // default
      expect(proposal.isCounterOffer).toBe(false); // default
    });

    it('should enforce required fields', async () => {
      await expect(
        Proposal.create({
          jobId: job.id,
          freelancerId: freelancer.id,
          clientId: client.id,
          // missing coverLetter
          proposedPrice: 10000,
          estimatedDuration: 7,
        })
      ).rejects.toThrow();
    });

    it('should validate cover letter length', async () => {
      await expect(
        Proposal.create({
          jobId: job.id,
          freelancerId: freelancer.id,
          clientId: client.id,
          coverLetter: 'a'.repeat(1001), // exceeds 1000 chars
          proposedPrice: 10000,
          estimatedDuration: 7,
        })
      ).rejects.toThrow();
    });

    it('should reject empty cover letter', async () => {
      await expect(
        Proposal.create({
          jobId: job.id,
          freelancerId: freelancer.id,
          clientId: client.id,
          coverLetter: '',
          proposedPrice: 10000,
          estimatedDuration: 7,
        })
      ).rejects.toThrow();
    });

    it('should validate minimum estimated duration', async () => {
      await expect(
        Proposal.create({
          jobId: job.id,
          freelancerId: freelancer.id,
          clientId: client.id,
          coverLetter: 'I am interested',
          proposedPrice: 10000,
          estimatedDuration: 0, // must be at least 1
        })
      ).rejects.toThrow();
    });

    it('should validate non-negative price', async () => {
      await expect(
        Proposal.create({
          jobId: job.id,
          freelancerId: freelancer.id,
          clientId: client.id,
          coverLetter: 'I am interested',
          proposedPrice: -100,
          estimatedDuration: 7,
        })
      ).rejects.toThrow();
    });
  });

  // ============================================
  // UNIQUE CONSTRAINT
  // ============================================

  describe('Unique Constraint', () => {
    it('should enforce one proposal per freelancer per job', async () => {
      // First proposal
      await Proposal.create({
        jobId: job.id,
        freelancerId: freelancer.id,
        clientId: client.id,
        coverLetter: 'First proposal',
        proposedPrice: 10000,
        estimatedDuration: 7,
      });

      // Attempt second proposal from same freelancer
      await expect(
        Proposal.create({
          jobId: job.id,
          freelancerId: freelancer.id,
          clientId: client.id,
          coverLetter: 'Second proposal attempt',
          proposedPrice: 9000,
          estimatedDuration: 5,
        })
      ).rejects.toThrow();
    });

    it('should allow same freelancer to apply to different jobs', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      const job2 = await Job.create({
        title: 'Another Job',
        summary: 'Different job',
        description: 'Description',
        price: 5000,
        category: 'design',
        location: 'Córdoba',
        clientId: client.id,
        startDate: tomorrow,
        endDate: nextWeek,
      });

      // Proposal to first job
      const proposal1 = await Proposal.create({
        jobId: job.id,
        freelancerId: freelancer.id,
        clientId: client.id,
        coverLetter: 'Proposal for job 1',
        proposedPrice: 10000,
        estimatedDuration: 7,
      });

      // Proposal to second job
      const proposal2 = await Proposal.create({
        jobId: job2.id,
        freelancerId: freelancer.id,
        clientId: client.id,
        coverLetter: 'Proposal for job 2',
        proposedPrice: 5000,
        estimatedDuration: 3,
      });

      expect(proposal1.id).toBeDefined();
      expect(proposal2.id).toBeDefined();
      expect(proposal1.id).not.toBe(proposal2.id);
    });

    it('should allow different freelancers to apply to same job', async () => {
      const freelancer2 = await User.create({
        email: 'freelancer2@test.com',
        username: 'freelancer2',
        passwordHash: 'hash789',
        name: 'Freelancer Two',
        firstName: 'Freelancer',
        lastName: 'Two',
      });

      // First freelancer's proposal
      const proposal1 = await Proposal.create({
        jobId: job.id,
        freelancerId: freelancer.id,
        clientId: client.id,
        coverLetter: 'Proposal from freelancer 1',
        proposedPrice: 10000,
        estimatedDuration: 7,
      });

      // Second freelancer's proposal
      const proposal2 = await Proposal.create({
        jobId: job.id,
        freelancerId: freelancer2.id,
        clientId: client.id,
        coverLetter: 'Proposal from freelancer 2',
        proposedPrice: 9500,
        estimatedDuration: 6,
      });

      expect(proposal1.id).toBeDefined();
      expect(proposal2.id).toBeDefined();
      expect(proposal1.id).not.toBe(proposal2.id);
    });
  });

  // ============================================
  // STATUS WORKFLOW
  // ============================================

  describe('Status Workflow', () => {
    it('should start as pending status', async () => {
      const proposal = await Proposal.create({
        jobId: job.id,
        freelancerId: freelancer.id,
        clientId: client.id,
        coverLetter: 'I am interested',
        proposedPrice: 10000,
        estimatedDuration: 7,
      });

      expect(proposal.status).toBe('pending');
      expect(proposal.isPending()).toBe(true);
    });

    it('should approve a pending proposal', async () => {
      const proposal = await Proposal.create({
        jobId: job.id,
        freelancerId: freelancer.id,
        clientId: client.id,
        coverLetter: 'I am interested',
        proposedPrice: 10000,
        estimatedDuration: 7,
      });

      await proposal.approve();

      expect(proposal.status).toBe('approved');
      expect(proposal.isApproved()).toBe(true);
    });

    it('should reject a pending proposal with reason', async () => {
      const proposal = await Proposal.create({
        jobId: job.id,
        freelancerId: freelancer.id,
        clientId: client.id,
        coverLetter: 'I am interested',
        proposedPrice: 10000,
        estimatedDuration: 7,
      });

      await proposal.reject('Not enough experience');

      expect(proposal.status).toBe('rejected');
      expect(proposal.isRejected()).toBe(true);
      expect(proposal.rejectionReason).toBe('Not enough experience');
    });

    it('should reject a proposal without reason', async () => {
      const proposal = await Proposal.create({
        jobId: job.id,
        freelancerId: freelancer.id,
        clientId: client.id,
        coverLetter: 'I am interested',
        proposedPrice: 10000,
        estimatedDuration: 7,
      });

      await proposal.reject();

      expect(proposal.status).toBe('rejected');
      expect(proposal.rejectionReason).toBeUndefined();
    });

    it('should withdraw a pending proposal with reason', async () => {
      const proposal = await Proposal.create({
        jobId: job.id,
        freelancerId: freelancer.id,
        clientId: client.id,
        coverLetter: 'I am interested',
        proposedPrice: 10000,
        estimatedDuration: 7,
      });

      await proposal.withdraw('Found a better opportunity');

      expect(proposal.status).toBe('withdrawn');
      expect(proposal.withdrawnReason).toBe('Found a better opportunity');
    });

    it('should throw error when approving non-pending proposal', async () => {
      const proposal = await Proposal.create({
        jobId: job.id,
        freelancerId: freelancer.id,
        clientId: client.id,
        coverLetter: 'I am interested',
        proposedPrice: 10000,
        estimatedDuration: 7,
        status: 'rejected',
      });

      await expect(proposal.approve()).rejects.toThrow('Only pending proposals can be approved');
    });

    it('should throw error when rejecting non-pending proposal', async () => {
      const proposal = await Proposal.create({
        jobId: job.id,
        freelancerId: freelancer.id,
        clientId: client.id,
        coverLetter: 'I am interested',
        proposedPrice: 10000,
        estimatedDuration: 7,
        status: 'approved',
      });

      await expect(proposal.reject('reason')).rejects.toThrow('Only pending proposals can be rejected');
    });

    it('should throw error when withdrawing non-pending proposal', async () => {
      const proposal = await Proposal.create({
        jobId: job.id,
        freelancerId: freelancer.id,
        clientId: client.id,
        coverLetter: 'I am interested',
        proposedPrice: 10000,
        estimatedDuration: 7,
        status: 'approved',
      });

      await expect(proposal.withdraw('reason')).rejects.toThrow('Only pending proposals can be withdrawn');
    });
  });

  // ============================================
  // COUNTER-OFFER
  // ============================================

  describe('Counter-Offer', () => {
    it('should create proposal as counter-offer', async () => {
      const proposal = await Proposal.create({
        jobId: job.id,
        freelancerId: freelancer.id,
        clientId: client.id,
        coverLetter: 'I can do it for a lower price',
        proposedPrice: 8000,
        estimatedDuration: 7,
        isCounterOffer: true,
        originalJobPrice: 10000,
      });

      expect(proposal.isCounterOffer).toBe(true);
      expect(parseFloat(proposal.originalJobPrice as any)).toBe(10000);
      expect(parseFloat(proposal.proposedPrice as any)).toBe(8000);
    });

    it('should detect different price from original', async () => {
      const proposal = await Proposal.create({
        jobId: job.id,
        freelancerId: freelancer.id,
        clientId: client.id,
        coverLetter: 'Counter offer',
        proposedPrice: 8000,
        estimatedDuration: 7,
        isCounterOffer: true,
        originalJobPrice: 10000,
      });

      expect(proposal.isDifferentPrice()).toBe(true);
    });

    it('should return false for same price', async () => {
      const proposal = await Proposal.create({
        jobId: job.id,
        freelancerId: freelancer.id,
        clientId: client.id,
        coverLetter: 'Agreeing with price',
        proposedPrice: 10000,
        estimatedDuration: 7,
        originalJobPrice: 10000,
      });

      expect(proposal.isDifferentPrice()).toBe(false);
    });

    it('should return false when no original price set', async () => {
      const proposal = await Proposal.create({
        jobId: job.id,
        freelancerId: freelancer.id,
        clientId: client.id,
        coverLetter: 'No counter offer',
        proposedPrice: 10000,
        estimatedDuration: 7,
      });

      expect(proposal.isDifferentPrice()).toBe(false);
    });
  });

  // ============================================
  // RELATIONSHIPS
  // ============================================

  describe('Relationships', () => {
    it('should belong to job', async () => {
      const proposal = await Proposal.create({
        jobId: job.id,
        freelancerId: freelancer.id,
        clientId: client.id,
        coverLetter: 'I am interested',
        proposedPrice: 10000,
        estimatedDuration: 7,
      });

      const found = await Proposal.findByPk(proposal.id, {
        include: [Job],
      });

      expect(found?.job).toBeDefined();
      expect(found?.job?.title).toBe('Test Job');
    });

    it('should belong to freelancer', async () => {
      const proposal = await Proposal.create({
        jobId: job.id,
        freelancerId: freelancer.id,
        clientId: client.id,
        coverLetter: 'I am interested',
        proposedPrice: 10000,
        estimatedDuration: 7,
      });

      const found = await Proposal.findByPk(proposal.id, {
        include: [{ model: User, as: 'freelancer' }],
      });

      expect(found?.freelancer).toBeDefined();
      expect(found?.freelancer?.email).toBe('freelancer@test.com');
    });

    it('should belong to client', async () => {
      const proposal = await Proposal.create({
        jobId: job.id,
        freelancerId: freelancer.id,
        clientId: client.id,
        coverLetter: 'I am interested',
        proposedPrice: 10000,
        estimatedDuration: 7,
      });

      const found = await Proposal.findByPk(proposal.id, {
        include: [{ model: User, as: 'client' }],
      });

      expect(found?.client).toBeDefined();
      expect(found?.client?.email).toBe('client@test.com');
    });
  });

  // ============================================
  // PRICING
  // ============================================

  describe('Pricing', () => {
    it('should store price as decimal', async () => {
      const proposal = await Proposal.create({
        jobId: job.id,
        freelancerId: freelancer.id,
        clientId: client.id,
        coverLetter: 'I am interested',
        proposedPrice: 12500.50,
        estimatedDuration: 7,
      });

      expect(parseFloat(proposal.proposedPrice as any)).toBe(12500.50);
    });

    it('should allow zero price', async () => {
      const proposal = await Proposal.create({
        jobId: job.id,
        freelancerId: freelancer.id,
        clientId: client.id,
        coverLetter: 'Pro bono work',
        proposedPrice: 0,
        estimatedDuration: 7,
      });

      expect(parseFloat(proposal.proposedPrice as any)).toBe(0);
    });
  });

  // ============================================
  // VALIDATION
  // ============================================

  describe('Validation', () => {
    it('should validate rejection reason length', async () => {
      const proposal = await Proposal.create({
        jobId: job.id,
        freelancerId: freelancer.id,
        clientId: client.id,
        coverLetter: 'I am interested',
        proposedPrice: 10000,
        estimatedDuration: 7,
      });

      await expect(
        proposal.update({ rejectionReason: 'a'.repeat(501) })
      ).rejects.toThrow();
    });

    it('should validate cancellation reason length', async () => {
      const proposal = await Proposal.create({
        jobId: job.id,
        freelancerId: freelancer.id,
        clientId: client.id,
        coverLetter: 'I am interested',
        proposedPrice: 10000,
        estimatedDuration: 7,
      });

      await expect(
        proposal.update({ cancellationReason: 'a'.repeat(501) })
      ).rejects.toThrow();
    });

    it('should validate withdrawn reason length', async () => {
      const proposal = await Proposal.create({
        jobId: job.id,
        freelancerId: freelancer.id,
        clientId: client.id,
        coverLetter: 'I am interested',
        proposedPrice: 10000,
        estimatedDuration: 7,
      });

      await expect(
        proposal.update({ withdrawnReason: 'a'.repeat(501) })
      ).rejects.toThrow();
    });
  });
});
