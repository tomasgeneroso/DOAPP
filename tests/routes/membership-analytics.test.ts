import { describe, it, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';

/**
 * Integration test for the SUPER PRO financial analytics endpoint.
 * Covers: auth required (401), SUPER PRO gating (403 for non-super_pro),
 * and the success shape (200) for a super_pro user with a completed contract.
 */
describe('GET /api/membership/analytics', () => {
  let app: Express;
  let superToken: string;
  let freeToken: string;

  beforeAll(async () => {
    // Initialize the DB first so all models register in the correct order
    // (avoids the model circular-import TDZ that breaks bare model imports).
    const { initDatabase } = await import('../../server/config/database.js');
    await initDatabase();

    const { User } = await import('../../server/models/sql/User.model.js');
    const { Job } = await import('../../server/models/sql/Job.model.js');
    const { Contract } = await import('../../server/models/sql/Contract.model.js');
    const membershipRoutes = await import('../../server/routes/membership.js');

    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/membership', membershipRoutes.default);

    const secret = process.env.JWT_SECRET || 'test-jwt-secret-for-testing-only';
    const stamp = Date.now();

    const superUser: any = await User.create({
      email: `super_${stamp}@test.com`, username: `superpro${stamp}`, name: 'Super Pro', password: 'password123',
      role: 'doer', hasMembership: true, membershipTier: 'super_pro',
    } as any);
    const freeUser: any = await User.create({
      email: `free_${stamp}@test.com`, username: `freeuser${stamp}`, name: 'Free User', password: 'password123',
      role: 'doer', hasMembership: false, membershipTier: 'free',
    } as any);
    const client: any = await User.create({
      email: `client_${stamp}@test.com`, username: `cliente${stamp}`, name: 'Cliente', password: 'password123', role: 'client',
    } as any);

    const job: any = await Job.create({
      title: 'Trabajo de prueba', description: 'desc', summary: 'resumen', price: 10000,
      clientId: client.id, category: 'Hogar', status: 'completed',
      location: 'Buenos Aires', startDate: new Date(),
    } as any);
    await Contract.create({
      jobId: job.id, clientId: client.id, doerId: superUser.id, type: 'trabajo',
      price: 10000, commission: 100, status: 'completed', paymentStatus: 'completed',
      startDate: new Date(Date.now() - 2 * 86400000), endDate: new Date(Date.now() - 86400000),
    } as any);

    superToken = jwt.sign({ id: superUser.id, email: superUser.email }, secret);
    freeToken = jwt.sign({ id: freeUser.id, email: freeUser.email }, secret);
  }, 30000); // DB init + seeding can exceed the default 5s hook timeout on a cold connection

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/membership/analytics');
    expect(res.status).toBe(401);
  });

  it('returns 403 for a non-SUPER PRO user', async () => {
    const res = await request(app).get('/api/membership/analytics').set('Authorization', `Bearer ${freeToken}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('SUPER_PRO_REQUIRED');
  });

  it('returns 200 with the analytics shape for a SUPER PRO user', async () => {
    const res = await request(app).get('/api/membership/analytics').set('Authorization', `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const d = res.body.data;
    expect(d).toHaveProperty('facturacionAnual');
    expect(d).toHaveProperty('reputacion');
    expect(d).toHaveProperty('crecimiento');
    expect(d).toHaveProperty('profesional');
    expect(Array.isArray(d.facturas)).toBe(true);
    expect(Array.isArray(d.evolucionMensual)).toBe(true);
    // the seeded completed contract (10000) should be reflected
    expect(d.facturacionAnual).toBeGreaterThanOrEqual(10000);
  });
});
