import 'reflect-metadata';
import {
  Table,
  Column,
  Model,
  DataType,
  Default,
  AllowNull,
  Index,
  BeforeValidate,
} from 'sequelize-typescript';

/**
 * Role Model - PostgreSQL/Sequelize
 *
 * Sistema RBAC dinámico con:
 * - Roles predefinidos (owner, super_admin, admin, support, marketing, user)
 * - Jerarquía de roles (level)
 * - Permisos personalizables
 * - Control de asignación
 */

// ============================================
// TYPES
// ============================================

export type RoleName =
  | 'owner'
  | 'super_admin'
  | 'admin'
  | 'support'
  | 'marketing'
  | 'user';

// ============================================
// MODEL
// ============================================

@Table({
  tableName: 'roles',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['name'], unique: true },
    { fields: ['level'] },
    { fields: ['is_active'] },
  ],
})
export class Role extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  id!: string;

  // ============================================
  // BASIC INFO
  // ============================================

  @AllowNull(false)
  @Index({ unique: true })
  @Column(DataType.STRING(30))
  name!: RoleName;

  @AllowNull(false)
  @Column(DataType.STRING(100))
  displayName!: string;

  @Default('')
  @Column(DataType.TEXT)
  description!: string;

  // ============================================
  // PERMISSIONS
  // ============================================

  @Default([])
  @Column(DataType.ARRAY(DataType.STRING))
  permissions!: string[];

  @Default([])
  @Column(DataType.ARRAY(DataType.STRING))
  customPermissions!: string[]; // Permisos personalizados adicionales

  // ============================================
  // HIERARCHY
  // ============================================

  @AllowNull(false)
  @Index
  @Column(DataType.INTEGER)
  level!: number; // owner=0, super_admin=1, admin=2, support=3, marketing=4, user=100

  // ============================================
  // CONFIGURATION
  // ============================================

  @Default(true)
  @Column(DataType.BOOLEAN)
  assignable!: boolean; // Puede ser asignado por otros admins

  @Default(true)
  @Index
  @Column(DataType.BOOLEAN)
  isActive!: boolean;

  @Default('#6B7280')
  @Column(DataType.STRING(20))
  color!: string; // Color para UI (hex)

  // ============================================
  // VALIDATION HOOKS
  // ============================================

  @BeforeValidate
  static validateRole(instance: Role) {
    // Trim strings
    if (instance.name) {
      instance.name = instance.name.trim() as RoleName;
    }
    if (instance.displayName) {
      instance.displayName = instance.displayName.trim();
    }

    // Validate name is one of the allowed values
    const validNames: RoleName[] = [
      'owner',
      'super_admin',
      'admin',
      'support',
      'marketing',
      'user',
    ];
    if (instance.name && !validNames.includes(instance.name)) {
      throw new Error(
        `Invalid role name: ${instance.name}. Must be one of: ${validNames.join(', ')}`
      );
    }
  }

  // ============================================
  // METHODS
  // ============================================

  /**
   * Check if role has specific permission
   */
  hasPermission(permission: string): boolean {
    return (
      this.permissions.includes(permission) ||
      this.customPermissions.includes(permission)
    );
  }

  /**
   * Add permission to role
   */
  async addPermission(permission: string): Promise<void> {
    if (!this.hasPermission(permission)) {
      this.permissions.push(permission);
      await this.save();
    }
  }

  /**
   * Remove permission from role
   */
  async removePermission(permission: string): Promise<void> {
    this.permissions = this.permissions.filter((p) => p !== permission);
    this.customPermissions = this.customPermissions.filter(
      (p) => p !== permission
    );
    await this.save();
  }

  /**
   * Add custom permission
   */
  async addCustomPermission(permission: string): Promise<void> {
    if (!this.customPermissions.includes(permission)) {
      this.customPermissions.push(permission);
      await this.save();
    }
  }

  /**
   * Remove custom permission
   */
  async removeCustomPermission(permission: string): Promise<void> {
    this.customPermissions = this.customPermissions.filter(
      (p) => p !== permission
    );
    await this.save();
  }

  /**
   * Get all permissions (standard + custom)
   */
  getAllPermissions(): string[] {
    return [...new Set([...this.permissions, ...this.customPermissions])];
  }

  /**
   * Check if role is owner
   */
  isOwner(): boolean {
    return this.name === 'owner';
  }

  /**
   * Check if role is super admin
   */
  isSuperAdmin(): boolean {
    return this.name === 'super_admin';
  }

  /**
   * Check if role is admin (any level)
   */
  isAdmin(): boolean {
    return (
      this.name === 'owner' ||
      this.name === 'super_admin' ||
      this.name === 'admin'
    );
  }

  /**
   * Check if role is staff (admin, support, marketing)
   */
  isStaff(): boolean {
    return this.isAdmin() || this.name === 'support' || this.name === 'marketing';
  }

  /**
   * Check if this role can manage another role
   */
  canManageRole(otherRole: Role): boolean {
    // Owner can manage all
    if (this.isOwner()) return true;

    // Cannot manage roles at same or higher level
    if (this.level >= otherRole.level) return false;

    // Cannot manage non-assignable roles
    if (!otherRole.assignable) return false;

    return true;
  }

  /**
   * Check if role is higher than another
   */
  isHigherThan(otherRole: Role): boolean {
    return this.level < otherRole.level;
  }

  /**
   * Check if role is lower than another
   */
  isLowerThan(otherRole: Role): boolean {
    return this.level > otherRole.level;
  }

  /**
   * Deactivate role
   */
  async deactivate(): Promise<void> {
    if (this.isOwner()) {
      throw new Error('Cannot deactivate owner role');
    }

    this.isActive = false;
    await this.save();
  }

  /**
   * Activate role
   */
  async activate(): Promise<void> {
    this.isActive = true;
    await this.save();
  }

  /**
   * Update color
   */
  async updateColor(color: string): Promise<void> {
    // Validate hex color format
    if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
      throw new Error('Invalid hex color format');
    }

    this.color = color;
    await this.save();
  }

  /**
   * Get role display info
   */
  getDisplayInfo(): {
    name: string;
    displayName: string;
    level: number;
    color: string;
    isStaff: boolean;
  } {
    return {
      name: this.name,
      displayName: this.displayName,
      level: this.level,
      color: this.color,
      isStaff: this.isStaff(),
    };
  }

  /**
   * Static: Get default role levels
   */
  static getDefaultLevels(): Record<RoleName, number> {
    return {
      owner: 0,
      super_admin: 1,
      admin: 2,
      support: 3,
      marketing: 4,
      user: 100,
    };
  }

  /**
   * Static: Get default role colors
   */
  static getDefaultColors(): Record<RoleName, string> {
    return {
      owner: '#DC2626', // red-600
      super_admin: '#9333EA', // purple-600
      admin: '#2563EB', // blue-600
      support: '#16A34A', // green-600
      marketing: '#EA580C', // orange-600
      user: '#6B7280', // gray-500
    };
  }
}

export default Role;
