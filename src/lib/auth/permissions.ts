// Role -> permission mapping. Pure, so it can be used in client components and tests.

import type { UserRole } from "@/lib/domain/enums";

/**
 * - read: see everything
 * - comment: write comments (everyone, so e.g. sales can give feedback)
 * - write: create and change campaigns, channels, assets, links, reports
 * - manage: user administration and master data
 */
export type Permission = "read" | "comment" | "write" | "manage";

const PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  admin: ["read", "comment", "write", "manage"],
  editor: ["read", "comment", "write"],
  viewer: ["read", "comment"],
};

export function can(role: UserRole, permission: Permission): boolean {
  return PERMISSIONS[role]?.includes(permission) ?? false;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  admin: "Everything, incl. user management",
  editor: "Create and edit campaigns, comment",
  viewer: "View and comment",
};
