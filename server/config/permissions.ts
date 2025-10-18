/**
 * Permission system for RBAC
 * Defines all available permissions and role mappings
 */

// Available permissions in the system
export const PERMISSIONS = {
  // User permissions
  USER_VIEW: "user:view",
  USER_EDIT_OWN: "user:edit:own",
  USER_EDIT_ANY: "user:edit:any",
  USER_DELETE_OWN: "user:delete:own",
  USER_DELETE_ANY: "user:delete:any",
  USER_BAN: "user:ban",
  USER_UNBAN: "user:unban",

  // Contract permissions
  CONTRACT_CREATE: "contract:create",
  CONTRACT_VIEW_OWN: "contract:view:own",
  CONTRACT_VIEW_ANY: "contract:view:any",
  CONTRACT_EDIT_OWN: "contract:edit:own",
  CONTRACT_EDIT_ANY: "contract:edit:any",
  CONTRACT_DELETE_OWN: "contract:delete:own",
  CONTRACT_DELETE_ANY: "contract:delete:any",
  CONTRACT_MODERATE: "contract:moderate",

  // Payment permissions
  PAYMENT_CREATE: "payment:create",
  PAYMENT_VIEW_OWN: "payment:view:own",
  PAYMENT_VIEW_ANY: "payment:view:any",
  PAYMENT_REFUND: "payment:refund",
  PAYMENT_MANAGE: "payment:manage",

  // Ticket permissions
  TICKET_CREATE: "ticket:create",
  TICKET_VIEW_OWN: "ticket:view:own",
  TICKET_VIEW_ANY: "ticket:view:any",
  TICKET_ASSIGN: "ticket:assign",
  TICKET_RESOLVE: "ticket:resolve",
  TICKET_DELETE: "ticket:delete",

  // Admin permissions
  ADMIN_DASHBOARD: "admin:dashboard",
  ADMIN_ANALYTICS: "admin:analytics",
  ADMIN_AUDIT_LOG: "admin:audit_log",
  ADMIN_SETTINGS: "admin:settings",

  // Role permissions
  ROLE_VIEW: "role:view",
  ROLE_CREATE: "role:create",
  ROLE_EDIT: "role:edit",
  ROLE_DELETE: "role:delete",
  ROLE_ASSIGN: "role:assign",

  // System permissions
  SYSTEM_BACKUP: "system:backup",
  SYSTEM_RESTORE: "system:restore",
  SYSTEM_MAINTENANCE: "system:maintenance",

  // Privacy & Data Protection Officer (DPO) permissions
  PRIVACY_VIEW_CONSENTS: "privacy:view_consents",
  PRIVACY_VIEW_DATA_ACCESS: "privacy:view_data_access",
  PRIVACY_EXPORT_DATA: "privacy:export_data",
  PRIVACY_DELETE_DATA: "privacy:delete_data",
  PRIVACY_MANAGE_REQUESTS: "privacy:manage_requests",
  PRIVACY_VIEW_AUDIT: "privacy:view_audit",
  PRIVACY_COMPLIANCE_REPORT: "privacy:compliance_report",

  // Blog permissions
  BLOG_VIEW: "blog:view",
  BLOG_CREATE: "blog:create",
  BLOG_EDIT: "blog:edit",
  BLOG_DELETE: "blog:delete",
  BLOG_MANAGE: "blog:manage",
  BLOG_PUBLISH: "blog:publish",

  // Special permissions
  SUPERUSER: "*", // All permissions
} as const;

/**
 * Default permissions for each role
 */
