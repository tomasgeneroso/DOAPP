import request from 'supertest';
import express, { Express } from 'express';
import { Dispute } from '../../server/models/sql/Dispute.model.js';
import { Contract } from '../../server/models/sql/Contract.model.js';
import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import jwt from 'jsonwebtoken';

describe('Dispute Routes', () => {
  let app: Express;
  let authToken: string;
  let clientUser: any;
  let doerUser: any;
  let job: any;
  let contract: any;

  beforeAll(async () => {
    // Create test Express app
    app = express();
    app.use(express.json());

    // Import routes dynamically
    const disputeRoutes = await import('../../server/routes/disputes.js');
    app.use('/api/disputes', disputeRoutes.default);
  });

  beforeEach(async () => {
    // Create test users
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

    // Create test job
    job = await Job.create({
      title: 'Test Job',
      description: 'Test job description',
      price: 1000,
      clientId: clientUser.id,
      category: 'development',
      status: 'open',
    });

    // Create test contract
    contract = await Contract.create({
      jobId: job.id,
      clientId: clientUser.id,
      doerId: doerUser.id,
      price: 1000,
      status: 'in_progress',
      paymentStatus: 'escrow',
    });

    // Generate auth token
    authToken = jwt.sign(
      { id: clientUser.id, email: clientUser.email },
      process.env.JWT_SECRET || 'test-secret'
    );
  });

  describe('POST /api/disputes', () => {
    it('should create a new dispute with valid data', async () => {
      const disputeData = {
        contractId: contract.id.toString(),
        reason: 'Work not completed as agreed',
        description: 'The freelancer did not deliver the work as specified in the contract.',
        category: 'incomplete_work',
      };

      const response = await request(app)
        .post('/api/disputes')
        .set('Authorization', `Bearer ${authToken}`)
        .send(disputeData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('_id');
      expect(response.body.data.reason).toBe(disputeData.reason);
      expect(response.body.data.status).toBe('open');
      expect(response.body.data.priority).toBe('medium');
    });

    it('should create dispute with file attachments', async () => {
      const response = await request(app)
        .post('/api/disputes')
        .set('Authorization', `Bearer ${authToken}`)
        .field('contractId', contract.id.toString())
        .field('reason', 'Quality issues')
        .field('description', 'The work quality is poor')
        .field('category', 'quality_issues')
        .attach('attachments', Buffer.from('fake image data'), {
          filename: 'evidence.jpg',
          contentType: 'image/jpeg',
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.evidence).toBeDefined();
      expect(Array.isArray(response.body.data.evidence)).toBe(true);
    });

    it('should reject dispute without required fields', async () => {
      const invalidData = {
        contractId: contract.id.toString(),
        // Missing reason, description, category
      };

      const response = await request(app)
        .post('/api/disputes')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should reject dispute for non-existent contract', async () => {
      const invalidContractId = '00000000-0000-0000-0000-000000000000';

      const disputeData = {
        contractId: invalidContractId,
        reason: 'Test reason',
        description: 'Test description',
        category: 'other',
      };

      const response = await request(app)
        .post('/api/disputes')
        .set('Authorization', `Bearer ${authToken}`)
        .send(disputeData)
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    it('should reject duplicate disputes for same contract', async () => {
      // Create first dispute
      await Dispute.create({
        contractId: contract.id,
        initiatedBy: clientUser.id,
        against: doerUser.id,
        reason: 'First dispute',
        description: 'First dispute description',
        category: 'quality_issues',
        status: 'open',
      });

      // Try to create second dispute
      const disputeData = {
        contractId: contract.id.toString(),
        reason: 'Second dispute',
        description: 'Second dispute description',
        category: 'incomplete_work',
      };

      const response = await request(app)
        .post('/api/disputes')
        .set('Authorization', `Bearer ${authToken}`)
        .send(disputeData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Ya existe una disputa');
    });
  });

  describe('GET /api/disputes', () => {
    beforeEach(async () => {
      // Create multiple disputes
      await Dispute.bulkCreate([
        {
          contractId: contract.id,
          initiatedBy: clientUser.id,
          against: doerUser.id,
          reason: 'Dispute 1',
          description: 'Description 1',
          category: 'quality_issues',
          status: 'open',
        },
        {
          contractId: contract.id,
          initiatedBy: doerUser.id,
          against: clientUser.id,
          reason: 'Dispute 2',
          description: 'Description 2',
          category: 'payment_issues',
          status: 'in_review',
        },
      ]);
    });

    it('should return all disputes for authenticated user', async () => {
      const response = await request(app)
        .get('/api/disputes')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
    });

    it('should filter disputes by status', async () => {
      const response = await request(app)
        .get('/api/disputes?status=open')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.every((d: any) => d.status === 'open')).toBe(true);
    });
  });

  describe('GET /api/disputes/:id', () => {
    let dispute: any;

    beforeEach(async () => {
      dispute = await Dispute.create({
        contractId: contract.id,
        initiatedBy: clientUser.id,
        against: doerUser.id,
        reason: 'Test dispute',
        description: 'Test description',
        category: 'quality_issues',
        status: 'open',
      });
    });

    it('should return dispute details by ID', async () => {
      const response = await request(app)
        .get(`/api/disputes/${dispute.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data._id).toBe(dispute.id.toString());
      expect(response.body.data.reason).toBe('Test dispute');
    });

    it('should return 404 for non-existent dispute', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const response = await request(app)
        .get(`/api/disputes/${fakeId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/disputes/:id/message', () => {
    let dispute: any;

    beforeEach(async () => {
      dispute = await Dispute.create({
        contractId: contract.id,
        initiatedBy: clientUser.id,
        against: doerUser.id,
        reason: 'Test dispute',
        description: 'Test description',
        category: 'quality_issues',
        status: 'open',
      });
    });

    it('should add a message to dispute', async () => {
      const messageData = {
        text: 'This is a test message',
      };

      const response = await request(app)
        .post(`/api/disputes/${dispute.id}/message`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(messageData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.messages).toHaveLength(1);
      expect(response.body.data.messages[0].text).toBe(messageData.text);
    });

    it('should reject empty messages', async () => {
      const response = await request(app)
        .post(`/api/disputes/${dispute.id}/message`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ text: '' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/disputes/:id/evidence', () => {
    let dispute: any;

    beforeEach(async () => {
      dispute = await Dispute.create({
        contractId: contract.id,
        initiatedBy: clientUser.id,
        against: doerUser.id,
        reason: 'Test dispute',
        description: 'Test description',
        category: 'quality_issues',
        status: 'open',
      });
    });

    it('should add additional evidence to existing dispute', async () => {
      const response = await request(app)
        .post(`/api/disputes/${dispute.id}/evidence`)
        .set('Authorization', `Bearer ${authToken}`)
        .attach('attachments', Buffer.from('new evidence'), {
          filename: 'new-evidence.jpg',
          contentType: 'image/jpeg',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.evidence.length).toBeGreaterThan(0);
    });
  });
});
