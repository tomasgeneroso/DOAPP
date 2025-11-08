import request from 'supertest';
import express, { Express } from 'express';
import { Dispute } from '../../server/models/sql/Dispute.model.js';
import { Contract } from '../../server/models/sql/Contract.model.js';
import { Payment } from '../../server/models/sql/Payment.model.js';
import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import jwt from 'jsonwebtoken';

/**
 * Integration Test: Complete Dispute Flow
 *
 * This test simulates the entire lifecycle of a dispute:
 * 1. Client creates contract
 * 2. Client pays (escrow)
 * 3. Client initiates dispute
 * 4. Both parties add messages and evidence
 * 5. Admin reviews and resolves dispute
 * 6. Payment is released or refunded
 */
describe('Dispute Flow - End to End Integration', () => {
  let app: Express;
  let clientToken: string;
  let doerToken: string;
  let adminToken: string;
  let clientUser: any;
  let doerUser: any;
  let adminUser: any;
  let job: any;
  let contract: any;
  let payment: any;
  let dispute: any;

  beforeAll(async () => {
    // Setup Express app with all routes
    app = express();
    app.use(express.json());

    const disputeRoutes = await import('../../server/routes/disputes.js');
    const adminDisputeRoutes = await import('../../server/routes/admin/disputes.js');

    app.use('/api/disputes', disputeRoutes.default);
    app.use('/api/admin/disputes', adminDisputeRoutes.default);
  });

  beforeEach(async () => {
    // Create users
    clientUser = await User.create({
      email: 'client@integration.com',
      name: 'Integration Client',
      password: 'password123',
      role: 'client',
    });

    doerUser = await User.create({
      email: 'doer@integration.com',
      name: 'Integration Doer',
      password: 'password123',
      role: 'doer',
    });

    adminUser = await User.create({
      email: 'admin@integration.com',
      name: 'Integration Admin',
      password: 'adminpass123',
      role: 'super_admin',
    });

    // Create job
    job = await Job.create({
      title: 'Integration Test Job',
      description: 'Full integration test',
      price: 50000,
      clientId: clientUser.id,
      category: 'development',
      status: 'in_progress',
    });

    // Create contract
    contract = await Contract.create({
      jobId: job.id,
      clientId: clientUser.id,
      doerId: doerUser.id,
      price: 50000,
      status: 'in_progress',
      paymentStatus: 'escrow',
    });

    // Create payment in escrow
    payment = await Payment.create({
      contractId: contract.id,
      userId: clientUser.id,
      amount: 500,
      amountARS: 50000,
      currency: 'ARS',
      status: 'held_escrow',
      paymentType: 'escrow_deposit',
      mercadopagoPaymentId: 'MP-INT-12345',
    });

    // Generate tokens
    clientToken = jwt.sign(
      { id: clientUser.id, email: clientUser.email, role: 'client' },
      process.env.JWT_SECRET || 'test-secret'
    );

    doerToken = jwt.sign(
      { id: doerUser.id, email: doerUser.email, role: 'doer' },
      process.env.JWT_SECRET || 'test-secret'
    );

    adminToken = jwt.sign(
      { id: adminUser.id, email: adminUser.email, role: 'super_admin' },
      process.env.JWT_SECRET || 'test-secret'
    );
  });

  describe('Complete Dispute Flow - Full Release Scenario', () => {
    it('should complete full dispute lifecycle with payment release', async () => {
      // Step 1: Client creates dispute
      const createResponse = await request(app)
        .post('/api/disputes')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          contractId: contract.id.toString(),
          reason: 'Initial quality concerns',
          description: 'The work had some quality issues initially',
          category: 'quality_issues',
        })
        .expect(201);

      expect(createResponse.body.success).toBe(true);
      dispute = createResponse.body.data;

      // Step 2: Client adds evidence
      await request(app)
        .post(`/api/disputes/${dispute.id}/evidence`)
        .set('Authorization', `Bearer ${clientToken}`)
        .attach('attachments', Buffer.from('evidence data'), {
          filename: 'screenshot.jpg',
          contentType: 'image/jpeg',
        })
        .expect(200);

      // Step 3: Doer responds with message
      await request(app)
        .post(`/api/disputes/${dispute.id}/message`)
        .set('Authorization', `Bearer ${doerToken}`)
        .send({ text: 'I have fixed all the issues mentioned' })
        .expect(200);

      // Step 4: Client acknowledges fix
      await request(app)
        .post(`/api/disputes/${dispute.id}/message`)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ text: 'Yes, the issues are now resolved' })
        .expect(200);

      // Step 5: Admin assigns dispute
      await request(app)
        .put(`/api/disputes/${dispute.id}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ assignedTo: adminUser.id.toString() })
        .expect(200);

      // Step 6: Admin adds note
      await request(app)
        .post(`/api/disputes/${dispute.id}/note`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ note: 'Both parties agree issues are resolved' })
        .expect(200);

      // Step 7: Admin resolves with full release
      const resolveResponse = await request(app)
        .post(`/api/disputes/${dispute.id}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          resolution: 'Issues were resolved. Payment released to doer.',
          resolutionType: 'full_release',
        })
        .expect(200);

      expect(resolveResponse.body.success).toBe(true);
      expect(resolveResponse.body.data.status).toBe('resolved_released');

      // Step 8: Verify final state
      const updatedContract = await Contract.findByPk(contract.id);
      const updatedPayment = await Payment.findByPk(payment.id);

      expect(updatedContract?.status).toBe('completed');
      expect(updatedContract?.paymentStatus).toBe('released');
      expect(updatedPayment?.status).toBe('completed');
    });
  });

  describe('Complete Dispute Flow - Full Refund Scenario', () => {
    it('should complete full dispute lifecycle with refund', async () => {
      // Step 1: Client creates dispute
      const createResponse = await request(app)
        .post('/api/disputes')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          contractId: contract.id.toString(),
          reason: 'Work not delivered',
          description: 'The freelancer never delivered the work',
          category: 'service_not_delivered',
        })
        .expect(201);

      dispute = createResponse.body.data;

      // Step 2: Client adds evidence
      await request(app)
        .post(`/api/disputes/${dispute.id}/evidence`)
        .set('Authorization', `Bearer ${clientToken}`)
        .attach('attachments', Buffer.from('proof of non-delivery'), {
          filename: 'proof.pdf',
          contentType: 'application/pdf',
        })
        .expect(200);

      // Step 3: Admin reviews and sets priority
      await request(app)
        .put(`/api/disputes/${dispute.id}/priority`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ priority: 'high' })
        .expect(200);

      // Step 4: Admin assigns to themselves
      await request(app)
        .put(`/api/disputes/${dispute.id}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ assignedTo: adminUser.id.toString() })
        .expect(200);

      // Step 5: Admin resolves with full refund
      const resolveResponse = await request(app)
        .post(`/api/disputes/${dispute.id}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          resolution: 'Work was not delivered. Full refund to client (minus platform fee).',
          resolutionType: 'full_refund',
        })
        .expect(200);

      expect(resolveResponse.body.success).toBe(true);
      expect(resolveResponse.body.data.status).toBe('resolved_refunded');
      expect(resolveResponse.body.data.platformFeeRefunded).toBe(false);

      // Step 6: Verify final state
      const updatedContract = await Contract.findByPk(contract.id);
      const updatedPayment = await Payment.findByPk(payment.id);

      expect(updatedContract?.status).toBe('cancelled');
      expect(updatedContract?.paymentStatus).toBe('refunded');
      expect(updatedPayment?.status).toBe('refunded');
    });
  });

  describe('Complete Dispute Flow - Partial Refund Scenario', () => {
    it('should complete full dispute lifecycle with partial refund', async () => {
      // Create dispute
      const createResponse = await request(app)
        .post('/api/disputes')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          contractId: contract.id.toString(),
          reason: 'Partially completed work',
          description: 'Only 60% of work was completed',
          category: 'incomplete_work',
        })
        .expect(201);

      dispute = createResponse.body.data;

      // Admin assigns and resolves with partial refund
      await request(app)
        .put(`/api/disputes/${dispute.id}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ assignedTo: adminUser.id.toString() })
        .expect(200);

      const resolveResponse = await request(app)
        .post(`/api/disputes/${dispute.id}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          resolution: '60% work completed. 40% refund to client.',
          resolutionType: 'partial_refund',
          refundAmount: 20000, // 40% of 50000
        })
        .expect(200);

      expect(resolveResponse.body.success).toBe(true);
      expect(resolveResponse.body.data.status).toBe('resolved_partial');
      expect(resolveResponse.body.data.refundAmount).toBe(20000);
    });
  });

  describe('Admin Statistics', () => {
    it('should accurately track dispute statistics', async () => {
      // Create multiple disputes
      await Dispute.bulkCreate([
        {
          contractId: contract.id,
          paymentId: payment.id,
          initiatedBy: clientUser.id,
          against: doerUser.id,
          reason: 'Open dispute 1',
          description: 'Description',
          category: 'quality_issues',
          status: 'open',
          priority: 'medium',
        },
        {
          contractId: contract.id,
          paymentId: payment.id,
          initiatedBy: clientUser.id,
          against: doerUser.id,
          reason: 'In review dispute',
          description: 'Description',
          category: 'payment_issues',
          status: 'in_review',
          priority: 'high',
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

      const statsResponse = await request(app)
        .get('/api/admin/disputes/stats/overview')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(statsResponse.body.success).toBe(true);
      expect(statsResponse.body.data.total).toBe(3);
      expect(statsResponse.body.data.open).toBeGreaterThan(0);
      expect(statsResponse.body.data.inReview).toBeGreaterThan(0);
      expect(statsResponse.body.data.resolved).toBeGreaterThan(0);
    });
  });

  describe('Error Scenarios', () => {
    it('should prevent duplicate disputes on same contract', async () => {
      // Create first dispute
      await request(app)
        .post('/api/disputes')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          contractId: contract.id.toString(),
          reason: 'First dispute',
          description: 'Description',
          category: 'quality_issues',
        })
        .expect(201);

      // Attempt second dispute
      await request(app)
        .post('/api/disputes')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          contractId: contract.id.toString(),
          reason: 'Second dispute',
          description: 'Description',
          category: 'other',
        })
        .expect(400);
    });

    it('should reject resolution without admin role', async () => {
      dispute = await Dispute.create({
        contractId: contract.id,
        paymentId: payment.id,
        initiatedBy: clientUser.id,
        against: doerUser.id,
        reason: 'Test dispute',
        description: 'Description',
        category: 'quality_issues',
        status: 'open',
      });

      await request(app)
        .post(`/api/disputes/${dispute.id}/resolve`)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          resolution: 'Trying to resolve',
          resolutionType: 'full_release',
        })
        .expect(403);
    });
  });
});
