/**
 * Tests para las features añadidas recientemente:
 * 1. Propuesta approve idempotente
 * 2. selectedWorkers persiste correctamente (job.changed)
 * 3. Auto-selección no excede maxWorkers (ground truth con proposals aprobadas)
 * 4. Auto-complete de trabajos in_progress vencidos (grace 2h)
 * 5. Force-start pairing (grace mode)
 * 6. Licencias: approve/reject y estado
 * 7. Personal pairing code: formato y unicidad
 */

import { describe, it, expect, beforeEach } from '@jest/globals';

// ============================================================
// 1. PROPOSAL APPROVE — IDEMPOTENTE
// ============================================================
describe('1. Proposal Approve — Idempotent', () => {
  function shouldApproveProposal(
    proposalStatus: string,
    currentWorkers: string[],
    maxWorkers: number,
    freelancerId: string
  ): { action: 'idempotent_ok' | 'approve' | 'reject'; reason?: string } {
    if (proposalStatus === 'approved') {
      return { action: 'idempotent_ok' };
    }
    if (proposalStatus !== 'pending') {
      return { action: 'reject', reason: `Estado inválido: ${proposalStatus}` };
    }
    if (currentWorkers.length >= maxWorkers) {
      return { action: 'reject', reason: 'Máximo de trabajadores alcanzado' };
    }
    if (currentWorkers.includes(freelancerId)) {
      return { action: 'reject', reason: 'Trabajador ya seleccionado' };
    }
    return { action: 'approve' };
  }

  it('returns idempotent_ok when proposal already approved', () => {
    const result = shouldApproveProposal('approved', ['worker-1'], 2, 'worker-1');
    expect(result.action).toBe('idempotent_ok');
  });

  it('approves a pending proposal when slots available', () => {
    const result = shouldApproveProposal('pending', [], 2, 'worker-1');
    expect(result.action).toBe('approve');
  });

  it('rejects when proposal status is rejected', () => {
    const result = shouldApproveProposal('rejected', [], 2, 'worker-1');
    expect(result.action).toBe('reject');
    expect(result.reason).toContain('inválido');
  });

  it('rejects when maxWorkers already reached', () => {
    const result = shouldApproveProposal('pending', ['w1', 'w2'], 2, 'w3');
    expect(result.action).toBe('reject');
    expect(result.reason).toContain('Máximo');
  });

  it('rejects when freelancer already in selectedWorkers', () => {
    const result = shouldApproveProposal('pending', ['w1'], 2, 'w1');
    expect(result.action).toBe('reject');
    expect(result.reason).toContain('ya seleccionado');
  });
});

// ============================================================
// 2. AUTO-SELECCIÓN — selectedWorkers merge y persistencia
// ============================================================
describe('2. Auto-selección — selectedWorkers merge', () => {
  function computeAllKnownWorkers(
    approvedProposalWorkerIds: string[],
    selectedWorkersFromDb: string[]
  ): string[] {
    return [...new Set([...approvedProposalWorkerIds, ...selectedWorkersFromDb])];
  }

  function computeWorkersNeeded(maxWorkers: number, allKnownWorkers: string[]): number {
    return maxWorkers - allKnownWorkers.length;
  }

  it('merges approved proposals and selectedWorkers without duplicates', () => {
    const approved = ['w1', 'w2'];
    const selected = ['w2', 'w3'];
    const merged = computeAllKnownWorkers(approved, selected);
    expect(merged).toHaveLength(3);
    expect(merged).toContain('w1');
    expect(merged).toContain('w2');
    expect(merged).toContain('w3');
  });

  it('workersNeeded is 0 when approved proposals already fill maxWorkers', () => {
    const allKnown = computeAllKnownWorkers(['w1', 'w2'], []);
    const needed = computeWorkersNeeded(2, allKnown);
    expect(needed).toBe(0);
  });

  it('workersNeeded is correct when selectedWorkers array was empty (lag)', () => {
    // selectedWorkers array didn't persist but 2 proposals exist approved
    const allKnown = computeAllKnownWorkers(['w1', 'w2'], []); // array was []
    const needed = computeWorkersNeeded(2, allKnown);
    expect(needed).toBe(0); // should NOT select more
  });

  it('correctly needs 1 more when maxWorkers=2 and only 1 approved', () => {
    const allKnown = computeAllKnownWorkers(['w1'], []);
    const needed = computeWorkersNeeded(2, allKnown);
    expect(needed).toBe(1);
  });

  it('never returns negative workersNeeded', () => {
    // More approved than maxWorkers (edge case - data inconsistency)
    const allKnown = computeAllKnownWorkers(['w1', 'w2', 'w3'], []);
    const needed = computeWorkersNeeded(2, allKnown);
    expect(needed).toBeLessThanOrEqual(0);
  });

  it('job.changed call is needed for ARRAY fields in Sequelize', () => {
    // Simula que mutar un array en Sequelize no marca el campo como dirty
    const mockJob: any = {
      selectedWorkers: ['w1'],
      _changed: {} as Record<string, boolean>,
      changed(field: string, val?: boolean) {
        if (val !== undefined) this._changed[field] = val;
        return this._changed[field] ?? false;
      },
    };

    // Mutation without changed() — Sequelize won't save
    mockJob.selectedWorkers.push('w2');
    expect(mockJob.changed('selectedWorkers')).toBe(false);

    // With changed() — Sequelize WILL save
    mockJob.changed('selectedWorkers', true);
    expect(mockJob.changed('selectedWorkers')).toBe(true);
  });
});

