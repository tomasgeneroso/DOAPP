// Admin Types
export type AdminRole = "owner" | "super_admin" | "admin" | "support" | "marketing" | "dpo";

export interface AdminUser {
  id: string;
  _id?: string; // Retrocompatibilidad MongoDB
  name: string;
  username?: string;
  email: string;
  phone?: string;
  avatar?: string;
  role: "client" | "doer" | "both";
  adminRole?: AdminRole;
  permissions: string[];
  isBanned: boolean;
  banReason?: string;
  bannedAt?: string;
  bannedBy?: string;
  banExpiresAt?: string;
  banningAdmin?: {
    id: string;
    name: string;
    email: string;
  };
  infractions: number;
  trustScore: number;
  verificationLevel: "none" | "email" | "phone" | "document" | "full";
  rating: number;
  reviewsCount: number;
  completedJobs: number;
  lastLogin?: string;
  lastLoginIP?: string;
  lastLoginIp?: string; // PostgreSQL snake_case
  twoFactorEnabled: boolean;
  membershipTier?: "free" | "pro" | "super_pro";
  freeContractsRemaining?: number;
  proContractsUsedThisMonth?: number;
  currentCommissionRate?: number;
  balance?: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminContract {
  id: string;
  _id?: string; // Retrocompatibilidad MongoDB
  client: {
    id?: string;
    _id?: string;
    name: string;
    email: string;
    username?: string;
  };
  doer: {
    id?: string;
    _id?: string;
    name: string;
    email: string;
    username?: string;
  };
  job?: {
    id?: string;
    _id?: string;
    title: string;
  } | null;
  title?: string;
  type?: string;
  price: number;
  commission?: number;
  totalPrice?: number;
  status: string;
  paymentStatus?: string;
  isDeleted?: boolean;
  isHidden?: boolean;
  deletedBy?: {
    id?: string;
    _id?: string;
    name: string;
  };
  deletionReason?: string;
  infractions?: number;
  startDate?: string;
  endDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TicketMessage {
  id: string;
  _id?: string;
  author: {
    id?: string;
    _id?: string;
    name: string;
    email: string;
    avatar?: string;
    adminRole?: AdminRole;
  };
  message: string;
  content?: string;
  attachments?: string[];
  createdAt: string;
  isInternal: boolean;
}

export interface Ticket {
  id: string;
  _id?: string;
  ticketNumber: string;
  subject: string;
  category: "bug" | "feature" | "support" | "report_user" | "report_contract" | "dispute" | "payment" | "other";
  priority: "low" | "medium" | "high" | "urgent";
  status: "open" | "assigned" | "in_progress" | "waiting_user" | "resolved" | "closed";
  createdBy: {
    id?: string;
    _id?: string;
    name: string;
    email: string;
    avatar?: string;
  };
  user?: {
    id?: string;
    _id?: string;
    name: string;
    email: string;
    avatar?: string;
  };
  assignedTo?: {
    id?: string;
    _id?: string;
    name: string;
    email: string;
    adminRole?: AdminRole;
  };
  messages: TicketMessage[];
  tags?: string[];
  resolution?: string;
  closedAt?: string;
  closedBy?: {
    id?: string;
    _id?: string;
    name: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogEntry {
  id: string;
  _id?: string;
  performedBy: {
    id?: string;
    _id?: string;
    name: string;
    email: string;
    adminRole?: AdminRole;
  };
  action: string;
  category: "user" | "contract" | "ticket" | "role" | "permission" | "system" | "payment" | "dispute";
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  targetModel?: string;
  targetId?: string;
  targetIdentifier?: string;
  changes?: Array<{
    field: string;
    oldValue: any;
    newValue: any;
  }>;
  metadata?: Record<string, any>;
  ip: string;
  userAgent?: string;
  passwordVerified?: boolean;
  twoFactorVerified?: boolean;
  createdAt: string;
}

export interface AnalyticsOverview {
  users: {
    total: number;
    active: number;
    banned: number;
    avgTrustScore: number;
  };
  contracts: {
    total: number;
    completed: number;
    completionRate: number;
  };
  tickets: {
    total: number;
    open: number;
  };
}

export interface PaginationData {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
  pagination?: PaginationData;
}
