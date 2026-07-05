import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

/**
 * Integration test for the admin role-security flow:
 *   - first-time role password setup is frictionless
 *   - changing an already-set role password requires proof (current / emergency / email code)
 *   - the emergency password is gated by the owner's ACCOUNT password
 *   - the email reset-code path lets the owner change a role password without the old one
 *
 * The store persists to <repo>/.role-passwords.json and can also read
 * ROLE_PASSWORD_* env vars, so we back up/restore the file and clear those env
 * vars to keep the test hermetic.
 */
describe('Admin role security: /api/admin/roles/security/*', () => {
  let app: Express;
  let ownerToken: string;
  let adminToken: string;

  const STORE_PATH = path.join(process.cwd(), '.role-passwords.json');
  let savedStore: string | null = null;
  const savedEnv: Record<string, string | undefined> = {};
  let sendEmailSpy: any;
  const OWNER_ACCOUNT_PASSWORD = 'ownerAccountPass123';

  beforeAll(async () => {
    // Isolate the file-backed store + env fallbacks
    savedStore = fs.existsSync(STORE_PATH) ? fs.readFileSync(STORE_PATH, 'utf-8') : null;
    if (fs.existsSync(STORE_PATH)) fs.rmSync(STORE_PATH);
    for (const k of ['ROLE_PASSWORD_OWNER', 'ROLE_PASSWORD_ADMIN', 'ROLE_PASSWORD_EMERGENCY']) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }

    const { initDatabase } = await import('../../server/config/database.js');
    await initDatabase();

    const { User } = await import('../../server/models/sql/User.model.js');
    const roleRoutes = await import('../../server/routes/admin/roles.js');
    const emailService = (await import('../../server/services/email.js')).default;
    // Don't hit SMTP; capture the outgoing reset code from the email html instead.
    sendEmailSpy = jest.spyOn(emailService, 'sendEmail').mockResolvedValue(true as any);

    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/admin/roles', roleRoutes.default);

    const secret = process.env.JWT_SECRET || 'test-jwt-secret-for-testing-only';
    const stamp = Date.now();

    const owner: any = await User.create({
      email: `owner_${stamp}@test.com`, username: `owner${stamp}`, name: 'The Owner',
      password: OWNER_ACCOUNT_PASSWORD, role: 'client', adminRole: 'owner',
    } as any);
    const admin: any = await User.create({
      email: `admin_${stamp}@test.com`, username: `admin${stamp}`, name: 'Plain Admin',
      password: 'password123', role: 'client', adminRole: 'admin',
    } as any);

    ownerToken = jwt.sign({ id: owner.id, email: owner.email }, secret);
    adminToken = jwt.sign({ id: admin.id, email: admin.email }, secret);
  }, 30000);

  afterAll(() => {
    sendEmailSpy?.mockRestore();
    // Restore the store file exactly as it was
    if (savedStore !== null) fs.writeFileSync(STORE_PATH, savedStore, 'utf-8');
    else if (fs.existsSync(STORE_PATH)) fs.rmSync(STORE_PATH);
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  });

  const putPassword = (token: string, body: Record<string, unknown>) =>
    request(app).put('/api/admin/roles/security/passwords').set('Authorization', `Bearer ${token}`).send(body);

  it('blocks non-owner admins from configuring role passwords', async () => {
    const res = await putPassword(adminToken, { role: 'owner', newPassword: 'whatever123', confirmPassword: 'whatever123' });
    expect(res.status).toBe(403);
  });

  it('allows first-time setup of a role password without verification', async () => {
    const res = await putPassword(ownerToken, { role: 'owner', newPassword: 'ownerRolePass1', confirmPassword: 'ownerRolePass1' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('reports the role password as set in status', async () => {
    const res = await request(app).get('/api/admin/roles/security/status').set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.ownerPasswordSet).toBe(true);
    expect(res.body.data.emergencyPasswordSet).toBe(false);
  });

  it('rejects changing an existing role password with no verification', async () => {
    const res = await putPassword(ownerToken, { role: 'owner', newPassword: 'newOwnerPass2', confirmPassword: 'newOwnerPass2' });
    expect(res.status).toBe(401);
    expect(res.body.requiresVerification).toBe(true);
  });

  it('rejects changing with a wrong current password', async () => {
    const res = await putPassword(ownerToken, {
      role: 'owner', newPassword: 'newOwnerPass2', confirmPassword: 'newOwnerPass2', currentPassword: 'totally-wrong',
    });
    expect(res.status).toBe(401);
  });

  it('accepts changing with the correct current password', async () => {
    const res = await putPassword(ownerToken, {
      role: 'owner', newPassword: 'newOwnerPass2', confirmPassword: 'newOwnerPass2', currentPassword: 'ownerRolePass1',
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('rejects setting the emergency password with a wrong owner account password', async () => {
    const res = await request(app)
      .put('/api/admin/roles/security/emergency-password')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ newPassword: 'emergencyPass9', confirmPassword: 'emergencyPass9', ownerAccountPassword: 'nope-nope' });
    expect(res.status).toBe(401);
  });

  it('sets the emergency password with the correct owner account password', async () => {
    const res = await request(app)
      .put('/api/admin/roles/security/emergency-password')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ newPassword: 'emergencyPass9', confirmPassword: 'emergencyPass9', ownerAccountPassword: OWNER_ACCOUNT_PASSWORD });
    expect(res.status).toBe(200);

    const status = await request(app).get('/api/admin/roles/security/status').set('Authorization', `Bearer ${ownerToken}`);
    expect(status.body.data.emergencyPasswordSet).toBe(true);
  });

  it('changes a role password using the emergency password', async () => {
    const res = await putPassword(ownerToken, {
      role: 'owner', newPassword: 'ownerViaEmergency3', confirmPassword: 'ownerViaEmergency3', emergencyPassword: 'emergencyPass9',
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('emails a reset code that then authorizes a role password change (end-to-end)', async () => {
    sendEmailSpy.mockClear();
    const reqRes = await request(app)
      .post('/api/admin/roles/security/reset-request')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ role: 'admin' });
    expect(reqRes.status).toBe(200);
    expect(sendEmailSpy).toHaveBeenCalledTimes(1);

    // Extract the 8-char hex code emailed to the owner
    const html: string = (sendEmailSpy.mock.calls[0][0] as any).html;
    const code = html.match(/letter-spacing:4px;">([A-F0-9]{8})</)?.[1];
    expect(code).toBeTruthy();

    // First-time admin setup uses no token; use the code to prove a *change* instead:
    // configure admin first, then change it with the code.
    await putPassword(ownerToken, { role: 'admin', newPassword: 'adminFirst123', confirmPassword: 'adminFirst123' });

    // Re-request a fresh code because the token role must match and be unconsumed
    sendEmailSpy.mockClear();
    await request(app)
      .post('/api/admin/roles/security/reset-request')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ role: 'admin' });
    const code2 = ((sendEmailSpy.mock.calls[0][0] as any).html as string).match(/letter-spacing:4px;">([A-F0-9]{8})</)?.[1];

    const changeRes = await putPassword(ownerToken, {
      role: 'admin', newPassword: 'adminViaCode456', confirmPassword: 'adminViaCode456', resetToken: code2,
    });
    expect(changeRes.status).toBe(200);

    // The code is single-use: replaying it must now fail
    const replay = await putPassword(ownerToken, {
      role: 'admin', newPassword: 'adminReplay789', confirmPassword: 'adminReplay789', resetToken: code2,
    });
    expect(replay.status).toBe(401);
  });
});
