/**
 * Payment Model Tests - PostgreSQL/Sequelize
 *
 * Tests comprehensive payment functionality including:
 * - MercadoPago & PayPal support
 * - Escrow system
 * - Bilateral confirmation
 * - Disputes & refunds
 * - Status transitions
 */

import 'reflect-metadata';
import { Payment } from '../../../server/models/sql/Payment.model.js';
import { User } from '../../../server/models/sql/User.model.js';
import { Contract } from '../../../server/models/sql/Contract.model.js';
import { Job } from '../../../server/models/sql/Job.model.js';
import { sequelize } from '../../../server/config/database.js';

describe('Payment Model - SQL', () => {
  let payer: User;
  let recipient: User;
  let contract: Contract;
  let job: Job;

  beforeEach(async () => {
    // Clean tables
    await sequelize.query('TRUNCATE TABLE "payments" RESTART IDENTITY CASCADE');
    await sequelize.query('TRUNCATE TABLE "contracts" RESTART IDENTITY CASCADE');
    await sequelize.query('TRUNCATE TABLE "jobs" RESTART IDENTITY CASCADE');
    await sequelize.query('TRUNCATE TABLE "users" RESTART IDENTITY CASCADE');

    // Create test users
    payer = await User.create({
      email: 'payer@test.com',
      username: 'payer',
      passwordHash: 'hash123',
      name: 'Payer User',
      firstName: 'Payer',
      lastName: 'User',
    });

    recipient = await User.create({
      email: 'recipient@test.com',
      username: 'recipient',
      passwordHash: 'hash456',
      name: 'Recipient User',
      firstName: 'Recipient',
      lastName: 'User',
    });

    // Create test job
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);

    job = await Job.create({
      title: 'Test Job',
      description: 'Test description',
      summary: 'Test job for Payment tests',
      price: 10000,
      category: 'technology',
      location: 'Buenos Aires',
      clientId: payer.id,
      startDate: tomorrow,
      endDate: nextWeek,
    });

    // Create test contract
    contract = await Contract.create({
      jobId: job.id,
      doerId: recipient.id,
      clientId: payer.id,
      price: 10000,
      startDate: tomorrow,
      endDate: nextWeek,
      type: 'fixed',
    });
  });

  afterAll(async () => {
    await sequelize.query('TRUNCATE TABLE "payments" RESTART IDENTITY CASCADE');
    await sequelize.query('TRUNCATE TABLE "contracts" RESTART IDENTITY CASCADE');
    await sequelize.query('TRUNCATE TABLE "jobs" RESTART IDENTITY CASCADE');
    await sequelize.query('TRUNCATE TABLE "users" RESTART IDENTITY CASCADE');
  });

  // ============================================
  // CREATION & BASIC FIELDS
  // ============================================

  describe('Creation & Basic Fields', () => {
    it('should create a payment with required fields', async () => {
      const payment = await Payment.create({
        contractId: contract.id,
        payerId: payer.id,
        recipientId: recipient.id,
        amount: 10000,
        currency: 'ARS',
        paymentType: 'contract_payment',
        paymentMethod: 'mercadopago',
      });

      expect(payment.id).toBeDefined();
      expect(payment.payerId).toBe(payer.id);
      expect(payment.recipientId).toBe(recipient.id);
      expect(parseFloat(payment.amount as any)).toBe(10000);
      expect(payment.currency).toBe('ARS');
      expect(payment.status).toBe('pending');
      expect(payment.paymentType).toBe('contract_payment');
      expect(payment.paymentMethod).toBe('mercadopago');
      expect(payment.isEscrow).toBe(true); // default
    });

    it('should create payment without contract (membership)', async () => {
      const payment = await Payment.create({
        payerId: payer.id,
        amount: 599,
        currency: 'ARS',
        paymentType: 'membership',
        paymentMethod: 'mercadopago',
      });

      expect(payment.id).toBeDefined();
      expect(payment.contractId).toBeNull();
      expect(payment.recipientId).toBeNull();
      expect(payment.paymentType).toBe('membership');
    });

    it('should default to MercadoPago', async () => {
      const payment = await Payment.create({
        payerId: payer.id,
        amount: 1000,
        paymentType: 'membership',
      });

      expect(payment.paymentMethod).toBe('mercadopago');
      expect(payment.currency).toBe('ARS');
    });

    it('should store exchange rates', async () => {
      const payment = await Payment.create({
        contractId: contract.id,
        payerId: payer.id,
        recipientId: recipient.id,
        amount: 10000,
        currency: 'ARS',
        paymentType: 'contract_payment',
        amountUsd: 10,
        amountArs: 10000,
        exchangeRate: 1000,
      });

      expect(parseFloat(payment.amountUsd as any)).toBe(10);
      expect(parseFloat(payment.amountArs as any)).toBe(10000);
      expect(parseFloat(payment.exchangeRate as any)).toBe(1000);
    });
  });

  // ============================================
  // MERCADOPAGO FIELDS
  // ============================================

  describe('MercadoPago Fields', () => {
    it('should store MercadoPago IDs', async () => {
      const payment = await Payment.create({
        payerId: payer.id,
        amount: 10000,
        paymentType: 'contract_payment',
        paymentMethod: 'mercadopago',
        mercadopagoPaymentId: 'MP123456789',
        mercadopagoPreferenceId: 'PREF123',
        mercadopagoStatus: 'approved',
        mercadopagoStatusDetail: 'accredited',
      });

      expect(payment.mercadopagoPaymentId).toBe('MP123456789');
      expect(payment.mercadopagoPreferenceId).toBe('PREF123');
      expect(payment.mercadopagoStatus).toBe('approved');
      expect(payment.mercadopagoStatusDetail).toBe('accredited');
    });

    it('should enforce unique MercadoPago payment ID', async () => {
      await Payment.create({
        payerId: payer.id,
        amount: 1000,
        paymentType: 'membership',
        mercadopagoPaymentId: 'MP_UNIQUE',
      });

      await expect(
        Payment.create({
          payerId: recipient.id,
          amount: 2000,
          paymentType: 'membership',
          mercadopagoPaymentId: 'MP_UNIQUE',
        })
      ).rejects.toThrow();
    });
  });

  // ============================================
  // PAYPAL FIELDS (Legacy)
  // ============================================

  describe('PayPal Fields (Legacy)', () => {
    it('should store PayPal IDs', async () => {
      const payment = await Payment.create({
        payerId: payer.id,
        amount: 100,
        currency: 'USD',
        paymentType: 'contract_payment',
        paymentMethod: 'paypal',
        paypalOrderId: 'ORDER123',
        paypalCaptureId: 'CAPTURE456',
        paypalPayerId: 'PAYER789',
        paypalPayerEmail: 'payer@paypal.com',
      });

      expect(payment.paypalOrderId).toBe('ORDER123');
      expect(payment.paypalCaptureId).toBe('CAPTURE456');
      expect(payment.paypalPayerId).toBe('PAYER789');
      expect(payment.paypalPayerEmail).toBe('payer@paypal.com');
    });

    it('should enforce unique PayPal order ID', async () => {
      await Payment.create({
        payerId: payer.id,
        amount: 100,
        paymentType: 'membership',
        paymentMethod: 'paypal',
        paypalOrderId: 'UNIQUE_ORDER',
      });

      await expect(
        Payment.create({
          payerId: recipient.id,
          amount: 200,
          paymentType: 'membership',
          paymentMethod: 'paypal',
          paypalOrderId: 'UNIQUE_ORDER',
        })
      ).rejects.toThrow();
    });
  });

  // ============================================
  // ESCROW SYSTEM
  // ============================================

  describe('Escrow System', () => {
    it('should check if payment is in escrow', async () => {
      const payment = await Payment.create({
        contractId: contract.id,
        payerId: payer.id,
        recipientId: recipient.id,
        amount: 10000,
        paymentType: 'escrow_deposit',
        status: 'held_escrow',
        isEscrow: true,
      });

      expect(payment.isInEscrow()).toBe(true);
    });

    it('should return false if escrow released', async () => {
      const payment = await Payment.create({
        contractId: contract.id,
        payerId: payer.id,
        recipientId: recipient.id,
        amount: 10000,
        paymentType: 'escrow_deposit',
        status: 'held_escrow',
        isEscrow: true,
        escrowReleasedAt: new Date(),
      });

      expect(payment.isInEscrow()).toBe(false);
    });

    it('should release escrow', async () => {
      const payment = await Payment.create({
        contractId: contract.id,
        payerId: payer.id,
        recipientId: recipient.id,
        amount: 10000,
        paymentType: 'escrow_deposit',
        status: 'held_escrow',
        isEscrow: true,
      });

      await payment.releaseEscrow(payer.id);

      expect(payment.escrowReleasedAt).toBeDefined();
      expect(payment.escrowReleasedBy).toBe(payer.id);
      expect(payment.status).toBe('completed');
    });

    it('should throw if releasing non-escrow payment', async () => {
      const payment = await Payment.create({
        payerId: payer.id,
        amount: 1000,
        paymentType: 'membership',
        status: 'completed',
        isEscrow: false,
      });

      await expect(payment.releaseEscrow()).rejects.toThrow('Payment is not in escrow');
    });
  });

  // ============================================
  // BILATERAL CONFIRMATION
  // ============================================

  describe('Bilateral Confirmation', () => {
    it('should confirm payment by payer', async () => {
      const payment = await Payment.create({
        contractId: contract.id,
        payerId: payer.id,
        recipientId: recipient.id,
        amount: 10000,
        paymentType: 'contract_payment',
        status: 'awaiting_confirmation',
      });

      const confirmed = await payment.confirmPayment(payer.id);

      expect(confirmed).toBe(false); // not both confirmed yet
      expect(payment.payerConfirmed).toBe(true);
      expect(payment.payerConfirmedAt).toBeDefined();
      expect(payment.recipientConfirmed).toBe(false);
    });

    it('should confirm payment by recipient', async () => {
      const payment = await Payment.create({
        contractId: contract.id,
        payerId: payer.id,
        recipientId: recipient.id,
        amount: 10000,
        paymentType: 'contract_payment',
        status: 'awaiting_confirmation',
      });

      const confirmed = await payment.confirmPayment(recipient.id);

      expect(confirmed).toBe(false);
      expect(payment.recipientConfirmed).toBe(true);
      expect(payment.recipientConfirmedAt).toBeDefined();
      expect(payment.payerConfirmed).toBe(false);
    });

    it('should detect both parties confirmed', async () => {
      const payment = await Payment.create({
        contractId: contract.id,
        payerId: payer.id,
        recipientId: recipient.id,
        amount: 10000,
        paymentType: 'contract_payment',
        status: 'awaiting_confirmation',
      });

      await payment.confirmPayment(payer.id);
      const bothConfirmed = await payment.confirmPayment(recipient.id);

      expect(bothConfirmed).toBe(true);
      expect(payment.isBothPartiesConfirmed()).toBe(true);
    });

    it('should return false if confirming with invalid user', async () => {
      const payment = await Payment.create({
        contractId: contract.id,
        payerId: payer.id,
        recipientId: recipient.id,
        amount: 10000,
        paymentType: 'contract_payment',
        status: 'awaiting_confirmation',
      });

      const otherUser = await User.create({
        email: 'other@test.com',
        username: 'other',
        passwordHash: 'hash',
        name: 'Other User',
        firstName: 'Other',
        lastName: 'User',
      });

      const confirmed = await payment.confirmPayment(otherUser.id);

      expect(confirmed).toBe(false);
      expect(payment.payerConfirmed).toBe(false);
      expect(payment.recipientConfirmed).toBe(false);
    });

    it('should auto-release escrow when both confirm', async () => {
      const payment = await Payment.create({
        contractId: contract.id,
        payerId: payer.id,
        recipientId: recipient.id,
        amount: 10000,
        paymentType: 'escrow_deposit',
        status: 'held_escrow',
        isEscrow: true,
      });

      await payment.confirmPayment(payer.id);
      await payment.confirmPayment(recipient.id);

      await payment.reload();

      expect(payment.status).toBe('completed');
      expect(payment.escrowReleasedAt).toBeDefined();
    });

    it('should check if payment can be released', async () => {
      const payment = await Payment.create({
        contractId: contract.id,
        payerId: payer.id,
        recipientId: recipient.id,
        amount: 10000,
        paymentType: 'escrow_deposit',
        status: 'held_escrow',
        isEscrow: true,
        payerConfirmed: true,
        recipientConfirmed: true,
      });

      expect(payment.canBeReleased()).toBe(true);
    });
  });

  // ============================================
  // DISPUTES
  // ============================================

  describe('Disputes', () => {
    it('should mark payment as disputed', async () => {
      const payment = await Payment.create({
        contractId: contract.id,
        payerId: payer.id,
        recipientId: recipient.id,
        amount: 10000,
        paymentType: 'contract_payment',
        status: 'held_escrow',
      });

      const disputeId = '550e8400-e29b-41d4-a716-446655440000'; // Valid UUID
      await payment.markAsDisputed(payer.id, 'Work not completed', disputeId);

      expect(payment.status).toBe('disputed');
      expect(payment.disputedBy).toBe(payer.id);
      expect(payment.disputeReason).toBe('Work not completed');
      expect(payment.disputeId).toBe(disputeId);
      expect(payment.disputedAt).toBeDefined();
    });

    it('should check if payment is disputed', async () => {
      const disputeId = '550e8400-e29b-41d4-a716-446655440001';
      const payment = await Payment.create({
        contractId: contract.id,
        payerId: payer.id,
        recipientId: recipient.id,
        amount: 10000,
        paymentType: 'contract_payment',
        status: 'disputed',
        disputeId: disputeId,
      });

      expect(payment.isDisputed()).toBe(true);
    });

    it('should detect disputed by status', async () => {
      const payment = await Payment.create({
        payerId: payer.id,
        amount: 1000,
        paymentType: 'membership',
        status: 'disputed',
      });

      expect(payment.isDisputed()).toBe(true);
    });

    it('should detect disputed by disputeId', async () => {
      const disputeId = '550e8400-e29b-41d4-a716-446655440002';
      const payment = await Payment.create({
        payerId: payer.id,
        amount: 1000,
        paymentType: 'membership',
        status: 'held_escrow',
        disputeId: disputeId,
      });

      expect(payment.isDisputed()).toBe(true);
    });
  });

  // ============================================
  // REFUNDS
  // ============================================

  describe('Refunds', () => {
    it('should process refund', async () => {
      const payment = await Payment.create({
        contractId: contract.id,
        payerId: payer.id,
        recipientId: recipient.id,
        amount: 10000,
        paymentType: 'contract_payment',
        status: 'held_escrow',
      });

      await payment.processRefund('Client cancelled', payer.id);

      expect(payment.status).toBe('refunded');
      expect(payment.refundReason).toBe('Client cancelled');
      expect(payment.refundedBy).toBe(payer.id);
      expect(payment.refundedAt).toBeDefined();
    });

    it('should throw if already refunded', async () => {
      const payment = await Payment.create({
        payerId: payer.id,
        amount: 1000,
        paymentType: 'membership',
        status: 'refunded',
      });

      await expect(payment.processRefund('reason', payer.id)).rejects.toThrow(
        'Payment already refunded'
      );
    });

    it('should check if payment is refunded', async () => {
      const payment = await Payment.create({
        payerId: payer.id,
        amount: 1000,
        paymentType: 'membership',
        status: 'refunded',
      });

      expect(payment.isRefunded()).toBe(true);
    });
  });

  // ============================================
  // STATUS CHECKS
  // ============================================

  describe('Status Checks', () => {
    it('should check if payment is completed', async () => {
      const payment = await Payment.create({
        payerId: payer.id,
        amount: 1000,
        paymentType: 'membership',
        status: 'completed',
      });

      expect(payment.isCompleted()).toBe(true);
    });

    it('should return false for non-completed payment', async () => {
      const payment = await Payment.create({
        payerId: payer.id,
        amount: 1000,
        paymentType: 'membership',
        status: 'pending',
      });

      expect(payment.isCompleted()).toBe(false);
    });
  });

  // ============================================
  // PROVIDER METHODS
  // ============================================

  describe('Provider Methods', () => {
    it('should get MercadoPago provider name', async () => {
      const payment = await Payment.create({
        payerId: payer.id,
        amount: 1000,
        paymentType: 'membership',
        paymentMethod: 'mercadopago',
      });

      expect(payment.getProviderName()).toBe('MercadoPago');
    });

    it('should get PayPal provider name', async () => {
      const payment = await Payment.create({
        payerId: payer.id,
        amount: 100,
        paymentType: 'membership',
        paymentMethod: 'paypal',
      });

      expect(payment.getProviderName()).toBe('PayPal');
    });

    it('should get MercadoPago external ID', async () => {
      const payment = await Payment.create({
        payerId: payer.id,
        amount: 1000,
        paymentType: 'membership',
        paymentMethod: 'mercadopago',
        mercadopagoPaymentId: 'MP123',
      });

      expect(payment.getExternalPaymentId()).toBe('MP123');
    });

    it('should get PayPal external ID', async () => {
      const payment = await Payment.create({
        payerId: payer.id,
        amount: 100,
        paymentType: 'membership',
        paymentMethod: 'paypal',
        paypalOrderId: 'ORDER456',
      });

      expect(payment.getExternalPaymentId()).toBe('ORDER456');
    });
  });

  // ============================================
  // RELATIONSHIPS
  // ============================================

  describe('Relationships', () => {
    it('should belong to payer', async () => {
      const payment = await Payment.create({
        payerId: payer.id,
        amount: 1000,
        paymentType: 'membership',
      });

      const found = await Payment.findByPk(payment.id, {
        include: [{ model: User, as: 'payer' }],
      });

      expect(found?.payer).toBeDefined();
      expect(found?.payer?.email).toBe('payer@test.com');
    });

    it('should belong to recipient', async () => {
      const payment = await Payment.create({
        contractId: contract.id,
        payerId: payer.id,
        recipientId: recipient.id,
        amount: 10000,
        paymentType: 'contract_payment',
      });

      const found = await Payment.findByPk(payment.id, {
        include: [{ model: User, as: 'recipient' }],
      });

      expect(found?.recipient).toBeDefined();
      expect(found?.recipient?.email).toBe('recipient@test.com');
    });

    it('should belong to contract', async () => {
      const payment = await Payment.create({
        contractId: contract.id,
        payerId: payer.id,
        recipientId: recipient.id,
        amount: 10000,
        paymentType: 'contract_payment',
      });

      const found = await Payment.findByPk(payment.id, {
        include: [Contract],
      });

      expect(found?.contract).toBeDefined();
      expect(parseFloat(found?.contract?.price as any)).toBe(10000);
    });
  });

  // ============================================
  // METADATA
  // ============================================

  describe('Metadata', () => {
    it('should store description', async () => {
      const payment = await Payment.create({
        payerId: payer.id,
        amount: 1000,
        paymentType: 'membership',
        description: 'PRO membership - Monthly',
      });

      expect(payment.description).toBe('PRO membership - Monthly');
    });

    it('should store metadata as JSONB', async () => {
      const payment = await Payment.create({
        payerId: payer.id,
        amount: 1000,
        paymentType: 'membership',
        metadata: {
          tier: 'pro',
          duration: 'monthly',
          discountApplied: false,
        },
      });

      expect(payment.metadata).toEqual({
        tier: 'pro',
        duration: 'monthly',
        discountApplied: false,
      });
    });
  });

  // ============================================
  // COMPLEX WORKFLOWS
  // ============================================

  describe('Complex Workflows', () => {
    it('should handle complete escrow workflow', async () => {
      // 1. Create payment in escrow
      const payment = await Payment.create({
        contractId: contract.id,
        payerId: payer.id,
        recipientId: recipient.id,
        amount: 10000,
        paymentType: 'escrow_deposit',
        status: 'held_escrow',
        isEscrow: true,
        mercadopagoPaymentId: 'MP_ESCROW_123',
      });

      expect(payment.isInEscrow()).toBe(true);
      expect(payment.canBeReleased()).toBe(false);

      // 2. Payer confirms
      await payment.confirmPayment(payer.id);
      expect(payment.payerConfirmed).toBe(true);
      expect(payment.canBeReleased()).toBe(false);

      // 3. Recipient confirms
      await payment.confirmPayment(recipient.id);
      expect(payment.recipientConfirmed).toBe(true);

      // 4. Auto-released
      await payment.reload();
      expect(payment.status).toBe('completed');
      expect(payment.escrowReleasedAt).toBeDefined();
      expect(payment.isInEscrow()).toBe(false);
    });

    it('should handle dispute workflow', async () => {
      const payment = await Payment.create({
        contractId: contract.id,
        payerId: payer.id,
        recipientId: recipient.id,
        amount: 10000,
        paymentType: 'contract_payment',
        status: 'held_escrow',
        isEscrow: true,
      });

      // Client disputes
      const disputeId = '550e8400-e29b-41d4-a716-446655440003';
      await payment.markAsDisputed(payer.id, 'Incomplete work', disputeId);

      expect(payment.status).toBe('disputed');
      expect(payment.isDisputed()).toBe(true);
      expect(payment.disputeReason).toBe('Incomplete work');

      // Admin resolves with refund
      await payment.processRefund('Admin decision: refund client', payer.id);

      expect(payment.status).toBe('refunded');
      expect(payment.isRefunded()).toBe(true);
    });

    it('should handle membership payment', async () => {
      const payment = await Payment.create({
        payerId: payer.id,
        amount: 599,
        currency: 'ARS',
        paymentType: 'membership',
        paymentMethod: 'mercadopago',
        mercadopagoPaymentId: 'MP_MEMBERSHIP_789',
        mercadopagoStatus: 'approved',
        status: 'completed',
        description: 'PRO Membership - Monthly',
        metadata: {
          tier: 'pro',
          billingCycle: 'monthly',
        },
      });

      expect(payment.contractId).toBeNull();
      expect(payment.recipientId).toBeNull();
      expect(payment.isEscrow).toBe(true); // default
      expect(payment.isCompleted()).toBe(true);
      expect(payment.getProviderName()).toBe('MercadoPago');
      expect(payment.metadata).toHaveProperty('tier', 'pro');
    });
  });
});
