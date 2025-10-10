// Admin Types
export type AdminRole = "owner" | "super_admin" | "admin" | "support" | "marketing";

export interface AdminUser {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  avatar?: string;
  role: "client" | "doer" | "both";
  adminRole?: AdminRole;
  permissions: string[];
  isBanned: boolean;
  banReason?: string;
  bannedAt?: string;
  banExpiresAt?: string;
  infractions: number;
  trustScore: number;
  verificationLevel: "none" | "email" | "phone" | "document" | "full";
  rating: number;
  reviewsCount: number;
  completedJobs: number;
  lastLogin?: string;
  lastLoginIP?: string;
  twoFactorEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminContract {
  _id: string;
  client: {
    _id: string;
    name: string;
    email: string;
  };
  doer: {
    _id: string;
    name: string;
    email: string;
  };
  job: {
    _id: string;
    title: string;
  };
  price: number;
  commission: number;
  totalPrice: number;
  status: string;
  isDeleted: boolean;
  isHidden: boolean;
  deletedBy?: {
    _id: string;
    name: string;
  };
  deletionReason?: string;
  infractions: number;
  createdAt: string;
  updatedAt: string;
}

export interface TicketMessage {
  _id: string;
  author: {
    _id: string;
    name: string;
    email: string;
    avatar?: string;
    adminRole?: AdminRole;
  };
  message: string;
  attachments?: string[];
  createdAt: string;
  isInternal: boolean;
}

export interface Ticket {
  _id: string;
  ticketNumber: string;
  subject: string;
  category: "bug" | "feature" | "support" | "report_user" | "report_contract" | "dispute" | "payment" | "other";
  priority: "low" | "medium" | "high" | "urgent";
  status: "open" | "assigned" | "in_progress" | "waiting_user" | "resolved" | "closed";
  createdBy: {
    _id: string;
    name: string;
    email: string;
    avatar?: string;
  };
  assignedTo?: {
    _id: string;
    name: string;
    email: string;
    adminRole?: AdminRole;
  };
  messages: TicketMessage[];
  tags: string[];
  resolution?: string;
  closedAt?: string;
  closedBy?: {
    _id: string;
    name: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogEntry {
  _id: string;
  performedBy: {
    _id: string;
    name: string;
    email: string;
    adminRole: AdminRole;
  };
  action: string;
  category: "user" | "contract" | "ticket" | "role" | "permission" | "system";
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
  passwordVerified: boolean;
  twoFactorVerified: boolean;
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
