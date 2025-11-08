import emailService from '../../server/services/email.js';
import { User } from '../../server/models/sql/User.model.js';

// Mock the email providers
jest.mock('@sendgrid/mail', () => ({
  setApiKey: jest.fn(),
  send: jest.fn().mockResolvedValue([{ statusCode: 202 }]),
}));

jest.mock('nodemailer', () => ({
  createTransport: jest.fn().mockReturnValue({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'test-message-id' }),
  }),
}));

describe('Email Service', () => {
  let clientUser: any;
  let doerUser: any;

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
  });

  describe('Contract Lifecycle Emails', () => {
    it('should send contract created email', async () => {
      await expect(
        emailService.sendContractCreatedEmail(
          clientUser.id.toString(),
          doerUser.id.toString(),
          'contract123',
          'Test Job',
          10000,
          'ARS'
        )
      ).resolves.not.toThrow();
    });

    it('should send contract accepted email', async () => {
      await expect(
        emailService.sendContractAcceptedEmail(
          clientUser.id.toString(),
          doerUser.id.toString(),
          'contract123',
          'Test Job'
        )
      ).resolves.not.toThrow();
    });

    it('should send payment escrow email', async () => {
      await expect(
        emailService.sendPaymentEscrowEmail(
          clientUser.id.toString(),
          doerUser.id.toString(),
          'contract123',
          'Test Job',
          10000,
          'ARS'
        )
      ).resolves.not.toThrow();
    });

    it('should send contract awaiting confirmation email', async () => {
      await expect(
        emailService.sendContractAwaitingConfirmationEmail(
          clientUser.id.toString(),
          'Test Doer',
          'contract123',
          'Test Job',
          true
        )
      ).resolves.not.toThrow();
    });

    it('should send contract completed email', async () => {
      await expect(
        emailService.sendContractCompletedEmail(
          clientUser.id.toString(),
          doerUser.id.toString(),
          'contract123',
          'Test Job',
          10000,
          'ARS'
        )
      ).resolves.not.toThrow();
    });
  });

  describe('Dispute Emails', () => {
    it('should send dispute created email', async () => {
      await expect(
        emailService.sendDisputeCreatedEmail(
          'dispute123',
          clientUser.id.toString(),
          doerUser.id.toString(),
          'contract123',
          'Test Job',
          'Work not completed'
        )
      ).resolves.not.toThrow();
    });

    it('should send dispute resolved email', async () => {
      await expect(
        emailService.sendDisputeResolvedEmail(
          'dispute123',
          clientUser.id.toString(),
          doerUser.id.toString(),
          'Test Job',
          'The work was satisfactory',
          'full_release'
        )
      ).resolves.not.toThrow();
    });

    it('should send dispute resolved email with refund', async () => {
      await expect(
        emailService.sendDisputeResolvedEmail(
          'dispute123',
          clientUser.id.toString(),
          doerUser.id.toString(),
          'Test Job',
          'Client will be refunded',
          'full_refund'
        )
      ).resolves.not.toThrow();
    });

    it('should send dispute resolved email with partial refund', async () => {
      await expect(
        emailService.sendDisputeResolvedEmail(
          'dispute123',
          clientUser.id.toString(),
          doerUser.id.toString(),
          'Test Job',
          'Partial refund granted',
          'partial_refund'
        )
      ).resolves.not.toThrow();
    });
  });

  describe('Email Validation', () => {
    it('should handle invalid user IDs gracefully', async () => {
      await expect(
        emailService.sendContractCreatedEmail(
          'invalid-id',
          doerUser.id.toString(),
          'contract123',
          'Test Job',
          10000,
          'ARS'
        )
      ).rejects.toThrow();
    });

    it('should handle missing user gracefully', async () => {
      const fakeUserId = '507f1f77bcf86cd799439011'; // Valid ObjectId but non-existent

      await expect(
        emailService.sendContractCreatedEmail(
          fakeUserId,
          doerUser.id.toString(),
          'contract123',
          'Test Job',
          10000,
          'ARS'
        )
      ).rejects.toThrow();
    });
  });

  describe('Email Content Validation', () => {
    it('should include contract details in contract created email', async () => {
      const sendSpy = jest.spyOn(emailService as any, 'sendEmail');

      await emailService.sendContractCreatedEmail(
        clientUser.id.toString(),
        doerUser.id.toString(),
        'contract123',
        'Test Job Title',
        10000,
        'ARS'
      );

      expect(sendSpy).toHaveBeenCalled();
      const callArgs = sendSpy.mock.calls[0];
      expect(callArgs[2]).toContain('Test Job Title');
      expect(callArgs[2]).toContain('10000');
      expect(callArgs[2]).toContain('ARS');
    });

    it('should include dispute reason in dispute created email', async () => {
      const sendSpy = jest.spyOn(emailService as any, 'sendEmail');

      await emailService.sendDisputeCreatedEmail(
        'dispute123',
        clientUser.id.toString(),
        doerUser.id.toString(),
        'contract123',
        'Test Job',
        'Quality issues with deliverable'
      );

      expect(sendSpy).toHaveBeenCalled();
      const callArgs = sendSpy.mock.calls[0];
      expect(callArgs[2]).toContain('Quality issues with deliverable');
    });

    it('should include resolution details in resolved email', async () => {
      const sendSpy = jest.spyOn(emailService as any, 'sendEmail');

      await emailService.sendDisputeResolvedEmail(
        'dispute123',
        clientUser.id.toString(),
        doerUser.id.toString(),
        'Test Job',
        'Detailed resolution explanation',
        'full_release'
      );

      expect(sendSpy).toHaveBeenCalled();
      const callArgs = sendSpy.mock.calls[0];
      expect(callArgs[2]).toContain('Detailed resolution explanation');
    });
  });

  describe('Error Handling', () => {
    it('should handle email sending failures gracefully', async () => {
      const sendgrid = require('@sendgrid/mail');
      sendgrid.send.mockRejectedValueOnce(new Error('Email service error'));

      await expect(
        emailService.sendContractCreatedEmail(
          clientUser.id.toString(),
          doerUser.id.toString(),
          'contract123',
          'Test Job',
          10000,
          'ARS'
        )
      ).rejects.toThrow();
    });
  });

  describe('Multiple Recipients', () => {
    it('should send emails to both client and doer', async () => {
      const sendSpy = jest.spyOn(emailService as any, 'sendEmail');

      await emailService.sendContractCreatedEmail(
        clientUser.id.toString(),
        doerUser.id.toString(),
        'contract123',
        'Test Job',
        10000,
        'ARS'
      );

      // Should be called twice (once for client, once for doer)
      expect(sendSpy).toHaveBeenCalledTimes(2);
    });

    it('should send dispute emails to all parties', async () => {
      const sendSpy = jest.spyOn(emailService as any, 'sendEmail');

      await emailService.sendDisputeCreatedEmail(
        'dispute123',
        clientUser.id.toString(),
        doerUser.id.toString(),
        'contract123',
        'Test Job',
        'Dispute reason'
      );

      // Should be called twice (initiator and respondent)
      expect(sendSpy).toHaveBeenCalledTimes(2);
    });
  });
});
