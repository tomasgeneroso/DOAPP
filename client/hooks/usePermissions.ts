import { useAuth } from "./useAuth";

/**
 * Available permissions in the system
 */
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

  // Dispute permissions
  DISPUTE_CREATE: "dispute:create",
  DISPUTE_VIEW_OWN: "dispute:view:own",
  DISPUTE_VIEW_ANY: "dispute:view:any",
  DISPUTE_ASSIGN: "dispute:assign",
  DISPUTE_RESOLVE: "dispute:resolve",
  DISPUTE_DELETE: "dispute:delete",

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
const ROLE_PERMISSIONS: Record<string, string[]> = {
  owner: [PERMISSIONS.SUPERUSER],
  super_admin: [
    PERMISSIONS.USER_VIEW,
    PERMISSIONS.USER_EDIT_ANY,
    PERMISSIONS.USER_DELETE_ANY,
    PERMISSIONS.USER_BAN,
    PERMISSIONS.USER_UNBAN,
    PERMISSIONS.CONTRACT_VIEW_ANY,
    PERMISSIONS.CONTRACT_EDIT_ANY,
    PERMISSIONS.CONTRACT_DELETE_ANY,
    PERMISSIONS.CONTRACT_MODERATE,
    PERMISSIONS.PAYMENT_VIEW_ANY,
    PERMISSIONS.PAYMENT_REFUND,
    PERMISSIONS.PAYMENT_MANAGE,
    PERMISSIONS.TICKET_VIEW_ANY,
    PERMISSIONS.TICKET_ASSIGN,
    PERMISSIONS.TICKET_RESOLVE,
    PERMISSIONS.TICKET_DELETE,
    PERMISSIONS.DISPUTE_VIEW_ANY,
    PERMISSIONS.DISPUTE_ASSIGN,
    PERMISSIONS.DISPUTE_RESOLVE,
    PERMISSIONS.DISPUTE_DELETE,
    PERMISSIONS.ADMIN_DASHBOARD,
    PERMISSIONS.ADMIN_ANALYTICS,
    PERMISSIONS.ADMIN_AUDIT_LOG,
    PERMISSIONS.ADMIN_SETTINGS,
    PERMISSIONS.ROLE_VIEW,
    PERMISSIONS.ROLE_CREATE,
    PERMISSIONS.ROLE_EDIT,
    PERMISSIONS.ROLE_ASSIGN,
    PERMISSIONS.SYSTEM_BACKUP,
    PERMISSIONS.SYSTEM_RESTORE,
    PERMISSIONS.BLOG_MANAGE,
    PERMISSIONS.BLOG_CREATE,
    PERMISSIONS.BLOG_EDIT,
    PERMISSIONS.BLOG_DELETE,
    PERMISSIONS.BLOG_PUBLISH,
  ],
  admin: [
    PERMISSIONS.USER_VIEW,
    PERMISSIONS.USER_BAN,
    PERMISSIONS.USER_UNBAN,
    PERMISSIONS.CONTRACT_VIEW_ANY,
    PERMISSIONS.CONTRACT_MODERATE,
    PERMISSIONS.PAYMENT_VIEW_ANY,
    PERMISSIONS.TICKET_VIEW_ANY,
    PERMISSIONS.TICKET_ASSIGN,
    PERMISSIONS.TICKET_RESOLVE,
    PERMISSIONS.DISPUTE_VIEW_ANY,
    PERMISSIONS.DISPUTE_ASSIGN,
    PERMISSIONS.DISPUTE_RESOLVE,
    PERMISSIONS.ADMIN_DASHBOARD,
    PERMISSIONS.ADMIN_ANALYTICS,
    PERMISSIONS.BLOG_MANAGE,
    PERMISSIONS.BLOG_CREATE,
    PERMISSIONS.BLOG_EDIT,
    PERMISSIONS.BLOG_DELETE,
    PERMISSIONS.BLOG_PUBLISH,
  ],
  support: [
    PERMISSIONS.USER_VIEW,
    PERMISSIONS.CONTRACT_VIEW_ANY,
    PERMISSIONS.TICKET_CREATE,
    PERMISSIONS.TICKET_VIEW_ANY,
    PERMISSIONS.TICKET_RESOLVE,
    PERMISSIONS.ADMIN_DASHBOARD,
  ],
  marketing: [
    PERMISSIONS.ADMIN_DASHBOARD,
    PERMISSIONS.ADMIN_ANALYTICS,
    PERMISSIONS.USER_VIEW,
    PERMISSIONS.CONTRACT_VIEW_ANY,
  ],
  dpo: [
    PERMISSIONS.PRIVACY_VIEW_CONSENTS,
    PERMISSIONS.PRIVACY_VIEW_DATA_ACCESS,
    PERMISSIONS.PRIVACY_EXPORT_DATA,
    PERMISSIONS.PRIVACY_DELETE_DATA,
    PERMISSIONS.PRIVACY_MANAGE_REQUESTS,
    PERMISSIONS.PRIVACY_VIEW_AUDIT,
    PERMISSIONS.PRIVACY_COMPLIANCE_REPORT,
    PERMISSIONS.USER_VIEW,
    PERMISSIONS.ADMIN_DASHBOARD,
    PERMISSIONS.ADMIN_AUDIT_LOG,
  ],
  user: [
    PERMISSIONS.USER_VIEW,
    PERMISSIONS.USER_EDIT_OWN,
    PERMISSIONS.USER_DELETE_OWN,
    PERMISSIONS.CONTRACT_CREATE,
    PERMISSIONS.CONTRACT_VIEW_OWN,
    PERMISSIONS.CONTRACT_EDIT_OWN,
    PERMISSIONS.CONTRACT_DELETE_OWN,
    PERMISSIONS.PAYMENT_CREATE,
    PERMISSIONS.PAYMENT_VIEW_OWN,
    PERMISSIONS.TICKET_CREATE,
    PERMISSIONS.TICKET_VIEW_OWN,
    PERMISSIONS.DISPUTE_CREATE,
    PERMISSIONS.DISPUTE_VIEW_OWN,
  ],
};

/**
 * Hook to check user permissions
 */
export function usePermissions() {
  const { user } = useAuth();

  /**
   * Check if user has a specific permission
   */
  const hasPermission = (permission: string): boolean => {
    if (!user) return false;

    // Get role permissions
    const rolePermissions = user.adminRole ? ROLE_PERMISSIONS[user.adminRole] || [] : ROLE_PERMISSIONS.user || [];

    // Combine role permissions with custom permissions
    const allPermissions = [...rolePermissions, ...(user.permissions || [])];

    // Superuser has all permissions
    if (allPermissions.includes(PERMISSIONS.SUPERUSER)) {
      return true;
    }

    // Check for specific permission
    return allPermissions.includes(permission);
  };

  /**
   * Check if user has any of the specified permissions
   */
  const hasAnyPermission = (permissions: string[]): boolean => {
    return permissions.some((permission) => hasPermission(permission));
  };

  /**
   * Check if user has all of the specified permissions
   */
  const hasAllPermissions = (permissions: string[]): boolean => {
    return permissions.every((permission) => hasPermission(permission));
  };

  /**
   * Check if user is admin (any admin role)
   */
  const isAdmin = (): boolean => {
    if (!user) return false;
    const adminRoles = ["owner", "super_admin", "admin", "support", "marketing", "dpo"];
    return !!(user.adminRole && adminRoles.includes(user.adminRole));
  };

  return {
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    isAdmin,
    PERMISSIONS,
  };
}
