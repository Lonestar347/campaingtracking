import type { Metadata } from "next";
import Link from "next/link";
import { authProvider, can, getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import type { UserRole } from "@/lib/domain/enums";
import { MainNav } from "@/components/layout/main-nav";
import { DevUserSwitcher } from "@/components/layout/dev-user-switcher";
import "./globals.css";

export const metadata: Metadata = {
  title: "Campaign Tracker",
  description: "Plan, organise and track marketing campaigns",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();
  const switchable = authProvider().switchable;
  const users = switchable
    ? (await db.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, role: true } })).map((u) => ({
        ...u,
        role: u.role as UserRole,
      }))
    : [];
  const nav = [
    { href: "/", label: "Dashboard" },
    ...(user && can(user.role, "manage") ? [{ href: "/settings/users", label: "Users" }] : []),
  ];

  return (
    <html lang="en">
      <body>
        <header className="border-b-4 border-josera-gold bg-card print:hidden">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <Link href="/" className="flex items-center gap-3">
              <span className="h-6 w-1.5 rounded-full bg-josera-ruby" aria-hidden />
              <span className="text-lg font-semibold tracking-tight">Campaign Tracker</span>
            </Link>
            <MainNav items={nav} />
            <div className="ml-auto">
              {switchable ? (
                <DevUserSwitcher users={users} currentId={user?.id ?? null} />
              ) : (
                user && <span className="text-sm text-muted-foreground">{user.name}</span>
              )}
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8 print:max-w-none print:p-0">{children}</main>
      </body>
    </html>
  );
}
