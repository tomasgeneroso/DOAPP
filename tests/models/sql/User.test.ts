/**
 * User Model Tests - PostgreSQL/Sequelize
 */

import { User } from '../../../server/models/sql/User.model.js';

describe('User Model', () => {
  afterEach(async () => {
    await User.destroy({ where: {}, truncate: true, cascade: true });
  });

  afterAll(async () => {
    await User.destroy({ where: {}, truncate: true, cascade: true });
  });

  describe('User Creation', () => {
    it('should create a user with valid data', async () => {
      const user = await User.create({
        name: 'John Doe',
        email: 'john@example.com',
        password: 'hashedPassword123',
      });

      expect(user.id).toBeDefined();
      expect(user.name).toBe('John Doe');
      expect(user.email).toBe('john@example.com');
      expect(user.role).toBe('user'); // Default role
    });

    it('should hash password before save', async () => {
      const plainPassword = 'myPassword123';
      const user = await User.create({
        name: 'Jane Doe',
        email: 'jane@example.com',
        password: plainPassword,
      });

      expect(user.password).not.toBe(plainPassword);
      expect(user.password!.length).toBeGreaterThan(20);
    });

    it('should normalize email to lowercase', async () => {
      const user = await User.create({
        name: 'Test User',
        email: 'TEST@EXAMPLE.COM',
        password: 'password123',
      });

      expect(user.email).toBe('test@example.com');
    });

    it('should fail with invalid email', async () => {
      await expect(
        User.create({
          name: 'Invalid User',
          email: 'not-an-email',
          password: 'password123',
        })
      ).rejects.toThrow();
    });

    it('should fail with duplicate email', async () => {
      await User.create({
        name: 'User 1',
        email: 'duplicate@example.com',
        password: 'password123',
      });

      await expect(
        User.create({
          name: 'User 2',
          email: 'duplicate@example.com',
          password: 'password123',
        })
      ).rejects.toThrow();
    });

    it('should trim name', async () => {
      const user = await User.create({
        name: '  John Doe  ',
        email: 'john2@example.com',
        password: 'password123',
      });

      expect(user.name).toBe('John Doe');
    });
  });

  describe('User Methods', () => {
    let user: User;

    beforeEach(async () => {
      user = await User.create({
        name: 'Test User',
        email: 'test@example.com',
        password: 'Password123!',
      });
    });

    it('should compare password correctly', async () => {
      const isMatch = await user.comparePassword('Password123!');
      expect(isMatch).toBe(true);

      const isNotMatch = await user.comparePassword('WrongPassword');
      expect(isNotMatch).toBe(false);
    });

    it('should check if user is admin', () => {
      expect(user.isAdmin()).toBe(false);

      user.adminRole = 'admin';
      expect(user.isAdmin()).toBe(true);

      user.adminRole = 'super_admin';
      expect(user.isAdmin()).toBe(true);

      user.adminRole = 'owner';
      expect(user.isAdmin()).toBe(true);
    });

    it('should check if user is verified', () => {
      expect(user.isVerifiedUser()).toBe(false);

      user.isVerified = true;
      expect(user.isVerifiedUser()).toBe(true);
    });

    it('should update rating correctly', async () => {
      await user.updateRating(4.5, 'workQuality');
      expect(user.workQualityRating).toBeCloseTo(4.5);
      expect(user.workQualityReviewsCount).toBe(1);

      await user.updateRating(3.5, 'workQuality');
      expect(user.workQualityRating).toBeCloseTo(4.0);
      expect(user.workQualityReviewsCount).toBe(2);
    });

    it('should calculate overall rating', () => {
      user.workQualityRating = 4.5;
      user.workerRating = 4.0;
      user.contractRating = 5.0;
      user.workQualityReviewsCount = 1;
      user.workerReviewsCount = 1;
      user.contractReviewsCount = 1;

      const overall = user.calculateOverallRating();
      expect(overall).toBeCloseTo(4.5);
    });

    it.skip('should ban user', async () => {
      const adminId = 'admin-uuid-123';
      await user.ban(adminId, 'Violated terms of service');

      expect(user.isBanned).toBe(true);
      expect(user.bannedBy).toBe(adminId);
      expect(user.banReason).toBe('Violated terms of service');
      expect(user.bannedAt).toBeDefined();
    });

    it('should unban user', async () => {
      user.isBanned = true;
      await user.unban();

      expect(user.isBanned).toBe(false);
      expect(user.bannedBy).toBeUndefined();
      expect(user.banReason).toBeUndefined();
    });

    it('should enable 2FA', async () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const backupCodes = ['CODE1', 'CODE2', 'CODE3'];

      await user.enable2FA(secret, backupCodes);

      expect(user.twoFactorEnabled).toBe(true);
      expect(user.twoFactorSecret).toBe(secret);
      expect(user.twoFactorBackupCodes).toEqual(backupCodes);
    });

    it('should disable 2FA', async () => {
      user.twoFactorEnabled = true;
      user.twoFactorSecret = 'SECRET';

      await user.disable2FA();

      expect(user.twoFactorEnabled).toBe(false);
      expect(user.twoFactorSecret).toBeUndefined();
      expect(user.twoFactorBackupCodes).toEqual([]);
    });

    it('should use backup code', async () => {
      user.twoFactorBackupCodes = ['CODE1', 'CODE2', 'CODE3'];

      const result = await user.useBackupCode('CODE2');
      expect(result).toBe(true);
      expect(user.twoFactorBackupCodes).toEqual(['CODE1', 'CODE3']);

      const failed = await user.useBackupCode('INVALID');
      expect(failed).toBe(false);
    });
  });

  describe('User Balance', () => {
    let user: User;

    beforeEach(async () => {
      user = await User.create({
        name: 'Balance User',
        email: 'balance@example.com',
        password: 'password123',
        balanceArs: 1000,
      });
    });

    it('should add to balance', async () => {
      await user.addBalance(500);
      expect(parseFloat(user.balanceArs as any)).toBe(1500);
    });

    it('should subtract from balance', async () => {
      await user.subtractBalance(300);
      expect(parseFloat(user.balanceArs as any)).toBe(700);
    });

    it('should fail to subtract more than balance', async () => {
      await expect(user.subtractBalance(1500)).rejects.toThrow('Insufficient balance');
    });

    it('should check sufficient balance', () => {
      expect(user.hasSufficientBalance(500)).toBe(true);
      expect(user.hasSufficientBalance(1500)).toBe(false);
    });
  });

  describe('Membership', () => {
    let user: User;

    beforeEach(async () => {
      user = await User.create({
        name: 'Pro User',
        email: 'pro@example.com',
        password: 'password123',
      });
    });

    it('should activate PRO membership', async () => {
      const startDate = new Date();
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + 1);

      await user.activateMembership('pro', startDate, endDate);

      expect(user.hasMembership).toBe(true);
      expect(user.membershipTier).toBe('pro');
      expect(parseFloat(user.currentCommissionRate as any)).toBe(3.0);
    });

    it('should activate SUPER_PRO membership', async () => {
      const startDate = new Date();
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + 1);

      await user.activateMembership('super_pro', startDate, endDate);

      expect(user.hasMembership).toBe(true);
      expect(user.membershipTier).toBe('super_pro');
      expect(parseFloat(user.currentCommissionRate as any)).toBe(2.0);
    });

    it('should deactivate membership', async () => {
      user.hasMembership = true;
      user.membershipTier = 'pro';

      await user.deactivateMembership();

      expect(user.hasMembership).toBe(false);
      expect(user.membershipTier).toBeUndefined();
      expect(parseFloat(user.currentCommissionRate as any)).toBe(8.0);
    });

    it('should check if membership is active', () => {
      user.hasMembership = false;
      expect(user.hasMembershipActive()).toBe(false);

      user.hasMembership = true;
      user.membershipExpiresAt = new Date(Date.now() + 86400000); // Tomorrow
      expect(user.hasMembershipActive()).toBe(true);

      user.membershipExpiresAt = new Date(Date.now() - 86400000); // Yesterday
      expect(user.hasMembershipActive()).toBe(false);
    });
  });

  describe('Trust Score', () => {
    let user: User;

    beforeEach(async () => {
      user = await User.create({
        name: 'Trust User',
        email: 'trust@example.com',
        password: 'password123',
        trustScore: 50,
      });
    });

    it('should increase trust score', async () => {
      await user.increaseTrustScore(10);
      expect(user.trustScore).toBe(60);
    });

    it('should not exceed max trust score', async () => {
      user.trustScore = 95;
      await user.increaseTrustScore(10);
      expect(user.trustScore).toBe(100);
    });

    it('should decrease trust score', async () => {
      await user.decreaseTrustScore(10);
      expect(user.trustScore).toBe(40);
    });

    it('should not go below zero trust score', async () => {
      user.trustScore = 5;
      await user.decreaseTrustScore(10);
      expect(user.trustScore).toBe(0);
    });
  });
});
