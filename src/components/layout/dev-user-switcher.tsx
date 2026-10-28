"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import type { UserRole } from "@/lib/domain/enums";
import { switchDevUser } from "@/app/settings/user-actions";

/**
 * Development sign-in: pick which user you are. Lets the team try the roles
 * locally until Microsoft SSO replaces it.
 */
export function DevUserSwitcher({
  users,
  currentId,
}: {
  users: { id: string; name: string; role: UserRole }[];
  currentId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  return (
    <label className="flex items-center gap-2 text-sm" title="Development sign-in – will be replaced by Microsoft SSO">
      <span className="hidden rounded bg-josera-gold/30 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide sm:inline">
        Dev sign-in
      </span>
      <span className="sr-only">Signed in as</span>
      <select
        value={currentId ?? ""}
        disabled={pending}
        onChange={(e) => {
          const id = e.target.value;
          startTransition(async () => {
            const result = await switchDevUser(id);
            if (result.ok) router.refresh();
            else window.alert(result.error);
          });
        }}
        className="h-8 max-w-48 rounded-md border bg-background px-2 text-sm"
      >
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name} ({ROLE_LABELS[u.role]})
          </option>
        ))}
      </select>
      {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Switching user" />}
    </label>
  );
}
