import { jest, describe, it, expect, beforeEach, beforeAll } from '@jest/globals';
import { crearUsuario } from '../helpers/fixtures.js';

/**
 * El servicio de correo, contra la base real y con los proveedores simulados.
 *
 * Este archivo estaba escrito con `jest.unstable_mockModule` y `await` de
 * primer nivel —herramientas de ESM— pero vive en el proyecto de integración,
 * que se transpila a CommonJS. Jest ni siquiera lo podía leer: la suite entera
 * fallaba con un SyntaxError y hacía años que no probaba nada. En CJS los
 * `jest.mock` se elevan solos, así que alcanza con declararlos arriba.
 *
 * Lo que verifica: que cada correo del ciclo de vida se arme y salga sin
 * romper, y que un usuario que no existe no tumbe la operación que dispara el
 * correo. Esa última parte es la que importa de verdad: un contrato no puede
 * fallar porque el servidor de correo esté caído o porque falte un
 * destinatario.
 */

const sendgridSend = jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue([{ statusCode: 202 }]);
const sendgridSetApiKey = jest.fn();
jest.mock('@sendgrid/mail', () => ({
  __esModule: true,
  default: { setApiKey: sendgridSetApiKey, send: sendgridSend },
  setApiKey: sendgridSetApiKey,
  send: sendgridSend,
}));

const nodemailerSendMail = jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({ messageId: 'test-message-id' });
const createTransport = jest.fn().mockReturnValue({ sendMail: nodemailerSendMail });
jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport },
  createTransport,
}));

