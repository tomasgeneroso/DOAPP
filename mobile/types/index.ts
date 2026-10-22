import type { ModoDePago } from '../../shared/pagos/modoDePago';

// Types compartidos con el cliente web
// Sincronizado con client/types/index.ts

export interface Job {
  /**
   * Con protección de pago ('escrow', el normal) o sin ella ('on_completion').
   * Sale de shared/pagos/modoDePago.ts, que es donde vive la regla de hasta
   * dónde responde DOAPP en cada uno.
   */
  paymentMode?: ModoDePago;
  id: string;
  title: string;
  description: string;
  summary?: string;
  category: string;
  budget: number;
  price: number;
  startDate: string;
  endDate?: string;
  endDateFlexible?: boolean;
  location: string;
  neighborhood?: string;
  postalCode?: string;
  status: 'open' | 'in_progress' | 'completed' | 'cancelled' | 'draft' | 'pending_payment' | 'pending_approval' | 'paused' | 'suspended';
  /** Un aumento de precio a medias (sólo lo ve el dueño): falta pagarlo, o ya se pagó y espera al administrador. */
  pendingNewPrice?: number;
  aumentoPendiente?: {
    estado: 'sin_pagar' | 'pagado_en_revision';
    precioNuevo: number;
    montoAPagar: number;
    horasDeEspera: number;
  };
  postedBy: string;
  client?: UserSummary | string;
  doer?: UserSummary | string;
  rejectedReason?: string;
  cancellationReason?: string;
  cancelledAt?: string;
  createdAt: string;
  updatedAt: string;
  maxWorkers?: number;
  selectedWorkers?: string[];
  groupChatId?: string;
  workerAllocations?: WorkerAllocation[];
  allocatedTotal?: number;
  remainingBudget?: number;
  pendingPriceDecrease?: number;
  pendingPriceDecreaseReason?: string;
  doerId?: string;
}

export interface UserSummary {
  id: string;
  name: string;
  rating: number;
  reviewsCount: number;
  avatar?: string;
  completedJobs?: number;
}

export interface WorkerAllocation {
  workerId: string;
  allocatedAmount: number;
  percentage: number;
  allocatedAt: string;
}

export interface User {
  id: string;
  name: string;
  username?: string;
  /** La cuenta existe pero falta verificar la identidad y completar los datos (registro en pasos). */
  registrationPending?: boolean;
  email: string;
  avatar?: string;
  coverImage?: string;
  phone?: string;
  bio?: string;
  rating: number;
  workQualityRating?: number;
  workerRating?: number;
  contractRating?: number;
  reviewsCount: number;
  completedJobs: number;
  role: 'user' | 'admin';
  adminRole?: 'owner' | 'super_admin' | 'admin' | 'support' | 'marketing' | 'dpo';
  isVerified: boolean;
  interests?: string[];
  onboardingCompleted?: boolean;
  address?: Address;
  bankingInfo?: BankingInfo;
  dontAskBankingInfo?: boolean;
  notificationPreferences?: NotificationPreferences;
  referralCode?: string;
  freeContractsRemaining?: number;
  totalReferrals?: number;
  membershipType?: 'free' | 'pro' | 'super_pro';
  membershipTier?: 'free' | 'pro' | 'super_pro';
  hasMembership?: boolean;
  balance?: number;
  isBanned?: boolean;
  banReason?: string;
  bannedAt?: string;
  banExpiresAt?: string;
  availabilitySchedule?: AvailabilitySchedule;
  isAvailabilityPublic?: boolean;
  // Credibility ladder / verification — served by GET /auth/me.
  dni?: string;
  needsDni?: boolean;
  dniVerified?: boolean;
  dniPhotoFront?: string;
  dniPhotoBack?: string;
  selfieUrl?: string;
  kycStatus?: string;
  phoneVerified?: boolean;
  profession?: string;
  licenseNumber?: string;
  licenseDocumentUrl?: string;
  licenseDocumentBackUrl?: string;
  hasLicenseDocument?: boolean;
  licenseVerified?: boolean;
  licenseVerificationStatus?: 'pending' | 'approved' | 'rejected';
  insuranceDocumentUrl?: string;
  insuranceVerified?: boolean;
  insuranceVerificationStatus?: 'pending' | 'approved' | 'rejected';
  credibility?: CredibilityInfo;
  capabilities?: UserCapabilities;
}

