"use server";

// User administration (admins only) and the development sign-in switcher.

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { DEV_USER_COOKIE, authProvider, requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/domain/enums";
import { toFieldErrors, type FieldErrors } from "@/lib/validation/fields";

export type UserActionResult = { ok: true; id: string } | { ok: false; error?: string; fieldErrors?: FieldErrors };

export interface UserFormValues {
  name: string;
  email: string;
  team: string;
  role: string;
}

const userSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(120, "Maximum 120 characters"),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  team: z
    .string()
    .trim()
    .max(80, "Maximum 80 characters")
    .transform((v) => v || null),
  role: z.enum(USER_ROLES, { errorMap: () => ({ message: "Select a role" }) }),
});

async function emailTaken(email: string, exceptId?: string) {
  const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
  return !!existing && existing.id !== exceptId;
}

export async function createUser(values: UserFormValues): Promise<UserActionResult> {
  const auth = await requirePermission("manage");
  if (!auth.user) return { ok: false, error: auth.error };

  const parsed = userSchema.safeParse(values);
  if (!parsed.success) return { ok: false, fieldErrors: toFieldErrors(parsed.error) };
  if (await emailTaken(parsed.data.email)) return { ok: false, fieldErrors: { email: "This email address is already in use" } };

  const user = await db.$transaction(async (tx) => {
    const created = await tx.user.create({ data: parsed.data });
    await tx.activityLog.create({
      data: {
        entityType: "user",
        entityId: created.id,
        action: "created",
        details: { name: created.name, role: created.role },
        userId: auth.user.id,
      },
    });
    return created;
  });

  revalidatePath("/settings/users");
  return { ok: true, id: user.id };
}

export async function updateUser(userId: string, values: UserFormValues): Promise<UserActionResult> {
  const auth = await requirePermission("manage");
  if (!auth.user) return { ok: false, error: auth.error };

  const parsed = userSchema.safeParse(values);
  if (!parsed.success) return { ok: false, fieldErrors: toFieldErrors(parsed.error) };

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return { ok: false, error: "User not found." };
  if (await emailTaken(parsed.data.email, userId)) {
    return { ok: false, fieldErrors: { email: "This email address is already in use" } };
  }
  // Keep at least one admin, otherwise nobody can manage users any more.
  if (user.role === "admin" && parsed.data.role !== "admin") {
    const admins = await db.user.count({ where: { role: "admin" } });
    if (admins <= 1) return { ok: false, fieldErrors: { role: "The last admin cannot lose the admin role" } };
  }

  const changes = (["name", "email", "team", "role"] as const)
    .filter((field) => (user[field] ?? null) !== (parsed.data[field] ?? null))
    .map((field) => ({ field, from: user[field], to: parsed.data[field] }));

  if (changes.length > 0) {
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: parsed.data });
      await tx.activityLog.create({
        data: { entityType: "user", entityId: userId, action: "updated", details: { changes }, userId: auth.user.id },
      });
    });
  }

  revalidatePath("/", "layout");
  return { ok: true, id: userId };
}

/** Development sign-in: switch the current user (only while the dev auth provider is active). */
export async function switchDevUser(userId: string): Promise<{ ok: boolean; error?: string }> {
  if (!authProvider().switchable) return { ok: false, error: "Switching users is not available." };
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return { ok: false, error: "User not found." };
  (await cookies()).set(DEV_USER_COOKIE, user.id, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 30 });
  revalidatePath("/", "layout");
  return { ok: true };
}
