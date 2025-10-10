import mongoose from "mongoose";

/**
 * Role Model for dynamic RBAC system
 * Stores role definitions and their associated permissions
 */

const roleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      enum: ["owner", "super_admin", "admin", "support", "marketing", "user"],
    },
    displayName: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      default: "",
    },
    permissions: [{
      type: String,
      required: true,
    }],
    // Role hierarchy level (owner=0, super_admin=1, etc.)
    level: {
      type: Number,
      required: true,
      default: 100, // Regular user
    },
    // Can this role be assigned by other admins
    assignable: {
      type: Boolean,
      default: true,
    },
    // Is this role active
    isActive: {
      type: Boolean,
      default: true,
    },
    // Color for UI display
    color: {
      type: String,
      default: "#6B7280", // gray
    },
    // Custom permissions that can be added to this role
    customPermissions: [{
      type: String,
    }],
  },
  {
    timestamps: true,
  }
);

// Indexes
roleSchema.index({ name: 1 });
roleSchema.index({ level: 1 });

export interface IRole extends mongoose.Document {
  name: "owner" | "super_admin" | "admin" | "support" | "marketing" | "user";
  displayName: string;
  description: string;
  permissions: string[];
  level: number;
  assignable: boolean;
  isActive: boolean;
  color: string;
  customPermissions: string[];
  createdAt: Date;
  updatedAt: Date;
}

export default mongoose.model<IRole>("Role", roleSchema);
