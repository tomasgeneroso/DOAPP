import { describe, it, test, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import { Dispute } from '../../server/models/sql/Dispute.model.js';
import { Contract } from '../../server/models/sql/Contract.model.js';
import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import jwt from 'jsonwebtoken';
import { crearEscenario, crearDisputa } from '../helpers/fixtures.js';

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
    // Los fixtures viven en tests/helpers/fixtures.ts: el Job tiene campos
    // obligatorios que este test no usa pero el modelo exige, y tenerlos
    // copiados en cada suite hacía que agregar una columna rompiera siete.
    const escenario = await crearEscenario({
      usuario: { name: 'Test Client' },
      trabajador: { name: 'Test Doer' },
      trabajo: { title: 'Test Job', price: 1000 },
    });
    clientUser = escenario.cliente;
    doerUser = escenario.trabajador;
    job = escenario.job;
    contract = escenario.contrato;

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
      // `id`, no `_id`: la base es Postgres desde la migración. Y una disputa
      // nueva arranca en 'negotiation' —las 72 h de reclamo directo del punto
      // 10.11— no en 'open': a 'open' pasa recién si escala a un admin.
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.reason).toBe(disputeData.reason);
      expect(response.body.data.status).toBe('negotiation');
      // La prioridad la decide determineAutoPriority según el monto, la
      // categoría y si quien reclama es PRO (durante la beta, todos lo son).
      expect(['low', 'medium', 'high', 'urgent']).toContain(response.body.data.priority);
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
      await crearDisputa(
        { contractId: contract.id, initiatedBy: clientUser.id, against: doerUser.id },
        { reason: 'First dispute', category: 'quality_issues' },
      );

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
      expect(response.body.message).toContain('Ya hay un reclamo abierto');
    });
  });

  describe('GET /api/disputes', () => {
    beforeEach(async () => {
      // Dos disputas del mismo contrato: la ruta no deja crear la segunda,
      // pero para listar y filtrar da igual y es lo que se está probando.
      await crearDisputa(
        { contractId: contract.id, initiatedBy: clientUser.id, against: doerUser.id },
        { reason: 'Dispute 1', category: 'quality_issues', status: 'open' },
      );
      await crearDisputa(
        { contractId: contract.id, initiatedBy: doerUser.id, against: clientUser.id },
        { reason: 'Dispute 2', category: 'payment_issues', status: 'in_review' },
      );
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
      dispute = await crearDisputa(
        { contractId: contract.id, initiatedBy: clientUser.id, against: doerUser.id },
        { reason: 'Test dispute', category: 'quality_issues' },
      );
    });

    it('should return dispute details by ID', async () => {
      const response = await request(app)
        .get(`/api/disputes/${dispute.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(dispute.id.toString());
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

  // La ruta es /messages (plural) y el campo se llama `message`, no `text`.
  // El test apuntaba a /message y mandaba `text`: daba 404 y nadie se enteró
  // de que estos dos casos nunca se estaban probando.
  describe('POST /api/disputes/:id/messages', () => {
    let dispute: any;

    beforeEach(async () => {
      dispute = await crearDisputa(
        { contractId: contract.id, initiatedBy: clientUser.id, against: doerUser.id },
        { reason: 'Test dispute', category: 'quality_issues' },
      );
    });

    it('should add a message to dispute', async () => {
      const messageData = { message: 'This is a test message' };

      const response = await request(app)
        .post(`/api/disputes/${dispute.id}/messages`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(messageData)
        .expect(200);

      expect(response.body.success).toBe(true);
      const mensajes = response.body.data.messages;
      expect(mensajes.length).toBeGreaterThan(0);
      expect(mensajes[mensajes.length - 1].message).toBe(messageData.message);
    });

    it('should reject empty messages', async () => {
      const response = await request(app)
        .post(`/api/disputes/${dispute.id}/messages`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ message: '' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/disputes/:id/evidence', () => {
    let dispute: any;

    beforeEach(async () => {
      dispute = await crearDisputa(
        { contractId: contract.id, initiatedBy: clientUser.id, against: doerUser.id },
        { reason: 'Test dispute', category: 'quality_issues' },
      );
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
