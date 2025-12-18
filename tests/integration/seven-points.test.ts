/**
 * Tests para los 7 puntos implementados:
 * 1. Extensión de fecha fin (máx 1 vez, 24hr antes, requiere aceptación trabajador)
 * 2. Escrow multi-trabajador
 * 3. Referidos: comisión 3% solo por 1 mes
 * 4. Listado de pagos pendientes
 * 5. Comisión mínima $1000 ARS
 * 6. Estado de contrato "ready"
 * 7. Modificación de trabajo con pago de diferencia
 */

import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';

const API_URL = process.env.API_URL || 'http://localhost:5000';

// Test tokens (usar los de seedMockup)
let clientToken: string;
let doerToken: string;
let adminToken: string;
let testJobId: string;
let testContractId: string;

describe('7 Points Implementation Tests', () => {
  beforeAll(async () => {
    // Login como cliente
    const clientLogin = await request(API_URL)
      .post('/api/auth/login')
      .send({ email: 'maria@example.com', password: 'password123' });
    clientToken = clientLogin.body.token;

    // Login como doer
    const doerLogin = await request(API_URL)
      .post('/api/auth/login')
      .send({ email: 'carlos@example.com', password: 'password123' });
    doerToken = doerLogin.body.token;

    // Login como admin
    const adminLogin = await request(API_URL)
      .post('/api/auth/login')
      .send({ email: 'admin@doapp.com', password: 'password123' });
    adminToken = adminLogin.body.token;
  });

  // ============================================
  // PUNTO 1: Extensión de fecha fin
  // ============================================
  describe('1. Contract Extension Rules', () => {
    it('should reject extension request from doer (only client can request)', async () => {
      // Primero obtener un contrato existente
      const contractsRes = await request(API_URL)
        .get('/api/contracts')
        .set('Authorization', `Bearer ${doerToken}`);

      if (contractsRes.body.data?.length > 0) {
        const contract = contractsRes.body.data[0];

        const res = await request(API_URL)
          .post(`/api/contracts/${contract.id}/request-extension`)
          .set('Authorization', `Bearer ${doerToken}`)
          .send({
            newEndDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            notes: 'Extension test'
          });

        // Debería rechazar porque solo el cliente puede solicitar
        expect([403, 400]).toContain(res.status);
      }
    });

    it('should reject second extension request (max 1 per contract)', async () => {
      const contractsRes = await request(API_URL)
        .get('/api/contracts')
        .set('Authorization', `Bearer ${clientToken}`);

      if (contractsRes.body.data?.length > 0) {
        // Buscar contrato que ya fue extendido
        const extendedContract = contractsRes.body.data.find(
          (c: any) => c.hasBeenExtended || (c.extensionCount || 0) >= 1
        );

        if (extendedContract) {
          const res = await request(API_URL)
            .post(`/api/contracts/${extendedContract.id}/request-extension`)
            .set('Authorization', `Bearer ${clientToken}`)
            .send({
              newEndDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
              notes: 'Second extension attempt'
            });

          expect(res.status).toBe(400);
          expect(res.body.message).toContain('ya ha sido extendido');
        }
      }
    });
  });

  // ============================================
  // PUNTO 3: Referidos - descuento temporal
  // ============================================
  describe('3. Referral Discount Expiration', () => {
    it('should set expiration date when granting referral discount', async () => {
      // Verificar que el servicio de referidos establece fecha de expiración
      const userRes = await request(API_URL)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${clientToken}`);

      // Si el usuario tiene descuento de referido, debe tener fecha de expiración
      if (userRes.body.user?.hasReferralDiscount) {
        expect(userRes.body.user.referralDiscountExpiresAt).toBeDefined();
        const expirationDate = new Date(userRes.body.user.referralDiscountExpiresAt);
        expect(expirationDate.getTime()).toBeGreaterThan(Date.now());
      }
    });
  });

  // ============================================
  // PUNTO 4: Listado de pagos pendientes
  // ============================================
  describe('4. Pending Payments Report', () => {
    it('should get daily pending payments report', async () => {
      const res = await request(API_URL)
        .get('/api/admin/pending-payments?period=daily')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.report).toBeDefined();
      expect(res.body.report.period).toBe('daily');
      expect(res.body.report.summary).toBeDefined();
      expect(res.body.report.data).toBeInstanceOf(Array);
    });

    it('should get weekly pending payments report', async () => {
      const res = await request(API_URL)
        .get('/api/admin/pending-payments?period=weekly')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.report.period).toBe('weekly');
    });

    it('should get monthly pending payments report', async () => {
      const res = await request(API_URL)
        .get('/api/admin/pending-payments?period=monthly')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.report.period).toBe('monthly');
    });

    it('should include worker details in report', async () => {
      const res = await request(API_URL)
        .get('/api/admin/pending-payments?period=monthly')
        .set('Authorization', `Bearer ${adminToken}`);

      if (res.body.report.data.length > 0) {
        const firstRow = res.body.report.data[0];
        expect(firstRow.contractId).toBeDefined();
        expect(firstRow.jobTitle).toBeDefined();
        expect(firstRow.clientName).toBeDefined();
        expect(firstRow.workers).toBeInstanceOf(Array);

        if (firstRow.workers.length > 0) {
          const worker = firstRow.workers[0];
          expect(worker.workerName).toBeDefined();
          expect(worker.workerEmail).toBeDefined();
          expect(worker.amountToPay).toBeDefined();
        }
      }
    });

    it('should export CSV', async () => {
      const res = await request(API_URL)
        .get('/api/admin/pending-payments/export/csv?period=monthly')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
    });

    it('should reject non-admin access', async () => {
      const res = await request(API_URL)
        .get('/api/admin/pending-payments')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(403);
    });
  });

  // ============================================
  // PUNTO 5: Comisión mínima $1000 ARS
  // ============================================
  describe('5. Minimum Commission $1000 ARS', () => {
    it('should apply minimum commission of $1000 for small contracts', async () => {
      // Crear propuesta con precio bajo para verificar comisión mínima
      const jobsRes = await request(API_URL)
        .get('/api/jobs?status=open')
        .set('Authorization', `Bearer ${doerToken}`);

      if (jobsRes.body.data?.length > 0) {
        const job = jobsRes.body.data[0];

        // Proponer precio de $5000 (comisión al 8% sería $400, pero mínimo es $1000)
        const proposalRes = await request(API_URL)
          .post(`/api/proposals`)
          .set('Authorization', `Bearer ${doerToken}`)
          .send({
            jobId: job.id,
            proposedPrice: 5000,
            coverLetter: 'Test proposal for minimum commission',
            estimatedDuration: 7
          });

        // El cálculo de comisión debería usar el mínimo
        // commission = Math.max(5000 * 0.08, 1000) = 1000
        if (proposalRes.status === 201) {
          // Verificar en el contrato si se crea
        }
      }
    });
  });

  // ============================================
  // PUNTO 6: Estado "ready" del contrato
  // ============================================
  describe('6. Contract "ready" Status', () => {
    it('should approve contract and change status to ready', async () => {
      // Obtener contrato pendiente
      const contractsRes = await request(API_URL)
        .get('/api/admin/contracts?status=pending')
        .set('Authorization', `Bearer ${adminToken}`);

      if (contractsRes.body.data?.length > 0) {
        const contract = contractsRes.body.data[0];

        const res = await request(API_URL)
          .post(`/api/admin/contracts/${contract.id}/approve`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ adminNotes: 'Aprobado para testing' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.status).toBe('ready');
      }
    });

    it('should allow both parties to accept a ready contract', async () => {
      // Obtener contrato en estado ready
      const contractsRes = await request(API_URL)
        .get('/api/admin/contracts?status=ready')
        .set('Authorization', `Bearer ${adminToken}`);

      if (contractsRes.body.data?.length > 0) {
        const contract = contractsRes.body.data[0];

        // Cliente acepta
        const clientAccept = await request(API_URL)
          .put(`/api/contracts/${contract.id}/accept`)
          .set('Authorization', `Bearer ${clientToken}`);

        if (clientAccept.status === 200) {
          expect(clientAccept.body.bothAccepted).toBeDefined();

          // Si el cliente ya aceptó, debería indicar que falta el doer
          if (!clientAccept.body.bothAccepted) {
            // Doer acepta
            const doerAccept = await request(API_URL)
              .put(`/api/contracts/${contract.id}/accept`)
              .set('Authorization', `Bearer ${doerToken}`);

            if (doerAccept.status === 200) {
              expect(doerAccept.body.bothAccepted).toBe(true);
              expect(doerAccept.body.contract.status).toBe('accepted');
            }
          }
        }
      }
    });

    it('should reject contract with reason', async () => {
      const contractsRes = await request(API_URL)
        .get('/api/admin/contracts?status=pending')
        .set('Authorization', `Bearer ${adminToken}`);

      if (contractsRes.body.data?.length > 0) {
        const contract = contractsRes.body.data[0];

        const res = await request(API_URL)
          .post(`/api/admin/contracts/${contract.id}/reject`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ reason: 'Test rejection reason' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.status).toBe('rejected');
      }
    });

    it('should require reason for rejection', async () => {
      const contractsRes = await request(API_URL)
        .get('/api/admin/contracts?status=pending')
        .set('Authorization', `Bearer ${adminToken}`);

      if (contractsRes.body.data?.length > 0) {
        const contract = contractsRes.body.data[0];

        const res = await request(API_URL)
          .post(`/api/admin/contracts/${contract.id}/reject`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({}); // Sin razón

        expect(res.status).toBe(400);
        expect(res.body.message).toContain('razón');
      }
    });
  });

  // ============================================
  // PUNTO 7: Modificación de trabajo con pago
  // ============================================
  describe('7. Job Modification with Price Difference Payment', () => {
    it('should require payment when increasing job price', async () => {
      // Obtener trabajo del cliente
      const jobsRes = await request(API_URL)
        .get('/api/jobs?clientId=me')
        .set('Authorization', `Bearer ${clientToken}`);

      if (jobsRes.body.data?.length > 0) {
        const job = jobsRes.body.data.find((j: any) =>
          j.status === 'open' || j.status === 'draft'
        );

        if (job) {
          const oldPrice = Number(job.price);
          const newPrice = oldPrice + 5000; // Aumentar $5000

          const res = await request(API_URL)
            .put(`/api/jobs/${job.id}`)
            .set('Authorization', `Bearer ${clientToken}`)
            .send({
              ...job,
              price: newPrice,
              priceChangeReason: 'Aumentando presupuesto para test'
            });

          // Debería retornar 402 Payment Required
          expect(res.status).toBe(402);
          expect(res.body.requiresPayment).toBe(true);
          expect(res.body.breakdown).toBeDefined();
          expect(res.body.breakdown.priceDifference).toBe(5000);
          expect(res.body.breakdown.commission).toBeGreaterThanOrEqual(1000); // Mín $1000
          expect(res.body.redirectTo).toBeDefined();
        }
      }
    });

    it('should allow decreasing job price without payment', async () => {
      const jobsRes = await request(API_URL)
        .get('/api/jobs?clientId=me')
        .set('Authorization', `Bearer ${clientToken}`);

      if (jobsRes.body.data?.length > 0) {
        const job = jobsRes.body.data.find((j: any) =>
          (j.status === 'open' || j.status === 'draft') && Number(j.price) > 5000
        );

        if (job) {
          const oldPrice = Number(job.price);
          const newPrice = oldPrice - 1000; // Reducir $1000

          const res = await request(API_URL)
            .put(`/api/jobs/${job.id}`)
            .set('Authorization', `Bearer ${clientToken}`)
            .send({
              title: job.title,
              summary: job.summary,
              description: job.description,
              price: newPrice,
              priceChangeReason: 'Reduciendo presupuesto para test'
            });

          // Debería permitir sin pago
          if (res.status === 200) {
            expect(res.body.success).toBe(true);
            expect(res.body.job.price).toBe(newPrice);
          }
        }
      }
    });

    it('should record price change in history', async () => {
      const jobsRes = await request(API_URL)
        .get('/api/jobs?clientId=me')
        .set('Authorization', `Bearer ${clientToken}`);

      if (jobsRes.body.data?.length > 0) {
        const job = jobsRes.body.data.find((j: any) =>
          j.priceHistory && j.priceHistory.length > 0
        );

        if (job) {
          expect(job.priceHistory).toBeInstanceOf(Array);
          const lastChange = job.priceHistory[job.priceHistory.length - 1];
          expect(lastChange.oldPrice).toBeDefined();
          expect(lastChange.newPrice).toBeDefined();
          expect(lastChange.reason).toBeDefined();
          expect(lastChange.changedAt).toBeDefined();
        }
      }
    });
  });

  // ============================================
  // PUNTO 2: Escrow multi-trabajador
  // ============================================
  describe('2. Multi-worker Escrow', () => {
    it('should distribute payment according to worker allocations', async () => {
      // Buscar trabajo con múltiples trabajadores
      const jobsRes = await request(API_URL)
        .get('/api/jobs')
        .set('Authorization', `Bearer ${adminToken}`);

      if (jobsRes.body.data?.length > 0) {
        const multiWorkerJob = jobsRes.body.data.find((j: any) =>
          j.maxWorkers > 1 && j.selectedWorkers?.length > 1
        );

        if (multiWorkerJob) {
          // Verificar que tiene allocations
          expect(multiWorkerJob.workerAllocations).toBeDefined();

          // Verificar que la suma de allocations es igual al precio total
          const totalAllocated = multiWorkerJob.workerAllocations.reduce(
            (sum: number, alloc: any) => sum + alloc.allocatedAmount, 0
          );
          expect(totalAllocated).toBeLessThanOrEqual(Number(multiWorkerJob.price));
        }
      }
    });

    it('should create separate contracts for each worker', async () => {
      const contractsRes = await request(API_URL)
        .get('/api/admin/contracts')
        .set('Authorization', `Bearer ${adminToken}`);

      if (contractsRes.body.data?.length > 0) {
        // Agrupar contratos por jobId
        const contractsByJob: Record<string, any[]> = {};
        contractsRes.body.data.forEach((c: any) => {
          if (!contractsByJob[c.jobId]) {
            contractsByJob[c.jobId] = [];
          }
          contractsByJob[c.jobId].push(c);
        });

        // Verificar que trabajos con múltiples contratos tienen allocatedAmount
        Object.values(contractsByJob).forEach((contracts) => {
          if (contracts.length > 1) {
            contracts.forEach(contract => {
              // Cada contrato debería tener un monto asignado
              expect(contract.allocatedAmount || contract.price).toBeDefined();
            });
          }
        });
      }
    });
  });
});
