// Auth abstraction. The rest of the app only uses getCurrentUser(), can() and
// requirePermission(); the provider behind it is swappable. Today: a
// development sign-in (user picked in the header, stored in a cookie).
// Later: Auth.js with Microsoft Entra ID (M365 SSO).

import { cache } from "react";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import type { UserRole } from "@/lib/domain/enums";
import { can, type Permission } from "@/lib/auth/permissions";

export { can, ROLE_DESCRIPTIONS, ROLE_LABELS, type Permission } from "@/lib/auth/permissions";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  team: string | null;
}

export interface AuthProvider {
  /** Whether the user can be switched in the UI (development only). */
  readonly switchable: boolean;
  getCurrentUser(): Promise<SessionUser | null>;
}

/** Cookie holding the id of the development user. */
export const DEV_USER_COOKIE = "dev-user-id";

/**
 * Development sign-in: the user chosen in the header (cookie), else
 * DEV_USER_EMAIL, else the first admin. No passwords – replace before deploying.
 */
export const devAuthProvider: AuthProvider = {
  switchable: true,
  async getCurrentUser() {
    const chosen = (await cookies()).get(DEV_USER_COOKIE)?.value;
    const email = process.env.DEV_USER_EMAIL;
    const user =
      (chosen ? await db.user.findUnique({ where: { id: chosen } }) : null) ??
      (email ? await db.user.findUnique({ where: { email } }) : null) ??
      (await db.user.findFirst({ where: { role: "admin" }, orderBy: { createdAt: "asc" } }));
    if (!user) return null;
    return { id: user.id, name: user.name, email: user.email, role: user.role as UserRole, team: user.team };
  },
};

let provider: AuthProvider = devAuthProvider;

export function setAuthProvider(next: AuthProvider): void {
  provider = next;
}

export function authProvider(): AuthProvider {
  return provider;
}

/** The signed-in user; cached per request. */
export const getCurrentUser = cache((): Promise<SessionUser | null> => provider.getCurrentUser());

const DENIED: Record<Permission, string> = {
  read: "You do not have access.",
  comment: "You do not have permission to comment.",
  write: "You do not have permission to make changes.",
  manage: "Only admins can do this.",
};

/** For server actions: the current user if they have `permission`, else an error message. */
export async function requirePermission(
  permission: Permission,
): Promise<{ user: SessionUser; error?: undefined } | { user?: undefined; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not signed in." };
  if (!can(user.role, permission)) return { error: DENIED[permission] };
  return { user };
}
