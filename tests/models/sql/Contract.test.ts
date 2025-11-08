/**
 * Contract Model Tests - PostgreSQL/Sequelize
 */

import { Contract } from '../../../server/models/sql/Contract.model.js';
import { User } from '../../../server/models/sql/User.model.js';
import { Job } from '../../../server/models/sql/Job.model.js';

// Helper function to create contract with default dates
const createContractWithDefaults = (data: any) => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);

  return Contract.create({
    startDate: tomorrow,
    endDate: nextWeek,
    type: 'fixed',
    ...data,
  });
};

describe('Contract Model', () => {
  let client: User;
  let doer: User;
  let job: Job;

  beforeAll(async () => {
    // Clean up first to avoid conflicts with User test data
    await Contract.destroy({ where: {}, truncate: true, cascade: true });
    await Job.destroy({ where: {}, truncate: true, cascade: true });
    await User.destroy({ where: {}, truncate: true, cascade: true });

    // Create test users
    client = await User.create({
      name: 'Client User',
      email: 'client@example.com',
      password: 'password123',
    });

    doer = await User.create({
      name: 'Doer User',
      email: 'doer@example.com',
      password: 'password123',
    });

    // Create test job
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);

    job = await Job.create({
      clientId: client.id,
      title: 'Test Job',
      summary: 'Test job summary',
      description: 'Test job description',
      price: 10000,
      category: 'Programming',
      status: 'open',
      location: 'Buenos Aires, Argentina',
      startDate: tomorrow,
      endDate: nextWeek,
    });
  });

  afterEach(async () => {
    // Clean up contracts only (Job and Users are reused across tests)
    await Contract.destroy({ where: {}, truncate: true, cascade: true });
  });

  afterAll(async () => {
    // Final cleanup of all data
    await Contract.destroy({ where: {}, truncate: true, cascade: true });
    await Job.destroy({ where: {}, truncate: true, cascade: true });
    await User.destroy({ where: {}, truncate: true, cascade: true });
  });

  describe('Contract Creation', () => {
    it('should create a contract with valid data', async () => {
      const contract = await createContractWithDefaults({
        jobId: job.id,
        clientId: client.id,
        doerId: doer.id,
        price: 10000,
        commission: 800,
        totalPrice: 10800,
        type: 'fixed',
        status: 'pending',
        terms: 'Standard contract terms',
      });

      expect(contract.id).toBeDefined();
      expect(parseFloat(contract.price as any)).toBe(10000);
      expect(parseFloat(contract.commission as any)).toBe(800);
      expect(contract.status).toBe('pending');
    });

    it('should calculate commission correctly', async () => {
      const contract = await createContractWithDefaults({
        jobId: job.id,
        clientId: client.id,
        doerId: doer.id,
        price: 10000,
        commission: 0,
        totalPrice: 0,
        terms: 'Test terms',
      });

      await contract.calculateCommission(8.0);
      expect(parseFloat(contract.commission as any)).toBe(800);
      expect(parseFloat(contract.totalPrice as any)).toBe(10800);
    });

    it('should fail with negative price', async () => {
      await expect(
        createContractWithDefaults({
          jobId: job.id,
          clientId: client.id,
          doerId: doer.id,
          price: -100,
          commission: 0,
          totalPrice: 0,
          terms: 'Test',
        })
      ).rejects.toThrow();
    });
  });

  describe('Contract Status', () => {
    let contract: Contract;

    beforeEach(async () => {
      contract = await createContractWithDefaults({
        jobId: job.id,
        clientId: client.id,
        doerId: doer.id,
        price: 10000,
        commission: 800,
        totalPrice: 10800,
        status: 'pending',
        terms: 'Test terms',
      });
    });

    it('should check if contract is active', () => {
      expect(contract.isActive()).toBe(false);

      contract.status = 'active';
      expect(contract.isActive()).toBe(true);
    });

    it('should check if contract is completed', () => {
      expect(contract.isCompleted()).toBe(false);

      contract.status = 'completed';
      expect(contract.isCompleted()).toBe(true);
    });

    it('should check if contract is cancelled', () => {
      expect(contract.isCancelled()).toBe(false);

      contract.status = 'cancelled';
      expect(contract.isCancelled()).toBe(true);
    });
  });

  describe('Escrow System', () => {
    let contract: Contract;

    beforeEach(async () => {
      contract = await createContractWithDefaults({
        jobId: job.id,
        clientId: client.id,
        doerId: doer.id,
        price: 10000,
        commission: 800,
        totalPrice: 10800,
        escrowEnabled: true,
        escrowAmount: 10800,
        escrowStatus: 'held_escrow',
        status: 'active',
        terms: 'Test terms',
      });
    });

    it('should release escrow funds', async () => {
      // Reload contract to ensure fresh data
      await contract.reload();
      await contract.releaseEscrow('payment-id-123');

      expect(contract.escrowStatus).toBe('released');
      expect(contract.escrowPaymentId).toBe('payment-id-123');
    });

    it('should refund escrow funds', async () => {
      await contract.reload();
      await contract.refundEscrow();

      expect(contract.escrowStatus).toBe('refunded');
    });

    it('should fail to release if not in held_escrow', async () => {
      contract.escrowStatus = 'released';

      await expect(contract.releaseEscrow('payment-id')).rejects.toThrow();
    });
  });

  describe('Pairing System', () => {
    let contract: Contract;

    beforeEach(async () => {
      contract = await createContractWithDefaults({
        jobId: job.id,
        clientId: client.id,
        doerId: doer.id,
        price: 10000,
        commission: 800,
        totalPrice: 10800,
        status: 'pending',
        terms: 'Test terms',
      });
    });

    it('should generate pairing code', () => {
      const code = contract.generatePairingCode();

      expect(code).toBeDefined();
      expect(code.length).toBe(6);
      expect(contract.pairingCode).toBe(code);
      expect(contract.pairingExpiry).toBeDefined();
    });

    it('should confirm pairing for client', async () => {
      contract.generatePairingCode();

      await contract.confirmPairing(client.id);

      expect(contract.clientConfirmedPairing).toBe(true);
    });

    it('should confirm pairing for doer', async () => {
      contract.generatePairingCode();

      await contract.confirmPairing(doer.id);

      expect(contract.doerConfirmedPairing).toBe(true);
    });

    it('should check if both parties confirmed pairing', () => {
      expect(contract.isBothPartiesConfirmedPairing()).toBe(false);

      contract.clientConfirmedPairing = true;
      expect(contract.isBothPartiesConfirmedPairing()).toBe(false);

      contract.doerConfirmedPairing = true;
      expect(contract.isBothPartiesConfirmedPairing()).toBe(true);
    });

    it('should check if pairing code is expired', () => {
      contract.pairingCode = '123456';
      contract.pairingCodeExpiresAt = new Date(Date.now() + 60000); // 1 minute future
      expect(contract.isPairingExpired()).toBe(false);

      contract.pairingCodeExpiresAt = new Date(Date.now() - 60000); // 1 minute past
      expect(contract.isPairingExpired()).toBe(true);
    });
  });

  describe('Completion Confirmation', () => {
    let contract: Contract;

    beforeEach(async () => {
      contract = await createContractWithDefaults({
        jobId: job.id,
        clientId: client.id,
        doerId: doer.id,
        price: 10000,
        commission: 800,
        totalPrice: 10800,
        status: 'active',
        terms: 'Test terms',
      });
    });

    it('should confirm completion by client', async () => {
      await contract.confirmCompletion(client.id);

      expect(contract.clientConfirmedCompletion).toBe(true);
    });

    it('should confirm completion by doer', async () => {
      await contract.confirmCompletion(doer.id);

      expect(contract.doerConfirmedCompletion).toBe(true);
    });

    it('should mark as completed when both confirm', async () => {
      await contract.confirmCompletion(client.id);
      await contract.confirmCompletion(doer.id);

      expect(contract.status).toBe('completed');
      expect(contract.completedAt).toBeDefined();
    });

    it('should check if both parties confirmed', () => {
      expect(contract.isBothPartiesConfirmed()).toBe(false);

      contract.clientConfirmed = true;
      expect(contract.isBothPartiesConfirmed()).toBe(false);

      contract.doerConfirmed = true;
      expect(contract.isBothPartiesConfirmed()).toBe(true);
    });
  });

  describe('Contract Extensions', () => {
    let contract: Contract;

    beforeEach(async () => {
      contract = await createContractWithDefaults({
        jobId: job.id,
        clientId: client.id,
        doerId: doer.id,
        price: 10000,
        commission: 800,
        totalPrice: 10800,
        status: 'active',
        startDate: new Date(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        terms: 'Test terms',
      });
    });

    it('should check if can be extended', () => {
      expect(contract.canBeExtended()).toBe(true);

      contract.isExtended = true;
      expect(contract.canBeExtended()).toBe(false);
    });

    it('should extend contract', async () => {
      const newEndDate = new Date(contract.endDate);
      newEndDate.setDate(newEndDate.getDate() + 7);

      await contract.extendContract(newEndDate, 'Client requested extension', 2000);

      expect(contract.isExtended).toBe(true);
      expect(contract.extensionReason).toBe('Client requested extension');
      expect(parseFloat(contract.extensionPrice as any)).toBe(2000);
    });

    it('should fail to extend already extended contract', async () => {
      contract.isExtended = true;

      const newEndDate = new Date(contract.endDate);
      newEndDate.setDate(newEndDate.getDate() + 7);

      await expect(contract.extendContract(newEndDate, 'test', 1000)).rejects.toThrow();
    });

    it('should calculate extension end date', () => {
      const extensionDate = contract.getExtensionEndDate(5);

      expect(extensionDate).toBeDefined();
      const daysDiff = Math.round(
        (extensionDate.getTime() - contract.endDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      expect(daysDiff).toBe(5);
    });
  });

  describe('Price Modification', () => {
    let contract: Contract;

    beforeEach(async () => {
      contract = await createContractWithDefaults({
        jobId: job.id,
        clientId: client.id,
        doerId: doer.id,
        price: 10000,
        commission: 800,
        totalPrice: 10800,
        status: 'active',
        terms: 'Test terms',
        priceModificationHistory: [],
      });
    });

    it('should modify price', async () => {
      await contract.modifyPrice(12000, 'Increased scope', client.id);

      expect(parseFloat(contract.price as any)).toBe(12000);
      expect(contract.priceModificationHistory.length).toBe(1);

      const mod = contract.priceModificationHistory[0];
      expect(parseFloat(mod.previousPrice as any)).toBe(10000);
      expect(parseFloat(mod.newPrice as any)).toBe(12000);
      expect(mod.reason).toBe('Increased scope');
      expect(mod.modifiedBy).toBe(client.id);
    });

    it('should get price modification history', () => {
      contract.priceModificationHistory = [
        {
          previousPrice: 10000,
          newPrice: 12000,
          reason: 'Scope increase',
          modifiedBy: client.id,
          modifiedAt: new Date(),
          paymentDifference: 2000,
        },
        {
          previousPrice: 12000,
          newPrice: 11000,
          reason: 'Adjusted',
          modifiedBy: client.id,
          modifiedAt: new Date(),
          paymentDifference: -1000,
        },
      ];

      const history = contract.getPriceHistory();
      expect(history.length).toBe(2);
    });
  });

  describe('Deliveries', () => {
    let contract: Contract;

    beforeEach(async () => {
      contract = await createContractWithDefaults({
        jobId: job.id,
        clientId: client.id,
        doerId: doer.id,
        price: 10000,
        commission: 800,
        totalPrice: 10800,
        status: 'active',
        terms: 'Test terms',
        deliveries: [],
      });
    });

    it('should add delivery', async () => {
      await contract.addDelivery('First delivery', ['file1.pdf', 'file2.jpg'], doer.id);

      expect(contract.deliveries.length).toBe(1);

      const delivery = contract.deliveries[0];
      expect(delivery.description).toBe('First delivery');
      expect(delivery.files).toEqual(['file1.pdf', 'file2.jpg']);
      expect(delivery.status).toBe('pending');
      expect(delivery.id).toBeDefined();
    });

    it('should approve delivery', async () => {
      await contract.addDelivery('Test delivery', [], doer.id);
      const deliveryId = contract.deliveries[0].id;

      await contract.approveDelivery(deliveryId, client.id);

      const delivery = contract.deliveries[0];
      expect(delivery.status).toBe('approved');
      expect(delivery.reviewedAt).toBeDefined();
    });

    it('should reject delivery', async () => {
      await contract.addDelivery('Test delivery', [], doer.id);
      const deliveryId = contract.deliveries[0].id;

      await contract.rejectDelivery(deliveryId, client.id, 'Not good enough');

      const delivery = contract.deliveries[0];
      expect(delivery.status).toBe('rejected');
      expect(delivery.feedback).toBe('Not good enough');
    });

    it('should get pending deliveries', () => {
      contract.deliveries = [
        {
          description: 'Delivery 1',
          files: [],
          status: 'approved',
          deliveredAt: new Date(),
        },
        {
          description: 'Delivery 2',
          files: [],
          status: 'pending',
          deliveredAt: new Date(),
        },
        {
          description: 'Delivery 3',
          files: [],
          status: 'pending',
          deliveredAt: new Date(),
        },
      ];

      const pending = contract.getPendingDeliveries();
      expect(pending.length).toBe(2);
    });
  });

  describe('Soft Delete', () => {
    let contract: Contract;

    beforeEach(async () => {
      contract = await createContractWithDefaults({
        jobId: job.id,
        clientId: client.id,
        doerId: doer.id,
        price: 10000,
        commission: 800,
        totalPrice: 10800,
        status: 'active',
        terms: 'Test terms',
      });
    });

    it('should soft delete contract', async () => {
      await contract.softDelete(client.id);

      expect(contract.deletedAt).toBeDefined();
      expect(contract.deletedBy).toBe(client.id);
    });

    it('should check if deleted', () => {
      expect(contract.isDeleted).toBe(false);

      contract.isDeleted = true;
      contract.deletedAt = new Date();
      expect(contract.isDeleted).toBe(true);
    });

    it('should restore contract', async () => {
      contract.deletedAt = new Date();
      contract.deletedBy = client.id;

      await contract.restore();

      expect(contract.deletedAt).toBeUndefined();
      expect(contract.deletedBy).toBeUndefined();
    });
  });
});