describe('Email Service', () => {
  let emailService: any;
  let clientUser: any;
  let doerUser: any;

  beforeAll(async () => {
    emailService = (await import('../../server/services/email.js')).default;
  });

  beforeEach(async () => {
    sendgridSend.mockClear();
    nodemailerSendMail.mockClear();
    // Emails únicos: con direcciones fijas el segundo test del archivo choca
    // contra el índice único y falla por una razón ajena a lo que prueba.
    clientUser = await crearUsuario({ name: 'Test Client', role: 'client' });
    doerUser = await crearUsuario({ name: 'Test Doer', role: 'doer' });
  });

  describe('Contract Lifecycle Emails', () => {
    it('should send contract created email', async () => {
      await expect(
        emailService.sendContractCreatedEmail(
          String(clientUser.id),
          String(doerUser.id),
          'contract123',
          'Test Job',
          10000,
          'ARS',
        ),
      ).resolves.not.toThrow();
    });

    it('should send contract accepted email', async () => {
      await expect(
        emailService.sendContractAcceptedEmail(
          String(clientUser.id),
          String(doerUser.id),
          'contract123',
          'Test Job',
        ),
      ).resolves.not.toThrow();
    });

    it('should send payment escrow email', async () => {
      // La firma es (userId, jobTitle, amount, currency, contractId): el test
      // mandaba dos ids y el título en el lugar del monto.
      await expect(
        emailService.sendPaymentEscrowEmail(
          String(clientUser.id),
          'Test Job',
          10000,
          'ARS',
          'contract123',
        ),
      ).resolves.not.toThrow();
    });

    it('should send contract awaiting confirmation email', async () => {
      // Esta recibe el CORREO del destinatario, no su id.
      await expect(
        emailService.sendContractAwaitingConfirmationEmail(
          clientUser.email,
          'Test Client',
          'Test Job',
          'contract123',
          true,
        ),
      ).resolves.not.toThrow();
    });

    it('should send contract completed email', async () => {
      await expect(
        emailService.sendContractCompletedEmail(
          String(clientUser.id),
          String(doerUser.id),
          'contract123',
          'Test Job',
          10000,
          'ARS',
        ),
      ).resolves.not.toThrow();
    });
  });

  describe('Dispute Emails', () => {
    it('should send dispute created email', async () => {
      // (clientId, doerId, disputeId, contractTitle, reason). El test tenía el
      // id de la disputa primero y mandaba un argumento de más.
      await expect(
        emailService.sendDisputeCreatedEmail(
          String(clientUser.id),
          String(doerUser.id),
          'dispute123',
          'Test Job',
          'Work not completed',
        ),
      ).resolves.not.toThrow();
    });

    it('should send dispute resolved email with full release', async () => {
      // (userId, disputeId, resolution, amount, currency).
      await expect(
        emailService.sendDisputeResolvedEmail(
          String(doerUser.id),
          'dispute123',
          'The work was satisfactory. Payment released.',
          10000,
          'ARS',
        ),
      ).resolves.not.toThrow();
    });

    it('should send dispute resolved email with full refund', async () => {
      await expect(
        emailService.sendDisputeResolvedEmail(
          String(clientUser.id),
          'dispute123',
          'Client will be refunded in full.',
          10000,
          'ARS',
        ),
      ).resolves.not.toThrow();
    });

    it('should send dispute resolved email with partial refund', async () => {
      await expect(
        emailService.sendDisputeResolvedEmail(
          String(clientUser.id),
          'dispute123',
          'Partial refund agreed by both parties.',
          4000,
          'ARS',
        ),
      ).resolves.not.toThrow();
    });
  });

  /**
   * Lo que de verdad hay que garantizar: que el correo NUNCA tumbe la
   * operación que lo dispara. Si un contrato se cae porque el destinatario no
   * existe o porque el proveedor de correo devolvió un error, el problema deja
   * de ser un mail sin enviar y pasa a ser un contrato sin crear.
   */
  describe('Los fallos de correo no rompen la operación', () => {
    it('un id de usuario inválido no lanza', async () => {
      await expect(
        emailService.sendContractCreatedEmail(
          '00000000-0000-0000-0000-000000000000',
          '00000000-0000-0000-0000-000000000001',
          'contract123',
          'Test Job',
          10000,
          'ARS',
        ),
      ).resolves.not.toThrow();
    });

    it('un id con formato inválido tampoco lanza', async () => {
      await expect(
        emailService.sendContractCreatedEmail(
          'no-es-un-uuid',
          String(doerUser.id),
          'contract123',
          'Test Job',
          10000,
          'ARS',
        ),
      ).resolves.not.toThrow();
    });

    it('si el proveedor falla, la operación sigue', async () => {
      sendgridSend.mockRejectedValueOnce(new Error('SendGrid caído'));
      nodemailerSendMail.mockRejectedValueOnce(new Error('SMTP caído'));

      await expect(
        emailService.sendContractCreatedEmail(
          String(clientUser.id),
          String(doerUser.id),
          'contract123',
          'Test Job',
          10000,
          'ARS',
        ),
      ).resolves.not.toThrow();
    });

    it('sendEmail devuelve un booleano y no lanza aunque el proveedor explote', async () => {
      sendgridSend.mockRejectedValueOnce(new Error('caído'));
      nodemailerSendMail.mockRejectedValueOnce(new Error('caído'));

      const r = await emailService.sendEmail({
        to: clientUser.email,
        subject: 'Prueba',
        html: '<p>Prueba</p>',
      });
      expect(typeof r).toBe('boolean');
    });
  });

  describe('Retiros', () => {
    it('los cuatro correos de retiro se arman sin romper', async () => {
      await expect(emailService.sendWithdrawalRequested(clientUser.email, 'Test Client', 5000)).resolves.not.toThrow();
      await expect(emailService.sendWithdrawalApproved(clientUser.email, 'Test Client', 5000)).resolves.not.toThrow();
      await expect(emailService.sendWithdrawalCompleted(clientUser.email, 'Test Client', 5000, 0)).resolves.not.toThrow();
      await expect(
        emailService.sendWithdrawalRejected(clientUser.email, 'Test Client', 5000, 'CBU inválido'),
      ).resolves.not.toThrow();
    });
  });
});
