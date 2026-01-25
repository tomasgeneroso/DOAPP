import request from 'supertest';
import express, { Express } from 'express';
import { Dispute } from '../../server/models/sql/Dispute.model.js';
import { Contract } from '../../server/models/sql/Contract.model.js';
import { Payment } from '../../server/models/sql/Payment.model.js';
import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import jwt from 'jsonwebtoken';

describe('Admin Dispute Routes', () => {
  let app: Express;
  let adminToken: string;
  let adminUser: any;
  let clientUser: any;
  let doerUser: any;
  let job: any;
  let contract: any;
  let payment: any;
  let dispute: any;

  beforeAll(async () => {
    app = express();
    app.use(express.json());

    const adminDisputeRoutes = await import('../../server/routes/admin/disputes.js');
    app.use('/api/admin/disputes', adminDisputeRoutes.default);
  });

  beforeEach(async () => {
    // Create admin user
    adminUser = await User.create({
      email: 'admin@test.com',
      name: 'Admin User',
      password: 'adminpass123',
      role: 'super_admin',
    });

    // Create client and doer
    clientUser = await User.create({
      email: 'client@test.com',
      name: 'Test Client',
      password: 'password123',
      role: 'client',
    });

    doerUser = await User.create({
      email: 'doer@test.com',
      name: 'Test Doer',
      password: 'password123',
      role: 'doer',
    });

    // Create job
    job = await Job.create({
      title: 'Test Job',
      description: 'Test description',
      price: 10000,
      client: clientUser._id,
      category: 'development',
      status: 'in_progress',
    });

    // Create contract
    contract = await Contract.create({
      job: job._id,
      client: clientUser._id,
      doer: doerUser._id,
      price: 10000,
      status: 'in_progress',
      paymentStatus: 'escrow',
    });

    // Create payment
    payment = await Payment.create({
      contractId: contract._id,
      userId: clientUser._id,
      amount: 100,
      amountARS: 10000,
      currency: 'ARS',
      status: 'held_escrow',
      paymentType: 'escrow_deposit',
      mercadopagoPaymentId: 'MP-12345',
    });

    // Create dispute
    dispute = await Dispute.create({
      contractId: contract._id,
      paymentId: payment._id,
      initiatedBy: clientUser._id,
      against: doerUser._id,
      reason: 'Work not completed',
      description: 'The work was not delivered on time',
      category: 'incomplete_work',
      status: 'open',
      priority: 'medium',
    });

    // Generate admin token
    adminToken = jwt.sign(
      { _id: adminUser._id, email: adminUser.email, role: 'super_admin' },
      process.env.JWT_SECRET || 'test-secret'
    );
  });

  describe('GET /api/admin/disputes', () => {
    it('should return all disputes for admin', async () => {
      const response = await request(app)
        .get('/api/admin/disputes')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.pagination).toBeDefined();
    });

    it('should filter disputes by status', async () => {
      const response = await request(app)
        .get('/api/admin/disputes?status=open')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.every((d: any) => d.status === 'open')).toBe(true);
    });

    it('should filter disputes by priority', async () => {
      const response = await request(app)
        .get('/api/admin/disputes?priority=medium')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.every((d: any) => d.priority === 'medium')).toBe(true);
    });

    it('should paginate results', async () => {
      // Create multiple disputes
      for (let i = 0; i < 25; i++) {
        await Dispute.create({
          contractId: contract._id,
          paymentId: payment._id,
          initiatedBy: clientUser._id,
          against: doerUser._id,
          reason: `Dispute ${i}`,
          description: `Description ${i}`,
          category: 'quality_issues',
          status: 'open',
        });
      }

      const response = await request(app)
        .get('/api/admin/disputes?page=1&limit=10')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.data.length).toBeLessThanOrEqual(10);
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(10);
    });
  });

  describe('PUT /api/admin/disputes/:id/assign', () => {
    it('should assign dispute to admin', async () => {
      const response = await request(app)
        .put(`/api/admin/disputes/${dispute._id}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ assignedTo: adminUser._id.toString() })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.assignedTo).toBeDefined();
      expect(response.body.data.status).toBe('in_review');
    });

    it('should add log entry when assigning', async () => {
      const response = await request(app)
        .put(`/api/admin/disputes/${dispute._id}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ assignedTo: adminUser._id.toString() })
        .expect(200);

      expect(response.body.data.logs.length).toBeGreaterThan(0);
      expect(response.body.data.logs[0].action).toContain('asignada');
    });
  });

  describe('PUT /api/admin/disputes/:id/priority', () => {
    it('should update dispute priority', async () => {
      const response = await request(app)
        .put(`/api/admin/disputes/${dispute._id}/priority`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ priority: 'urgent' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.priority).toBe('urgent');
    });

    it('should reject invalid priority values', async () => {
      const response = await request(app)
        .put(`/api/admin/disputes/${dispute._id}/priority`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ priority: 'invalid_priority' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should add log entry when updating priority', async () => {
      const response = await request(app)
        .put(`/api/admin/disputes/${dispute._id}/priority`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ priority: 'high' })
        .expect(200);

      expect(response.body.data.logs.length).toBeGreaterThan(0);
      expect(response.body.data.logs[0].action).toContain('Prioridad actualizada');
    });
  });

  describe('POST /api/admin/disputes/:id/resolve', () => {
    it('should resolve dispute with full_release', async () => {
      const response = await request(app)
        .post(`/api/admin/disputes/${dispute._id}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          resolution: 'Work was completed satisfactorily',
          resolutionType: 'full_release',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('resolved_released');
      expect(response.body.data.resolutionType).toBe('full_release');

      // Verify contract status updated
      const updatedContract = await Contract.findByPk(contract._id);
      expect(updatedContract?.status).toBe('completed');
      expect(updatedContract?.paymentStatus).toBe('released');

      // Verify payment status updated
      const updatedPayment = await Payment.findByPk(payment._id);
      expect(updatedPayment?.status).toBe('completed');
    });

    it('should resolve dispute with full_refund', async () => {
      const response = await request(app)
        .post(`/api/admin/disputes/${dispute._id}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          resolution: 'Client is right, work was not delivered',
          resolutionType: 'full_refund',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('resolved_refunded');

      // Verify contract cancelled
      const updatedContract = await Contract.findByPk(contract._id);
      expect(updatedContract?.status).toBe('cancelled');
      expect(updatedContract?.paymentStatus).toBe('refunded');

      // Verify platform fee NOT refunded
      expect(response.body.data.platformFeeRefunded).toBe(false);
    });

    it('should resolve dispute with partial_refund', async () => {
      const response = await request(app)
        .post(`/api/admin/disputes/${dispute._id}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          resolution: 'Partial work completed',
          resolutionType: 'partial_refund',
          refundAmount: 5000, // 50% refund
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('resolved_partial');
      expect(response.body.data.refundAmount).toBe(5000);
    });

    it('should reject invalid resolution types', async () => {
      const response = await request(app)
        .post(`/api/admin/disputes/${dispute._id}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          resolution: 'Test',
          resolutionType: 'invalid_type',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should require resolution text', async () => {
      const response = await request(app)
        .post(`/api/admin/disputes/${dispute._id}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          resolutionType: 'full_release',
          // Missing resolution
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should add log entry when resolving', async () => {
      const response = await request(app)
        .post(`/api/admin/disputes/${dispute._id}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          resolution: 'Resolved',
          resolutionType: 'full_release',
        })
        .expect(200);

      expect(response.body.data.logs.length).toBeGreaterThan(0);
      expect(response.body.data.logs.some((log: any) => log.action.includes('resuelta'))).toBe(
        true
      );
    });
  });

  describe('POST /api/admin/disputes/:id/note', () => {
    it('should add admin note to dispute', async () => {
      const response = await request(app)
        .post(`/api/admin/disputes/${dispute._id}/note`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ note: 'Admin note: investigating this case' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.logs.length).toBeGreaterThan(0);
    });

    it('should reject empty notes', async () => {
      const response = await request(app)
        .post(`/api/admin/disputes/${dispute._id}/note`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ note: '' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/admin/disputes/stats/overview', () => {
    beforeEach(async () => {
      // Create diverse disputes
      await Dispute.bulkCreate([
        {
          contractId: contract.id,
          paymentId: payment.id,
          initiatedBy: clientUser.id,
          against: doerUser.id,
          reason: 'Open dispute',
          description: 'Description',
          category: 'quality_issues',
          status: 'open',
          priority: 'high',
        },
        {
          contractId: contract.id,
          paymentId: payment.id,
          initiatedBy: doerUser.id,
          against: clientUser.id,
          reason: 'In review dispute',
          description: 'Description',
          category: 'payment_issues',
          status: 'in_review',
          priority: 'urgent',
        },
        {
          contractId: contract.id,
          paymentId: payment.id,
          initiatedBy: clientUser.id,
          against: doerUser.id,
          reason: 'Resolved dispute',
          description: 'Description',
          category: 'other',
          status: 'resolved_released',
          priority: 'low',
          resolutionType: 'full_release',
        },
      ]);
    });

    it('should return dispute statistics', async () => {
      const response = await request(app)
        .get('/api/admin/disputes/stats/overview')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('total');
      expect(response.body.data).toHaveProperty('open');
      expect(response.body.data).toHaveProperty('inReview');
      expect(response.body.data).toHaveProperty('resolved');
      expect(response.body.data).toHaveProperty('byPriority');
      expect(response.body.data).toHaveProperty('byResolutionType');
    });

    it('should correctly count disputes by status', async () => {
      const response = await request(app)
        .get('/api/admin/disputes/stats/overview')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.data.total).toBeGreaterThan(0);
      expect(response.body.data.open).toBeGreaterThan(0);
      expect(response.body.data.inReview).toBeGreaterThan(0);
      expect(response.body.data.resolved).toBeGreaterThan(0);
    });
  });

  describe('Authorization', () => {
    let regularUserToken: string;

    beforeEach(async () => {
      const regularUser = await User.create({
        email: 'regular@test.com',
        name: 'Regular User',
        password: 'password123',
        role: 'client',
      });

      regularUserToken = jwt.sign(
        { id: regularUser.id, email: regularUser.email, role: 'client' },
        process.env.JWT_SECRET || 'test-secret'
      );
    });

    it('should reject non-admin users', async () => {
      const response = await request(app)
        .get('/api/admin/disputes')
        .set('Authorization', `Bearer ${regularUserToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
    });

    it('should allow super_admin access', async () => {
      const response = await request(app)
        .get('/api/admin/disputes')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });
});
