export interface Job {
  _id: string;
  id?: string; // PostgreSQL UUID (for compatibility with SQL migration)
  title: string;
  description: string;
  summary?: string;
  category: string;
  budget: number;
  price: number; // Alias for budget (some views use price)
  startDate: string;
  endDate: string;
  location: string;
  status: 'open' | 'in_progress' | 'completed' | 'cancelled' | 'draft' | 'pending_payment';
  postedBy: string;
  client?: {
    _id?: string;
    id?: string; // PostgreSQL UUID
    name: string;
    rating: number;
    reviewsCount: number;
    avatar?: string;
    completedJobs?: number;
  } | string;
  doer?: {
    _id?: string;
    id?: string; // PostgreSQL UUID
    name: string;
    rating: number;
    reviewsCount: number;
    avatar?: string;
  } | string;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  _id: string;
  id?: string; // Alias for _id
  name: string;
  email: string;
  avatar?: string;
  phone?: string;
  bio?: string;
  rating: number;
  workQualityRating?: number;
  workerRating?: number;
  contractRating?: number;
  reviewsCount: number;
  workQualityReviewsCount?: number;
  workerReviewsCount?: number;
  contractReviewsCount?: number;
  completedJobs: number;
  role: 'user' | 'admin';
  adminRole?: 'owner' | 'super_admin' | 'admin' | 'support' | 'marketing' | 'dpo';
  permissions?: string[];
  isVerified: boolean;
  interests?: string[];
  onboardingCompleted?: boolean;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  bankingInfo?: {
    accountHolder?: string;
    bankName?: string;
    accountType?: "savings" | "checking";
    cbu?: string;
    alias?: string;
  };
  legalInfo?: {
    idType?: "dni" | "passport" | "cuit" | "cuil";
    idNumber?: string;
    taxStatus?: "freelancer" | "autonomo" | "monotributo" | "responsable_inscripto";
    taxId?: string;
  };
  notificationPreferences?: {
    email: boolean;
    push: boolean;
    sms: boolean;
    newMessage: boolean;
    jobUpdate: boolean;
    contractUpdate: boolean;
    paymentUpdate: boolean;
    marketing: boolean;
  };
  referralCode?: string;
  freeContractsRemaining?: number;
  totalReferrals?: number;
  membershipTier?: 'free' | 'pro' | 'super_pro';
  hasMembership?: boolean;
  isPremiumVerified?: boolean;
  monthlyContractsUsed?: number;
  monthlyFreeContractsLimit?: number;
  earnedBonusContract?: boolean;
  invitationCodesRemaining?: number;
  invitationCodesUsed?: number;
  invitedUsers?: string[];
  balance?: number; // Platform balance in ARS
  isBanned?: boolean;
  banReason?: string;
  bannedAt?: string;
  banExpiresAt?: string;
}

export interface RegisterData {
  name: string;
  email: string;
  password: string;
  phone?: string;
  termsAccepted: boolean;
  referralCode?: string;
}

export interface BlogPost {
  _id: string;
  title: string;
  subtitle: string;
  slug: string;
  content: string;
  excerpt: string;
  author: string;
  coverImage?: string;
  tags: string[];
  category: string;
  status: "draft" | "published" | "archived";
  views: number;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Contract {
  _id: string;
  job: Job | string;
  client: User | string;
  doer: User | string;
  price: number;
  commission: number;
  totalPrice: number;
  status: 'pending' | 'accepted' | 'in_progress' | 'completed' | 'cancelled' | 'awaiting_confirmation';
  paymentStatus: 'pending' | 'held' | 'held_escrow' | 'released' | 'refunded' | 'disputed';
  startDate: string;
  endDate: string;
  actualStartDate?: string;
  actualEndDate?: string;
  termsAccepted: boolean;
  termsAcceptedByClient?: boolean;
  termsAcceptedByDoer?: boolean;
  clientConfirmed?: boolean;
  doerConfirmed?: boolean;
  clientConfirmedAt?: string;
  doerConfirmedAt?: string;
  notes?: string;
  cancellationReason?: string;
  cancelledBy?: string;
  // Extension fields
  hasBeenExtended?: boolean;
  extensionRequestedBy?: string;
  extensionRequestedAt?: string;
  extensionApprovedBy?: string;
  extensionApprovedAt?: string;
  extensionDays?: number;
  extensionAmount?: number;
  extensionNotes?: string;
  originalEndDate?: string;
  // Price modification
  priceModificationHistory?: Array<{
    previousPrice: number;
    newPrice: number;
    modifiedBy: string;
    modifiedAt: string;
    reason: string;
    paymentDifference: number;
    transactionId?: string;
  }>;
  originalPrice?: number;
  createdAt: string;
  updatedAt: string;
}

export interface BalanceTransaction {
  _id: string;
  user: User | string;
  type: 'refund' | 'payment' | 'bonus' | 'adjustment' | 'withdrawal';
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string;
  relatedContract?: Contract | string;
  relatedPayment?: string;
  metadata?: {
    previousPrice?: number;
    newPrice?: number;
    reason?: string;
    [key: string]: any;
  };
  status: 'pending' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
}

export interface WithdrawalRequest {
  _id: string;
  user: User | string;
  amount: number;
  bankingInfo: {
    accountHolder: string;
    bankName: string;
    accountType: 'savings' | 'checking';
    cbu: string;
    alias?: string;
  };
  status: 'pending' | 'approved' | 'processing' | 'completed' | 'rejected' | 'cancelled';
  balanceBeforeWithdrawal: number;
  balanceAfterWithdrawal: number;
  requestedAt: string;
  processedAt?: string;
  completedAt?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  processedBy?: User | string;
  proofOfTransfer?: string;
  transactionId?: string;
  adminNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PortfolioItem {
  _id: string;
  userId: User | string;
  title: string;
  description: string;
  category: string;
  price?: number;
  images: string[];
  videos?: string[];
  documents?: string[];
  tags?: string[];
  completedAt?: string;
  clientName?: string;
  projectDuration?: string;
  featured?: boolean;
  linkedContract?: Contract | string;
  linkedJob?: Job | string;
  contractRating?: number;
  contractReview?: string;
  likes: string[];
  views: number;
  createdAt: string;
  updatedAt: string;
}

export interface MembershipTier {
  name: string;
  price?: number;
  priceEUR?: number;
  priceARS?: number;
  currency: string;
  exchangeRate?: number;
  benefits: string[];
}

export interface MembershipPricing {
  free: MembershipTier;
  pro: MembershipTier;
}

export interface MembershipUsage {
  contractsUsed: number;
  contractsLimit: number;
  contractsRemaining: number;
  earnedBonusContract: boolean;
  lastReset?: string;
  nextReset?: string;
}

export interface InvitationCode {
  referralCode: string;
  codesRemaining: number;
  codesUsed: number;
  maxCodes: number;
  invitedUsers: Array<{
    _id: string;
    name: string;
    email: string;
    avatar?: string;
    createdAt: string;
  }>;
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
  updatedAt: string;
}