/** What the backend can actually deliver — gates pending-task prompts. */
export interface UserCapabilities {
  phoneVerification: boolean;
}

export interface CredibilityInfo {
  score: number;
  max: number;
  isProfessional: boolean;
  breakdown: Array<{ level: number; label: string; achieved: boolean }>;
}

export interface AvailabilitySlot {
  day: number;      // 0=Domingo, 1=Lunes ... 6=Sábado
  start: string;    // HH:mm
  end: string;      // HH:mm
}

export interface AvailabilityException {
  date: string;     // YYYY-MM-DD
  available: boolean;
  reason?: string;
}

export interface AvailabilitySchedule {
  timezone?: string;
  slots: AvailabilitySlot[];
  exceptions?: AvailabilityException[];
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  type: 'client_payment' | 'worker_payment' | 'commission' | 'withdrawal';
  amount: number;
  commission: number;
  total: number;
  currency: string;
  status: 'generated' | 'sent' | 'void';
  metadata?: Record<string, any>;
  createdAt: string;
}

export interface Address {
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export interface BankingInfo {
  accountHolder?: string;
  bankType?: 'mercadopago' | 'otro';
  bankName?: string;
  accountType?: 'savings' | 'checking';
  cbu?: string;
  alias?: string;
}

export interface NotificationPreferences {
  email: boolean;
  push: boolean;
  sms: boolean;
  newMessage: boolean;
  jobUpdate: boolean;
  contractUpdate: boolean;
  paymentUpdate: boolean;
  marketing: boolean;
}

export interface Contract {
  /**
   * Con protección de pago ('escrow', el normal) o sin ella ('on_completion').
   * Sale de shared/pagos/modoDePago.ts, que es donde vive la regla de hasta
   * dónde responde DOAPP en cada uno.
   */
  paymentMode?: ModoDePago;
  id: string;
  job: Job | string;
  client: User | string;
  doer: User | string;
  price: number;
  commission: number;
  totalPrice: number;
  status: 'pending' | 'ready' | 'accepted' | 'in_progress' | 'completed' | 'cancelled' | 'awaiting_confirmation' | 'disputed';
  // 'pending_verification': el pago llegó y un administrador lo verifica; 'escrow': retenido; 'completed': pagado.
  paymentStatus: 'pending' | 'pending_verification' | 'held' | 'held_escrow' | 'escrow' | 'pending_payout' | 'released' | 'completed' | 'refunded' | 'disputed';
  startDate: string;
  endDate: string;
  actualStartDate?: string;
  actualEndDate?: string;
  termsAccepted: boolean;
  termsAcceptedByClient?: boolean;
  termsAcceptedByDoer?: boolean;
  // Emparejamiento: las dos partes confirman un código dentro de las 24 horas antes del inicio.
  pairingCode?: string | null;
  pairingExpiry?: string;
  clientConfirmedPairing?: boolean;
  doerConfirmedPairing?: boolean;
  clientConfirmed?: boolean;
  doerConfirmed?: boolean;
  clientConfirmedAt?: string;
  doerConfirmedAt?: string;
  // Confirmation review fields
  confirmationProposedBy?: string;
  proposedStartTime?: string;
  proposedEndTime?: string;
  confirmationNotes?: string;
  confirmationRejectionReason?: string;
  confirmationHistory?: Array<{
    proposedBy: string;
    proposedAt: string;
    proposedStartTime: string;
    proposedEndTime: string;
    notes?: string;
    action: 'proposed' | 'confirmed' | 'rejected';
    respondedBy?: string;
    respondedAt?: string;
    rejectionReason?: string;
  }>;
  notes?: string;
  cancellationReason?: string;
  hasBeenExtended?: boolean;
  extensionDays?: number;
  extensionAmount?: number;
  originalEndDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Proposal {
  id: string;
  job: Job | string;
  doer: User | string;
  message?: string;
  proposedPrice?: number;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  sender: User | { id?: string; name: string; avatar?: string };
  content?: string;
  message?: string; // Backend uses 'message' field
  type: 'text' | 'image' | 'file' | 'system';
  attachments?: string[];
  readBy?: string[];
  read?: boolean;
  readAt?: string;
  metadata?: {
    jobId?: string;
    proposalId?: string;
    proposalStatus?: 'pending' | 'approved' | 'rejected' | 'withdrawn';
    contractId?: string;
    action?: 'job_application' | 'job_attachment' | 'direct_contract_proposal' | 'direct_proposal_accepted' | 'direct_proposal_rejected';
    isCounterOffer?: boolean;
    directProposal?: {
      title: string;
      description: string;
      location?: string;
      category?: string;
      proposedPrice: number;
      estimatedDuration?: number;
      startDate?: string;
      endDate?: string;
    };
    [key: string]: any;
  };
  createdAt: string;
}

export interface Conversation {
  id: string;
  participants: User[] | string[];
  job?: Job | string;
  jobId?: string;
  contract?: Contract | string;
  contractId?: string;
  lastMessage?: Message;
  unreadCount?: number;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface Notification {
  id: string;
  user: string;
  type: 'info' | 'success' | 'warning' | 'error';
  category: 'job' | 'contract' | 'payment' | 'system' | 'chat';
  title: string;
  message: string;
  data?: Record<string, any>;
  /** A qué se refiere el aviso (Job, Contract, Proposal, Dispute, Ticket…), para llevar a esa pantalla al tocarlo. */
  relatedModel?: string;
  relatedId?: string;
  read: boolean;
  createdAt: string;
}

export interface Review {
  id: string;
  contract: Contract | string;
  reviewer: User | string;
  reviewee: User | string;
  workQualityRating?: number;
  workerRating?: number;
  contractRating?: number;
  comment?: string;
  response?: string;
  createdAt: string;
}

export interface BalanceTransaction {
  id: string;
  user: User | string;
  type: 'refund' | 'payment' | 'bonus' | 'adjustment' | 'withdrawal';
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string;
  status: 'pending' | 'completed' | 'failed';
  /** metadata.pendienteDeLiquidacion + status 'pending' = a favor pendiente: todavía no sumó al saldo. */
  metadata?: Record<string, any>;
  createdAt: string;
}

export interface WithdrawalRequest {
  id: string;
  user: User | string;
  amount: number;
  bankingInfo: BankingInfo;
  status: 'pending' | 'approved' | 'processing' | 'completed' | 'rejected' | 'cancelled';
  balanceBeforeWithdrawal: number;
  requestedAt: string;
  processedAt?: string;
  completedAt?: string;
  rejectionReason?: string;
  createdAt: string;
}

// API Response types
export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
  /** Código HTTP, cuando la respuesta fue un error. */
  status?: number;
  // El servidor devuelve el cuerpo tal cual y muchas rutas ponen los datos al costado de `success` (`{ success, contracts: [...] }`, `{ success, job }`):
  // la app lee esos campos directamente, así que el tipo los admite.
  [campo: string]: any;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

// Auth types
export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  /** Con `pasos` no hacen falta: el nombre, el usuario y el DNI salen del documento (Didit) y se completan después. */
  name?: string;
  username?: string;
  email: string;
  password: string;
  phone?: string;
  dni?: string;
  /** Registro en pasos: correo y contraseña ahora, verificación de identidad y datos después. */
  pasos?: boolean;
  termsAccepted: boolean;
  referralCode?: string;
  /** Invitación de un creador de contenido (INF-…): sin comisión como Cliente por un tiempo desde el canje. */
  invitationCode?: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}
