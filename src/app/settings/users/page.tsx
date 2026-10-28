import { redirect } from "next/navigation";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, can, getCurrentUser } from "@/lib/auth";
import { getUsersWithCounts } from "@/lib/queries";
import { USER_ROLES, type UserRole } from "@/lib/domain/enums";
import { UserAdmin } from "@/components/settings/user-admin";

export const metadata = { title: "Users · Campaign Tracker" };

export default async function UsersPage() {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "manage")) redirect("/");
  const users = await getUsersWithCounts();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground">Who can use the tool and what they are allowed to do.</p>
      </div>

      <dl className="grid gap-3 sm:grid-cols-3">
        {USER_ROLES.map((role) => (
          <div key={role} className="rounded-xl border bg-card px-4 py-3">
            <dt className="text-sm font-semibold">{ROLE_LABELS[role]}</dt>
            <dd className="text-sm text-muted-foreground">{ROLE_DESCRIPTIONS[role]}</dd>
          </div>
        ))}
      </dl>

      <UserAdmin
        currentUserId={user.id}
        users={users.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          team: u.team,
          role: u.role as UserRole,
          owns: u._count.ownedCampaigns + u._count.ownedChannels + u._count.ownedAssets,
          comments: u._count.comments,
        }))}
      />

      <p className="text-xs text-muted-foreground">
        Sign-in is a development stand-in for now (user switcher in the header). With Microsoft SSO, users will sign in
        with their company account; roles stay managed here.
      </p>
    </div>
  );
}
