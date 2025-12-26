// Types compartidos con el cliente web
// Sincronizado con client/types/index.ts

export interface Job {
  _id: string;
  id?: string;
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
  status: 'open' | 'in_progress' | 'completed' | 'cancelled' | 'draft' | 'pending_payment' | 'pending_approval' | 'paused' | 'suspended';
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
  _id?: string;
  id?: string;
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
  _id: string;
  id?: string;
  name: string;
  username?: string;
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
  membershipTier?: 'free' | 'pro' | 'super_pro';
  hasMembership?: boolean;
  balance?: number;
  isBanned?: boolean;
  banReason?: string;
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
  _id: string;
  job: Job | string;
  client: User | string;
  doer: User | string;
  price: number;
  commission: number;
  totalPrice: number;
  status: 'pending' | 'ready' | 'accepted' | 'in_progress' | 'completed' | 'cancelled' | 'awaiting_confirmation' | 'disputed';
  paymentStatus: 'pending' | 'held' | 'held_escrow' | 'released' | 'refunded' | 'disputed';
  startDate: string;
  endDate: string;
  actualStartDate?: string;
  actualEndDate?: string;
  termsAccepted: boolean;
  clientConfirmed?: boolean;
  doerConfirmed?: boolean;
  clientConfirmedAt?: string;
  doerConfirmedAt?: string;
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
  _id: string;
  job: Job | string;
  doer: User | string;
  message?: string;
  proposedPrice?: number;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  _id: string;
  conversationId: string;
  sender: User | string;
  content: string;
  type: 'text' | 'image' | 'file' | 'system';
  attachments?: string[];
  readBy: string[];
  createdAt: string;
}

export interface Conversation {
  _id: string;
  participants: User[] | string[];
  job?: Job | string;
  contract?: Contract | string;
  lastMessage?: Message;
  unreadCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Notification {
  _id: string;
  user: string;
  type: 'info' | 'success' | 'warning' | 'error';
  category: 'job' | 'contract' | 'payment' | 'system' | 'chat';
  title: string;
  message: string;
  data?: Record<string, any>;
  read: boolean;
  createdAt: string;
}

export interface Review {
  _id: string;
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
  _id: string;
  user: User | string;
  type: 'refund' | 'payment' | 'bonus' | 'adjustment' | 'withdrawal';
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string;
  status: 'pending' | 'completed' | 'failed';
  createdAt: string;
}

export interface WithdrawalRequest {
  _id: string;
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
  name: string;
  username: string;
  email: string;
  password: string;
  phone?: string;
  dni: string;
  termsAccepted: boolean;
  referralCode?: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}