export const ROLE_PERMISSIONS = {
  owner: [
    PERMISSIONS.SUPERUSER, // Owner has all permissions
  ],
  super_admin: [
    // User management
    PERMISSIONS.USER_VIEW,
    PERMISSIONS.USER_EDIT_ANY,
    PERMISSIONS.USER_DELETE_ANY,
    PERMISSIONS.USER_BAN,
    PERMISSIONS.USER_UNBAN,

    // Contract management
    PERMISSIONS.CONTRACT_VIEW_ANY,
    PERMISSIONS.CONTRACT_EDIT_ANY,
    PERMISSIONS.CONTRACT_DELETE_ANY,
    PERMISSIONS.CONTRACT_MODERATE,

    // Payment management
    PERMISSIONS.PAYMENT_VIEW_ANY,
    PERMISSIONS.PAYMENT_REFUND,
    PERMISSIONS.PAYMENT_MANAGE,

    // Ticket management
    PERMISSIONS.TICKET_VIEW_ANY,
    PERMISSIONS.TICKET_ASSIGN,
    PERMISSIONS.TICKET_RESOLVE,
    PERMISSIONS.TICKET_DELETE,

    // Admin access
    PERMISSIONS.ADMIN_DASHBOARD,
    PERMISSIONS.ADMIN_ANALYTICS,
    PERMISSIONS.ADMIN_AUDIT_LOG,
    PERMISSIONS.ADMIN_SETTINGS,

    // Role management (except owner role)
    PERMISSIONS.ROLE_VIEW,
    PERMISSIONS.ROLE_CREATE,
    PERMISSIONS.ROLE_EDIT,
    PERMISSIONS.ROLE_ASSIGN,

    // System
    PERMISSIONS.SYSTEM_BACKUP,
    PERMISSIONS.SYSTEM_RESTORE,

    // Blog management
    PERMISSIONS.BLOG_MANAGE,
    PERMISSIONS.BLOG_CREATE,
    PERMISSIONS.BLOG_EDIT,
    PERMISSIONS.BLOG_DELETE,
    PERMISSIONS.BLOG_PUBLISH,
  ],
  admin: [
    // User management (limited)
    PERMISSIONS.USER_VIEW,
    PERMISSIONS.USER_BAN,
    PERMISSIONS.USER_UNBAN,

    // Contract management
    PERMISSIONS.CONTRACT_VIEW_ANY,
    PERMISSIONS.CONTRACT_MODERATE,

    // Payment management (view only)
    PERMISSIONS.PAYMENT_VIEW_ANY,

    // Ticket management
    PERMISSIONS.TICKET_VIEW_ANY,
    PERMISSIONS.TICKET_ASSIGN,
    PERMISSIONS.TICKET_RESOLVE,

    // Admin access
    PERMISSIONS.ADMIN_DASHBOARD,
    PERMISSIONS.ADMIN_ANALYTICS,

    // Blog management
    PERMISSIONS.BLOG_MANAGE,
    PERMISSIONS.BLOG_CREATE,
    PERMISSIONS.BLOG_EDIT,
    PERMISSIONS.BLOG_DELETE,
    PERMISSIONS.BLOG_PUBLISH,
  ],
  support: [
    // User management (view only)
    PERMISSIONS.USER_VIEW,

    // Contract management (view only)
    PERMISSIONS.CONTRACT_VIEW_ANY,

    // Ticket management
    PERMISSIONS.TICKET_CREATE,
    PERMISSIONS.TICKET_VIEW_ANY,
    PERMISSIONS.TICKET_RESOLVE,

    // Admin access (limited)
    PERMISSIONS.ADMIN_DASHBOARD,
  ],
  marketing: [
    // Analytics only
    PERMISSIONS.ADMIN_DASHBOARD,
    PERMISSIONS.ADMIN_ANALYTICS,

    // View permissions (for reports)
    PERMISSIONS.USER_VIEW,
    PERMISSIONS.CONTRACT_VIEW_ANY,
  ],
  dpo: [
    // Privacy & compliance permissions
    PERMISSIONS.PRIVACY_VIEW_CONSENTS,
    PERMISSIONS.PRIVACY_VIEW_DATA_ACCESS,
    PERMISSIONS.PRIVACY_EXPORT_DATA,
    PERMISSIONS.PRIVACY_DELETE_DATA,
    PERMISSIONS.PRIVACY_MANAGE_REQUESTS,
    PERMISSIONS.PRIVACY_VIEW_AUDIT,
    PERMISSIONS.PRIVACY_COMPLIANCE_REPORT,

    // User management (view only for privacy purposes)
    PERMISSIONS.USER_VIEW,

    // Admin access for privacy dashboard
    PERMISSIONS.ADMIN_DASHBOARD,
    PERMISSIONS.ADMIN_AUDIT_LOG,
  ],
  user: [
    // Basic user permissions
    PERMISSIONS.USER_VIEW,
    PERMISSIONS.USER_EDIT_OWN,
    PERMISSIONS.USER_DELETE_OWN,

    // Contract permissions
    PERMISSIONS.CONTRACT_CREATE,
    PERMISSIONS.CONTRACT_VIEW_OWN,
    PERMISSIONS.CONTRACT_EDIT_OWN,
    PERMISSIONS.CONTRACT_DELETE_OWN,

    // Payment permissions
    PERMISSIONS.PAYMENT_CREATE,
    PERMISSIONS.PAYMENT_VIEW_OWN,

    // Ticket permissions
    PERMISSIONS.TICKET_CREATE,
    PERMISSIONS.TICKET_VIEW_OWN,
  ],
} as const;