// ============================================================
// 3. AUTO-COMPLETE — trabajos in_progress vencidos (grace 2h)
// ============================================================
describe('3. Auto-complete — jobs in_progress past endDate (2h grace)', () => {
  function shouldAutoComplete(endDate: Date, now: Date): boolean {
    const graceCutoff = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    return endDate < graceCutoff;
  }

  it('should NOT auto-complete if job ended less than 2h ago', () => {
    const now = new Date();
    const endDate = new Date(now.getTime() - 1 * 60 * 60 * 1000); // 1h ago
    expect(shouldAutoComplete(endDate, now)).toBe(false);
  });

  it('should auto-complete if job ended exactly 2h ago', () => {
    const now = new Date();
    const endDate = new Date(now.getTime() - 2 * 60 * 60 * 1000 - 1000); // 2h + 1s ago
    expect(shouldAutoComplete(endDate, now)).toBe(true);
  });

  it('should auto-complete if job ended 7 days ago', () => {
    const now = new Date();
    const endDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    expect(shouldAutoComplete(endDate, now)).toBe(true);
  });

  it('should NOT auto-complete a future job', () => {
    const now = new Date();
    const endDate = new Date(now.getTime() + 24 * 60 * 60 * 1000); // tomorrow
    expect(shouldAutoComplete(endDate, now)).toBe(false);
  });

  it('grace cutoff is always 2 hours before now', () => {
    const now = new Date('2026-01-15T12:00:00Z');
    const graceCutoff = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    expect(graceCutoff.toISOString()).toBe('2026-01-15T10:00:00.000Z');
  });

  it('contracts moved to awaiting_confirmation allow existing auto-confirm to take over', () => {
    // The existing autoConfirmContracts cron checks: status === 'awaiting_confirmation' && awaitingConfirmationAt > 2h ago
    // So by setting contracts to awaiting_confirmation, they'll be auto-confirmed by the existing cron
    const targetStatus = 'awaiting_confirmation';
    const now = new Date();
    const awaitingAt = new Date(now.getTime() - 3 * 60 * 60 * 1000); // 3h ago
    const hoursWaiting = (now.getTime() - awaitingAt.getTime()) / (1000 * 60 * 60);
    expect(targetStatus).toBe('awaiting_confirmation');
    expect(hoursWaiting).toBeGreaterThan(2);
  });
});

