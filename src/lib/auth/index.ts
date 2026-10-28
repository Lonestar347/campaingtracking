// Auth abstraction. The rest of the app only uses getCurrentUser() and can();
// the provider behind it is swappable. Today: a fixed development user.
// Later: Auth.js with Microsoft Entra ID (M365 SSO).

import { db } from "@/lib/db";
import type { UserRole } from "@/lib/domain/enums";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  team: string | null;
}

export interface AuthProvider {
  getCurrentUser(): Promise<SessionUser | null>;
}

/** Treats the user with DEV_USER_EMAIL (or the first admin) as logged in. */
export const devAuthProvider: AuthProvider = {
  async getCurrentUser() {
    const email = process.env.DEV_USER_EMAIL;
    const user = email
      ? await db.user.findUnique({ where: { email } })
      : await db.user.findFirst({ where: { role: "admin" }, orderBy: { createdAt: "asc" } });
    if (!user) return null;
    return { id: user.id, name: user.name, email: user.email, role: user.role as UserRole, team: user.team };
  },
};

let provider: AuthProvider = devAuthProvider;

export function setAuthProvider(next: AuthProvider): void {
  provider = next;
}

export function getCurrentUser(): Promise<SessionUser | null> {
  return provider.getCurrentUser();
}

export type Permission = "read" | "write" | "manage";

const PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  admin: ["read", "write", "manage"],
  editor: ["read", "write"],
  viewer: ["read"],
};

/** "manage" covers master data and user administration. */
export function can(role: UserRole, permission: Permission): boolean {
  return PERMISSIONS[role].includes(permission);
}

/** For server actions: the current user if they have `permission`, else an error message. */
export async function requirePermission(
  permission: Permission,
): Promise<{ user: SessionUser; error?: undefined } | { user?: undefined; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not signed in." };
  if (!can(user.role, permission)) return { error: "You do not have permission to make changes." };
  return { user };
}