/**
 * Role hierarchy levels
 * Lower number = higher authority
 */
export const ROLE_LEVELS = {
  owner: 0,
  super_admin: 1,
  admin: 2,
  dpo: 2, // Same level as admin
  support: 3,
  marketing: 4,
  user: 100,
} as const;

/**
 * Role display information
 */
export const ROLE_INFO = {
  owner: {
    displayName: "Owner",
    description: "Full system access. Can modify everything and manage all roles.",
    color: "#DC2626", // red-600
    assignable: false, // Only manually assigned
  },
  super_admin: {
    displayName: "Super Admin",
    description: "Manage roles, users, and system settings. Can ban users and access audit logs.",
    color: "#7C3AED", // violet-600
    assignable: false, // Only owner can assign
  },
  admin: {
    displayName: "Admin",
    description: "Moderate content, manage users (suspend), and handle tickets.",
    color: "#2563EB", // blue-600
    assignable: true,
  },
  support: {
    displayName: "Support",
    description: "Handle support tickets and view user/contract information.",
    color: "#059669", // emerald-600
    assignable: true,
  },
  marketing: {
    displayName: "Marketing",
    description: "Access analytics and reports. No sensitive data access.",
    color: "#D97706", // amber-600
    assignable: true,
  },
  dpo: {
    displayName: "Data Protection Officer",
    description: "Manage privacy compliance, consents, data access requests, and GDPR/LPD obligations.",
    color: "#0891B2", // cyan-600
    assignable: false, // Only owner/super_admin can assign
  },
  user: {
    displayName: "User",
    description: "Standard user with basic platform access.",
    color: "#6B7280", // gray-500
    assignable: true,
  },
} as const;

/**
 * Check if user has permission
 */
export function hasPermission(
  userPermissions: string[],
  requiredPermission: string
): boolean {
  // Superuser has all permissions
  if (userPermissions.includes(PERMISSIONS.SUPERUSER)) {
    return true;
  }

  // Check for specific permission
  return userPermissions.includes(requiredPermission);
}

/**
 * Check if user has any of the permissions
 */
export function hasAnyPermission(
  userPermissions: string[],
  requiredPermissions: string[]
): boolean {
  // Superuser has all permissions
  if (userPermissions.includes(PERMISSIONS.SUPERUSER)) {
    return true;
  }

  // Check if user has at least one of the required permissions
  return requiredPermissions.some((permission) =>
    userPermissions.includes(permission)
  );
}

/**
 * Check if user has all permissions
 */
export function hasAllPermissions(
  userPermissions: string[],
  requiredPermissions: string[]
): boolean {
  // Superuser has all permissions
  if (userPermissions.includes(PERMISSIONS.SUPERUSER)) {
    return true;
  }

  // Check if user has all required permissions
  return requiredPermissions.every((permission) =>
    userPermissions.includes(permission)
  );
}

/**
 * Check if role can be assigned by another role
 */
export function canAssignRole(
  assignerRole: string,
  targetRole: string
): boolean {
  const assignerLevel = ROLE_LEVELS[assignerRole as keyof typeof ROLE_LEVELS] || 100;
  const targetLevel = ROLE_LEVELS[targetRole as keyof typeof ROLE_LEVELS] || 100;

  // Owner can assign anyone
  if (assignerRole === "owner") return true;

  // Super admin can assign anyone except owner
  if (assignerRole === "super_admin" && targetRole !== "owner") return true;

  // Others can only assign roles of lower hierarchy
  return assignerLevel < targetLevel;
}

export default {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  ROLE_LEVELS,
  ROLE_INFO,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  canAssignRole,
};