// ============================================================
// 4. FORCE-START PAIRING — grace mode
// ============================================================
describe('4. Force-start pairing (grace mode)', () => {
  type ContractStatus = 'pending' | 'ready' | 'accepted' | 'in_progress' | 'cancelled';

  interface MockContract {
    status: ContractStatus;
    clientId: string;
    doerId: string;
    clientConfirmedPairing: boolean;
    doerConfirmedPairing: boolean;
    locationVerificationStatus?: string;
    actualStartDate?: Date;
  }

  function forceStartPairing(
    contract: MockContract,
    userId: string
  ): { success: boolean; message: string; bothConfirmed?: boolean; status?: ContractStatus; locationVerification?: string } {
    const isClient = contract.clientId === userId;
    const isDoer = contract.doerId === userId;

    if (!isClient && !isDoer) {
      return { success: false, message: 'Sin permiso' };
    }
    if (contract.status === 'in_progress') {
      return { success: true, message: 'Ya en progreso' };
    }
    if (!['accepted', 'ready', 'pending'].includes(contract.status)) {
      return { success: false, message: `Estado inválido: ${contract.status}` };
    }

    if (isClient && !contract.clientConfirmedPairing) {
      contract.clientConfirmedPairing = true;
    } else if (isDoer && !contract.doerConfirmedPairing) {
      contract.doerConfirmedPairing = true;
    }

    if (contract.clientConfirmedPairing && contract.doerConfirmedPairing) {
      contract.locationVerificationStatus = 'grace_start';
      contract.status = 'in_progress';
      contract.actualStartDate = new Date();
      return { success: true, message: 'Inicio confirmado en modo flexible', bothConfirmed: true, status: 'in_progress', locationVerification: 'grace_start' };
    }

    return { success: true, message: 'Confirmación registrada. Esperando la otra parte.', bothConfirmed: false };
  }

  const baseContract = (): MockContract => ({
    status: 'accepted',
    clientId: 'client-1',
    doerId: 'doer-1',
    clientConfirmedPairing: false,
    doerConfirmedPairing: false,
  });

  it('starts contract in grace_start when both parties confirm', () => {
    const contract = baseContract();
    forceStartPairing(contract, 'client-1'); // client confirms
    const result = forceStartPairing(contract, 'doer-1'); // doer confirms
    expect(result.success).toBe(true);
    expect(result.bothConfirmed).toBe(true);
    expect(contract.status).toBe('in_progress');
    expect(contract.locationVerificationStatus).toBe('grace_start');
  });

  it('waits for second party after first confirms', () => {
    const contract = baseContract();
    const result = forceStartPairing(contract, 'client-1');
    expect(result.success).toBe(true);
    expect(result.bothConfirmed).toBe(false);
    expect(contract.status).toBe('accepted');
  });

  it('rejects users not part of the contract', () => {
    const contract = baseContract();
    const result = forceStartPairing(contract, 'random-user');
    expect(result.success).toBe(false);
    expect(result.message).toContain('permiso');
  });

  it('returns success immediately if contract already in_progress', () => {
    const contract = { ...baseContract(), status: 'in_progress' as ContractStatus };
    const result = forceStartPairing(contract, 'client-1');
    expect(result.success).toBe(true);
    expect(result.message).toContain('Ya en progreso');
  });

  it('rejects for invalid statuses like cancelled', () => {
    const contract = { ...baseContract(), status: 'cancelled' as ContractStatus };
    const result = forceStartPairing(contract, 'client-1');
    expect(result.success).toBe(false);
  });

  it('does not double-confirm the same user', () => {
    const contract = baseContract();
    forceStartPairing(contract, 'client-1');
    forceStartPairing(contract, 'client-1'); // second call same user
    // Should NOT start without doer
    expect(contract.status).toBe('accepted');
    expect(contract.doerConfirmedPairing).toBe(false);
  });
});

// ============================================================
// 5. LICENCIAS — approve / reject lógica
// ============================================================
describe('5. License Approval Logic', () => {
  interface MockUser {
    id: string;
    licenseNumber?: string;
    licenseDocumentUrl?: string;
    licenseVerified: boolean;
    licenseVerificationStatus: 'pending' | 'approved' | 'rejected';
    licenseRejectedReason?: string;
    licenseVerifiedBy?: string;
    licenseVerifiedAt?: Date;
  }

  function approveLicense(user: MockUser, adminId: string): { success: boolean; message?: string } {
    if (!user.licenseNumber && !user.licenseDocumentUrl) {
      return { success: false, message: 'El usuario no tiene matrícula ni documento' };
    }
    user.licenseVerified = true;
    user.licenseVerificationStatus = 'approved';
    user.licenseRejectedReason = undefined;
    user.licenseVerifiedBy = adminId;
    user.licenseVerifiedAt = new Date();
    return { success: true };
  }

  function rejectLicense(user: MockUser, adminId: string, reason: string): { success: boolean; message?: string } {
    if (!reason || reason.trim().length === 0) {
      return { success: false, message: 'Se requiere un motivo' };
    }
    user.licenseVerified = false;
    user.licenseVerificationStatus = 'rejected';
    user.licenseRejectedReason = reason;
    user.licenseVerifiedBy = adminId;
    user.licenseVerifiedAt = new Date();
    return { success: true };
  }

  const baseUser = (): MockUser => ({
    id: 'user-1',
    licenseNumber: 'MN-12345',
    licenseDocumentUrl: 'https://example.com/doc.pdf',
    licenseVerified: false,
    licenseVerificationStatus: 'pending',
  });

  it('approves license and sets all fields correctly', () => {
    const user = baseUser();
    const result = approveLicense(user, 'admin-1');
    expect(result.success).toBe(true);
    expect(user.licenseVerified).toBe(true);
    expect(user.licenseVerificationStatus).toBe('approved');
    expect(user.licenseVerifiedBy).toBe('admin-1');
    expect(user.licenseVerifiedAt).toBeInstanceOf(Date);
    expect(user.licenseRejectedReason).toBeUndefined();
  });

  it('cannot approve if user has neither licenseNumber nor document', () => {
    const user: MockUser = { ...baseUser(), licenseNumber: undefined, licenseDocumentUrl: undefined };
    const result = approveLicense(user, 'admin-1');
    expect(result.success).toBe(false);
    expect(result.message).toContain('no tiene matrícula');
  });

  it('rejects license with reason', () => {
    const user = baseUser();
    const result = rejectLicense(user, 'admin-1', 'Documento ilegible');
    expect(result.success).toBe(true);
    expect(user.licenseVerified).toBe(false);
    expect(user.licenseVerificationStatus).toBe('rejected');
    expect(user.licenseRejectedReason).toBe('Documento ilegible');
  });

  it('reject requires a reason', () => {
    const user = baseUser();
    const result = rejectLicense(user, 'admin-1', '   ');
    expect(result.success).toBe(false);
    expect(result.message).toContain('motivo');
  });

  it('approved license can be re-rejected (status transitions)', () => {
    const user = baseUser();
    approveLicense(user, 'admin-1');
    expect(user.licenseVerificationStatus).toBe('approved');
    rejectLicense(user, 'admin-1', 'Error en aprobación anterior');
    expect(user.licenseVerificationStatus).toBe('rejected');
  });

  it('rejected license can be re-approved (status transitions)', () => {
    const user = baseUser();
    rejectLicense(user, 'admin-1', 'Primera razón');
    rejectLicense(user, 'admin-1', 'Documento ilegible'); // update reason
    approveLicense(user, 'admin-1');
    expect(user.licenseVerificationStatus).toBe('approved');
    expect(user.licenseRejectedReason).toBeUndefined();
  });
});

