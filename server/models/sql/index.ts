/**
 * SQL Models Index
 *
 * Exporta todos los modelos SQL (Sequelize/PostgreSQL) para facilitar imports
 */

// ============================================
// CORE MODELS
// ============================================
export { User } from './User.model.js';
export { Job } from './Job.model.js';
export { JobTask } from './JobTask.model.js';
export { Contract } from './Contract.model.js';
export { Payment } from './Payment.model.js';
export { Proposal } from './Proposal.model.js';
export { Review } from './Review.model.js';

// ============================================
// CHAT & MESSAGING
// ============================================
export { Conversation } from './Conversation.model.js';
export { ChatMessage } from './ChatMessage.model.js';
export { Notification } from './Notification.model.js';

// ============================================
// DISPUTES & SUPPORT
// ============================================
export { Dispute } from './Dispute.model.js';
export { Ticket } from './Ticket.model.js';

// ============================================
// USER FEATURES
// ============================================
export { Portfolio } from './Portfolio.model.js';
export { Role } from './Role.model.js';

// ============================================
// CONTRACT MANAGEMENT
// ============================================
export { ContractChangeRequest } from './ContractChangeRequest.model.js';

// ============================================
// MEMBERSHIP & REFERRALS
// ============================================
export { Membership } from './Membership.model.js';
export { Referral } from './Referral.model.js';

// ============================================
// FINANCE
// ============================================
export { BalanceTransaction } from './BalanceTransaction.model.js';
export { WithdrawalRequest } from './WithdrawalRequest.model.js';

// ============================================
// AUTHENTICATION
// ============================================
export { RefreshToken } from './RefreshToken.model.js';
export { PasswordResetToken } from './PasswordResetToken.model.js';
export { LoginDevice } from './LoginDevice.model.js';

// ============================================
// ADVERTISING & ANALYTICS
// ============================================
export { Advertisement } from './Advertisement.model.js';
export { Promoter } from './Promoter.model.js';
export { UserAnalytics } from './UserAnalytics.model.js';

// ============================================
// PRIVACY & GDPR COMPLIANCE
// ============================================
export { ConsentLog } from './ConsentLog.model.js';
export { DataAccessLog } from './DataAccessLog.model.js';
export { AuditLog } from './AuditLog.model.js';

// ============================================
// MATCHING & NEGOTIATION
// ============================================
export { MatchingCode } from './MatchingCode.model.js';
export { ContractNegotiation } from './ContractNegotiation.model.js';

// ============================================
// SOCIAL & CONTENT
// ============================================
export { Post } from './Post.model.js';
export { PostComment } from './PostComment.model.js';
export { BlogPost } from './BlogPost.model.js';
export { ContactMessage } from './ContactMessage.model.js';

// Family/Friends codes
export { FamilyCode } from './FamilyCode.model.js';

// ============================================
// TYPE EXPORTS
// ============================================

// Job types
export type { JobStatus, JobUrgency, ExperienceLevel } from './Job.model.js';
export type { TaskStatus } from './JobTask.model.js';

// Contract types
export type {
  ContractStatus,
  PaymentStatus as ContractPaymentStatus,
  DeliveryStatus,
  PriceModification,
  Delivery,
  ExtensionRecord
} from './Contract.model.js';

// Payment types
export type { PaymentStatus, PaymentType, PaymentMethod } from './Payment.model.js';

// Proposal types
export type { ProposalStatus } from './Proposal.model.js';

// Dispute types
export type {
  DisputeStatus,
  DisputePriority,
  DisputeCategory,
  ResolutionType,
  ImportanceLevel,
  IAttachment,
  IDisputeMessage,
  IAuditLog
} from './Dispute.model.js';

// Ticket types
export type {
  TicketCategory,
  TicketPriority,
  TicketStatus,
  ITicketMessage
} from './Ticket.model.js';

// Conversation types
export type { ConversationType } from './Conversation.model.js';

// ChatMessage types
export type { MessageType } from './ChatMessage.model.js';

// Notification types
export type {
  NotificationType,
  NotificationCategory,
  NotificationChannel
} from './Notification.model.js';

// Role types
export type { RoleName } from './Role.model.js';

// Contract Change Request types
export type {
  ChangeRequestType,
  ChangeRequestStatus,
  INewTerms
} from './ContractChangeRequest.model.js';

// Membership types
export type {
  MembershipPlan,
  MembershipStatus,
  IContractUsage
} from './Membership.model.js';

// Referral types
export type {
  ReferralStatus,
  RewardType
} from './Referral.model.js';

// Balance Transaction types
export type {
  TransactionType,
  TransactionStatus,
  ITransactionMetadata
} from './BalanceTransaction.model.js';

// Withdrawal Request types
export type {
  WithdrawalStatus,
  AccountType,
  IBankingInfo,
  IWithdrawalMetadata
} from './WithdrawalRequest.model.js';

// Advertisement types
export type {
  AdType,
  AdStatus,
  PaymentStatus as AdPaymentStatus,
  AdPlacement
} from './Advertisement.model.js';

// Promoter types
export type {
  AdType as PromoterAdType,
  PaymentPlan,
  PromoterStatus,
  Currency,
  IPricing,
  IAnalytics
} from './Promoter.model.js';

// User Analytics types
export type {
  IProfileView,
  IConversationPartner,
  ICategoryStats,
  IMonthlyStats
} from './UserAnalytics.model.js';

// Post types
export type { IGalleryItem } from './Post.model.js';

// Contract Negotiation types
export type {
  INegotiationMessage,
  ICurrentProposal
} from './ContractNegotiation.model.js';
