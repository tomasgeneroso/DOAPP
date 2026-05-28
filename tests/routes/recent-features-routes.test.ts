/**
 * Route logic tests for recently added endpoint behaviors.
 * Tests the HTTP-layer rules without loading real Sequelize models
 * (which have circular deps that break Jest mocks).
 * Each test builds a minimal Express app inline.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import request from 'supertest';
import express, { Express, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'test-jwt-secret-for-testing-only';

function makeToken(userId: string, email = 'test@test.com') {
  return jwt.sign({ id: userId, email }, JWT_SECRET);
}

// Minimal auth middleware (same logic as real middleware)
function authMiddleware(req: any, res: Response, next: any) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) { res.status(401).json({ success: false, message: 'No token' }); return; }
  try {
    req.user = jwt.verify(token, JWT_SECRET) as any;
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Invalid token' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// A. Proposal approve — idempotent logic (endpoint logic extracted inline)
// ─────────────────────────────────────────────────────────────────────────────
function buildProposalApproveApp(proposal: any, job: any, existingContract: any): Express {
  const app = express();
  app.use(express.json());

  app.put('/api/proposals/:id/approve', authMiddleware, async (req: any, res: Response) => {
    if (!proposal) { res.status(404).json({ success: false, message: 'Propuesta no encontrada' }); return; }
    if (proposal.clientId !== req.user.id) { res.status(403).json({ success: false, message: 'Solo el cliente puede aprobar esta propuesta' }); return; }

    // IDEMPOTENT: if already approved, return existing contract
    if (proposal.status === 'approved') {
      res.json({ success: true, message: 'Este trabajador ya fue aprobado', contractId: existingContract?.id || null, proposal });
      return;
    }

    if (proposal.status !== 'pending') {
      res.status(400).json({ success: false, message: `Esta propuesta no puede ser aprobada porque su estado es "${proposal.status}" (debe ser "pending")` });
      return;
    }
    if (!job) { res.status(404).json({ success: false, message: 'Trabajo no encontrado' }); return; }

    const maxWorkers = job.maxWorkers || 1;
    const currentWorkers = job.selectedWorkers || [];
    if (currentWorkers.length >= maxWorkers) {
      res.status(400).json({ success: false, message: `Máximo de ${maxWorkers} trabajadores alcanzado` });
      return;
    }
    if (currentWorkers.includes(proposal.freelancerId)) {
      res.status(400).json({ success: false, message: 'Este trabajador ya fue seleccionado' });
      return;
    }

    res.json({ success: true, contractId: 'new-contract-id', proposal });
  });

  return app;
}

describe('A. PUT /api/proposals/:id/approve — idempotent', () => {
  const baseProposal = { id: 'p1', jobId: 'j1', clientId: 'client-1', freelancerId: 'worker-1', status: 'pending' };
  const baseJob = { id: 'j1', maxWorkers: 2, selectedWorkers: [] };

  it('returns 200 when proposal already approved (idempotent)', async () => {
    const app = buildProposalApproveApp(
      { ...baseProposal, status: 'approved' },
      baseJob,
      { id: 'existing-contract' }
    );
    const res = await request(app)
      .put('/api/proposals/p1/approve')
      .set('Authorization', `Bearer ${makeToken('client-1')}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.contractId).toBe('existing-contract');
  });

  it('returns contractId: null when approved but no existing contract found', async () => {
    const app = buildProposalApproveApp({ ...baseProposal, status: 'approved' }, baseJob, null);
    const res = await request(app)
      .put('/api/proposals/p1/approve')
      .set('Authorization', `Bearer ${makeToken('client-1')}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.contractId).toBeNull();
  });

  it('returns 400 for rejected proposal (non-idempotent)', async () => {
    const app = buildProposalApproveApp({ ...baseProposal, status: 'rejected' }, baseJob, null);
    const res = await request(app)
      .put('/api/proposals/p1/approve')
      .set('Authorization', `Bearer ${makeToken('client-1')}`)
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('rejected');
  });

  it('returns 403 for non-client', async () => {
    const app = buildProposalApproveApp(baseProposal, baseJob, null);
    const res = await request(app)
      .put('/api/proposals/p1/approve')
      .set('Authorization', `Bearer ${makeToken('other-user')}`)
      .expect(403);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 when maxWorkers already full', async () => {
    const app = buildProposalApproveApp(
      baseProposal,
      { ...baseJob, maxWorkers: 1, selectedWorkers: ['existing-worker'] },
      null
    );
    const res = await request(app)
      .put('/api/proposals/p1/approve')
      .set('Authorization', `Bearer ${makeToken('client-1')}`)
      .expect(400);
    expect(res.body.message).toContain('Máximo');
  });

  it('returns 401 without token', async () => {
    const app = buildProposalApproveApp(baseProposal, baseJob, null);
    const res = await request(app).put('/api/proposals/p1/approve').expect(401);
    expect(res.body.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. Force-start pairing — grace mode logic
// ─────────────────────────────────────────────────────────────────────────────
function buildForceStartApp(contractStore: Record<string, any>): Express {
  const app = express();
  app.use(express.json());

  app.post('/api/contracts/:id/force-start-pairing', authMiddleware, async (req: any, res: Response) => {
    const contract = contractStore[req.params.id];
    if (!contract) { res.status(404).json({ success: false, message: 'Contrato no encontrado' }); return; }

    const isClient = contract.clientId === req.user.id;
    const isDoer = contract.doerId === req.user.id;
    if (!isClient && !isDoer) { res.status(403).json({ success: false, message: 'No tienes permiso' }); return; }

    if (contract.status === 'in_progress') {
      res.json({ success: true, message: 'El contrato ya está en progreso', contract }); return;
    }
    if (!['accepted', 'ready', 'pending'].includes(contract.status)) {
      res.status(400).json({ success: false, message: `El contrato no puede iniciarse en estado "${contract.status}"` }); return;
    }

    if (isClient && !contract.clientConfirmedPairing) contract.clientConfirmedPairing = true;
    else if (isDoer && !contract.doerConfirmedPairing) contract.doerConfirmedPairing = true;

    if (contract.clientConfirmedPairing && contract.doerConfirmedPairing) {
      contract.locationVerificationStatus = 'grace_start';
      contract.status = 'in_progress';
      contract.actualStartDate = new Date();
      res.json({ success: true, message: 'Inicio confirmado en modo flexible', graceMode: true, contract }); return;
    }

    res.json({ success: true, message: 'Confirmación registrada. Esperando la otra parte.', graceMode: false, contract });
  });

  return app;
}

describe('B. POST /api/contracts/:id/force-start-pairing', () => {
  let contracts: Record<string, any>;

  beforeEach(() => {
    contracts = {
      'c1': { id: 'c1', clientId: 'client-1', doerId: 'worker-1', status: 'accepted', clientConfirmedPairing: false, doerConfirmedPairing: false },
      'c-progress': { id: 'c-progress', clientId: 'client-1', doerId: 'worker-1', status: 'in_progress', clientConfirmedPairing: true, doerConfirmedPairing: true },
      'c-cancelled': { id: 'c-cancelled', clientId: 'client-1', doerId: 'worker-1', status: 'cancelled', clientConfirmedPairing: false, doerConfirmedPairing: false },
    };
  });

  it('first party confirm — waits for other, no grace start yet', async () => {
    const app = buildForceStartApp(contracts);
    const res = await request(app)
      .post('/api/contracts/c1/force-start-pairing')
      .set('Authorization', `Bearer ${makeToken('client-1')}`)
      .expect(200);

    expect(res.body.graceMode).toBe(false);
    expect(contracts['c1'].clientConfirmedPairing).toBe(true);
    expect(contracts['c1'].status).toBe('accepted');
  });

  it('both parties confirm — contract starts with grace_start', async () => {
    const app = buildForceStartApp(contracts);
    contracts['c1'].clientConfirmedPairing = true; // simulate client already confirmed
    const res = await request(app)
      .post('/api/contracts/c1/force-start-pairing')
      .set('Authorization', `Bearer ${makeToken('worker-1')}`)
      .expect(200);

    expect(res.body.graceMode).toBe(true);
    expect(contracts['c1'].status).toBe('in_progress');
    expect(contracts['c1'].locationVerificationStatus).toBe('grace_start');
    expect(contracts['c1'].actualStartDate).toBeTruthy();
  });

  it('idempotent — returns success if already in_progress', async () => {
    const app = buildForceStartApp(contracts);
    const res = await request(app)
      .post('/api/contracts/c-progress/force-start-pairing')
      .set('Authorization', `Bearer ${makeToken('client-1')}`)
      .expect(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 403 for user not part of contract', async () => {
    const app = buildForceStartApp(contracts);
    const res = await request(app)
      .post('/api/contracts/c1/force-start-pairing')
      .set('Authorization', `Bearer ${makeToken('random-user')}`)
      .expect(403);
    expect(res.body.success).toBe(false);
  });

  it('returns 404 for non-existent contract', async () => {
    const app = buildForceStartApp(contracts);
    const res = await request(app)
      .post('/api/contracts/nonexistent/force-start-pairing')
      .set('Authorization', `Bearer ${makeToken('client-1')}`)
      .expect(404);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 for cancelled contract', async () => {
    const app = buildForceStartApp(contracts);
    const res = await request(app)
      .post('/api/contracts/c-cancelled/force-start-pairing')
      .set('Authorization', `Bearer ${makeToken('client-1')}`)
      .expect(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('cancelled');
  });

  it('returns 401 without token', async () => {
    const app = buildForceStartApp(contracts);
    const res = await request(app).post('/api/contracts/c1/force-start-pairing').expect(401);
    expect(res.body.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. License approve/reject logic
// ─────────────────────────────────────────────────────────────────────────────
function buildLicenseApp(userStore: Record<string, any>): Express {
  const app = express();
  app.use(express.json());

  app.post('/api/admin/users/:id/approve-license', authMiddleware, async (req: any, res: Response) => {
    const user = userStore[req.params.id];
    if (!user) { res.status(404).json({ success: false, message: 'Usuario no encontrado' }); return; }
    if (!user.licenseNumber && !user.licenseDocumentUrl) {
      res.status(400).json({ success: false, message: 'El usuario no tiene matrícula registrada ni documento subido' }); return;
    }
    user.licenseVerified = true;
    user.licenseVerificationStatus = 'approved';
    user.licenseRejectedReason = null;
    user.licenseVerifiedBy = req.user.id;
    user.licenseVerifiedAt = new Date();
    res.json({ success: true, message: 'Matrícula aprobada', user });
  });

  app.post('/api/admin/users/:id/reject-license', authMiddleware, async (req: any, res: Response) => {
    const { reason } = req.body;
    if (!reason || !reason.trim()) {
      res.status(400).json({ success: false, message: 'Se requiere un motivo para rechazar' }); return;
    }
    const user = userStore[req.params.id];
    if (!user) { res.status(404).json({ success: false, message: 'Usuario no encontrado' }); return; }
    user.licenseVerified = false;
    user.licenseVerificationStatus = 'rejected';
    user.licenseRejectedReason = reason.trim();
    user.licenseVerifiedBy = req.user.id;
    user.licenseVerifiedAt = new Date();
    res.json({ success: true, message: 'Matrícula rechazada', user });
  });

  return app;
}

describe('C. Admin license approve/reject', () => {
  let users: Record<string, any>;

  beforeEach(() => {
    users = {
      'u1': { id: 'u1', email: 'user@test.com', licenseNumber: 'MN-123', licenseDocumentUrl: 'https://doc.pdf', licenseVerified: false, licenseVerificationStatus: 'pending' },
      'u-no-license': { id: 'u-no-license', email: 'no@test.com', licenseNumber: null, licenseDocumentUrl: null, licenseVerified: false, licenseVerificationStatus: 'pending' },
    };
  });

  it('approve sets licenseVerificationStatus to approved', async () => {
    const app = buildLicenseApp(users);
    const res = await request(app)
      .post('/api/admin/users/u1/approve-license')
      .set('Authorization', `Bearer ${makeToken('admin-1')}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(users['u1'].licenseVerificationStatus).toBe('approved');
    expect(users['u1'].licenseVerified).toBe(true);
    expect(users['u1'].licenseVerifiedBy).toBe('admin-1');
    expect(users['u1'].licenseRejectedReason).toBeNull();
  });

  it('approve fails when no license data exists', async () => {
    const app = buildLicenseApp(users);
    const res = await request(app)
      .post('/api/admin/users/u-no-license/approve-license')
      .set('Authorization', `Bearer ${makeToken('admin-1')}`)
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('matrícula');
  });

  it('reject sets licenseVerificationStatus to rejected with reason', async () => {
    const app = buildLicenseApp(users);
    const res = await request(app)
      .post('/api/admin/users/u1/reject-license')
      .set('Authorization', `Bearer ${makeToken('admin-1')}`)
      .send({ reason: 'Documento ilegible' })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(users['u1'].licenseVerificationStatus).toBe('rejected');
    expect(users['u1'].licenseRejectedReason).toBe('Documento ilegible');
    expect(users['u1'].licenseVerified).toBe(false);
  });

  it('reject fails without reason', async () => {
    const app = buildLicenseApp(users);
    const res = await request(app)
      .post('/api/admin/users/u1/reject-license')
      .set('Authorization', `Bearer ${makeToken('admin-1')}`)
      .send({})
      .expect(400);
    expect(res.body.success).toBe(false);
  });

  it('reject fails with empty whitespace reason', async () => {
    const app = buildLicenseApp(users);
    const res = await request(app)
      .post('/api/admin/users/u1/reject-license')
      .set('Authorization', `Bearer ${makeToken('admin-1')}`)
      .send({ reason: '   ' })
      .expect(400);
    expect(res.body.success).toBe(false);
  });

  it('approve returns 404 for non-existent user', async () => {
    const app = buildLicenseApp(users);
    const res = await request(app)
      .post('/api/admin/users/ghost/approve-license')
      .set('Authorization', `Bearer ${makeToken('admin-1')}`)
      .expect(404);
    expect(res.body.success).toBe(false);
  });

  it('reject returns 404 for non-existent user', async () => {
    const app = buildLicenseApp(users);
    const res = await request(app)
      .post('/api/admin/users/ghost/reject-license')
      .set('Authorization', `Bearer ${makeToken('admin-1')}`)
      .send({ reason: 'Invalid' })
      .expect(404);
    expect(res.body.success).toBe(false);
  });

  it('status transitions: approved → rejected → approved', async () => {
    const app = buildLicenseApp(users);
    await request(app).post('/api/admin/users/u1/approve-license').set('Authorization', `Bearer ${makeToken('admin-1')}`);
    expect(users['u1'].licenseVerificationStatus).toBe('approved');

    await request(app).post('/api/admin/users/u1/reject-license').set('Authorization', `Bearer ${makeToken('admin-1')}`).send({ reason: 'Error' });
    expect(users['u1'].licenseVerificationStatus).toBe('rejected');

    await request(app).post('/api/admin/users/u1/approve-license').set('Authorization', `Bearer ${makeToken('admin-1')}`);
    expect(users['u1'].licenseVerificationStatus).toBe('approved');
    expect(users['u1'].licenseRejectedReason).toBeNull();
  });
});