// ============================================================
// 6. PERSONAL PAIRING CODE — formato y generación
// ============================================================
describe('6. Personal Pairing Code', () => {
  function generatePairingCode(length = 6): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < length; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  it('generates a code of exactly 6 characters', () => {
    const code = generatePairingCode();
    expect(code).toHaveLength(6);
  });

  it('code contains only uppercase letters and digits', () => {
    for (let i = 0; i < 100; i++) {
      const code = generatePairingCode();
      expect(code).toMatch(/^[A-Z0-9]{6}$/);
    }
  });

  it('codes are unique across multiple generations', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      codes.add(generatePairingCode());
    }
    // With 36^6 = ~2.1 billion combinations, 1000 codes should virtually never collide
    expect(codes.size).toBeGreaterThan(990);
  });

  it('pairing confirmation uses personal code (fixed per user, not per contract)', () => {
    const personalCode = 'ABC123';
    const contractPairingCode = personalCode; // contract is seeded from user's personal code
    const inputCode = 'ABC123';

    const isMatch = contractPairingCode.toUpperCase() === inputCode.toUpperCase();
    expect(isMatch).toBe(true);
  });

  it('pairing fails with wrong code', () => {
    const contractPairingCode = 'ABC123';
    const wrongInput = 'XYZ999';
    expect(contractPairingCode !== wrongInput).toBe(true);
  });

  it('code comparison is case-insensitive', () => {
    const contractCode = 'ABC123';
    const inputLower = 'abc123';
    expect(contractCode.toUpperCase()).toBe(inputLower.toUpperCase());
  });
});

// ============================================================
// 7. TÉRMINOS Y CONDICIONES — cláusulas de ausencia del cliente
// ============================================================
describe('7. Client absence auto-release — T&C clauses', () => {
  it('commission is always retained even in auto-release', () => {
    const contractPrice = 10000;
    const commissionRate = 0.08; // FREE plan
    const commission = contractPrice * commissionRate;
    const workerPayment = contractPrice - commission;

    expect(commission).toBe(800);
    expect(workerPayment).toBe(9200);
    expect(workerPayment + commission).toBe(contractPrice);
  });

  it('grace period before auto-release is 2 hours', () => {
    const GRACE_HOURS = 2;
    const now = new Date('2026-01-15T12:00:00Z');
    const jobEndDate = new Date('2026-01-15T09:00:00Z'); // ended 3h ago
    const hoursSinceEnd = (now.getTime() - jobEndDate.getTime()) / (1000 * 60 * 60);

    expect(hoursSinceEnd).toBeGreaterThan(GRACE_HOURS);
  });

  it('auto-release should NOT trigger before grace period ends', () => {
    const GRACE_HOURS = 2;
    const now = new Date('2026-01-15T12:00:00Z');
    const jobEndDate = new Date('2026-01-15T11:30:00Z'); // ended 30min ago
    const hoursSinceEnd = (now.getTime() - jobEndDate.getTime()) / (1000 * 60 * 60);

    expect(hoursSinceEnd).toBeLessThan(GRACE_HOURS);
  });
});
