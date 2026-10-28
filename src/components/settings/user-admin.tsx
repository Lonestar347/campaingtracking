"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { TEAMS, USER_ROLES, type UserRole } from "@/lib/domain/enums";
import type { FieldErrors } from "@/lib/validation/fields";
import {
  createUser,
  updateUser,
  type UserActionResult,
  type UserFormValues,
} from "@/app/settings/user-actions";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  team: string | null;
  role: UserRole;
  owns: number;
  comments: number;
}

let formCounter = 0;

function UserForm({
  initial,
  submitLabel,
  submit,
  onDone,
}: {
  initial: UserFormValues;
  submitLabel: string;
  submit: (values: UserFormValues) => Promise<UserActionResult>;
  onDone: () => void;
}) {
  const router = useRouter();
  const [prefix] = React.useState(() => `uf${++formCounter}`);
  const [values, setValues] = React.useState(initial);
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const set = (key: keyof UserFormValues, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: "" }));
  };

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setFormError(null);
        startTransition(async () => {
          const result = await submit(values);
          if (result.ok) {
            onDone();
            router.refresh();
          } else {
            setErrors(result.fieldErrors ?? {});
            setFormError(result.error ?? null);
          }
        });
      }}
      className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-[1.2fr_1.5fr_1fr_0.8fr_auto]"
    >
      <Field label="Name" htmlFor={`${prefix}-name`} required error={errors.name}>
        <Input id={`${prefix}-name`} value={values.name} onChange={(e) => set("name", e.target.value)} aria-invalid={!!errors.name} />
      </Field>
      <Field label="Email" htmlFor={`${prefix}-email`} required error={errors.email}>
        <Input
          id={`${prefix}-email`}
          type="email"
          value={values.email}
          onChange={(e) => set("email", e.target.value)}
          aria-invalid={!!errors.email}
        />
      </Field>
      <Field label="Team" htmlFor={`${prefix}-team`} error={errors.team}>
        <Input id={`${prefix}-team`} list="team-list" value={values.team} onChange={(e) => set("team", e.target.value)} />
      </Field>
      <Field label="Role" htmlFor={`${prefix}-role`} required error={errors.role}>
        <Select id={`${prefix}-role`} value={values.role} onChange={(e) => set("role", e.target.value)} aria-invalid={!!errors.role}>
          {USER_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex gap-2 lg:mt-6">
        <Button type="submit" size="sm" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          {submitLabel}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
      </div>
      {formError && (
        <p className="text-sm font-medium text-status-red sm:col-span-2 lg:col-span-5" role="alert">
          {formError}
        </p>
      )}
    </form>
  );
}

export function UserAdmin({ users, currentUserId }: { users: AdminUser[]; currentUserId: string }) {
  const [editing, setEditing] = React.useState<string | "new" | null>(null);

  return (
    <div className="space-y-4">
      <datalist id="team-list">
        {TEAMS.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>

      {editing === "new" ? (
        <div className="rounded-xl border bg-card p-4">
          <h2 className="mb-3 font-semibold">New user</h2>
          <UserForm
            initial={{ name: "", email: "", team: "", role: "editor" }}
            submitLabel="Add user"
            submit={createUser}
            onDone={() => setEditing(null)}
          />
        </div>
      ) : (
        <Button variant="accent" onClick={() => setEditing("new")}>
          <Plus /> Add user
        </Button>
      )}

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <caption className="sr-only">Users</caption>
          <thead className="border-b text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Email</th>
              <th className="px-4 py-2 font-medium">Team</th>
              <th className="px-4 py-2 font-medium">Role</th>
              <th className="px-4 py-2 text-right font-medium">Owns</th>
              <th className="px-4 py-2 text-right font-medium">Comments</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) =>
              editing === u.id ? (
                <tr key={u.id} className="border-t">
                  <td colSpan={7} className="px-4 py-3">
                    <UserForm
                      initial={{ name: u.name, email: u.email, team: u.team ?? "", role: u.role }}
                      submitLabel="Save"
                      submit={(values) => updateUser(u.id, values)}
                      onDone={() => setEditing(null)}
                    />
                  </td>
                </tr>
              ) : (
                <tr key={u.id} className="border-t">
                  <td className="px-4 py-2 font-medium">
                    {u.name}
                    {u.id === currentUserId && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span>}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{u.email}</td>
                  <td className="px-4 py-2">{u.team ?? <span className="text-muted-foreground">–</span>}</td>
                  <td className="px-4 py-2">
                    <span className="rounded bg-secondary px-1.5 py-0.5 text-xs font-medium">{ROLE_LABELS[u.role]}</span>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums" title="Campaigns, channels and assets owned">
                    {u.owns}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{u.comments}</td>
                  <td className="px-2 py-1 text-right">
                    <Button size="icon-sm" variant="ghost" aria-label={`Edit ${u.name}`} onClick={() => setEditing(u.id)}>
                      <Pencil />
                    </Button>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
