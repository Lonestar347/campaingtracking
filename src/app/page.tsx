import Link from "next/link";
import { Plus } from "lucide-react";
import { can, getCurrentUser } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { getDashboardCampaigns } from "@/lib/queries";
import {
  countActiveFilters,
  dashboardStats,
  dueSoonAssets,
  filterOptions,
  matchesFilters,
  overdueAssets,
  parseFilters,
  parseSort,
  sortSummaries,
  summarizeCampaigns,
} from "@/lib/dashboard";
import { buttonVariants } from "@/components/ui/button";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { CampaignCard } from "@/components/dashboard/campaign-card";
import { CompareProvider } from "@/components/dashboard/compare";
import { CriticalList } from "@/components/dashboard/critical-list";

export const dynamic = "force-dynamic";

function Stat({ label, value, tone }: { label: string; value: number; tone?: "red" | "yellow" }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          "text-2xl font-semibold tabular-nums",
          tone === "red" && value > 0 && "text-status-red",
          tone === "yellow" && value > 0 && "text-status-yellow",
        )}
      >
        {value}
      </p>
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const [campaigns, user] = await Promise.all([getDashboardCampaigns(), getCurrentUser()]);
  const now = new Date();
  const canCreate = !!user && can(user.role, "write");

  const filters = parseFilters(params);
  const sort = parseSort(params);
  const all = summarizeCampaigns(campaigns, now);
  const visible = sortSummaries(
    all.filter((s) => matchesFilters(s, filters)),
    sort,
  );
  const stats = dashboardStats(visible);
  const filtered = countActiveFilters(filters) > 0;

  return (
    <CompareProvider>
      <div className="space-y-6 pb-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              {filtered
                ? `${visible.length} von ${all.length} Kampagnen entsprechen den Filtern.`
                : "Alle Kampagnen mit abgeleitetem Status."}
            </p>
          </div>
          {canCreate && (
            <Link href="/kampagnen/neu" className={buttonVariants({ variant: "accent" })}>
              <Plus /> Neue Kampagne
            </Link>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label="Kampagnen" value={stats.campaigns} />
          <Stat label="Live" value={stats.live} />
          <Stat label="Kritisch (rot)" value={stats.red} tone="red" />
          <Stat label="Überfällige Assets" value={stats.overdueAssets} tone="red" />
          <Stat label="Bald fällig" value={stats.dueSoonAssets} tone="yellow" />
        </div>

        <FilterBar filters={filters} sort={sort} options={filterOptions(campaigns)} />

        <div className="grid items-start gap-6 lg:grid-cols-[1fr_20rem]">
          <section aria-label="Kampagnen">
            {all.length === 0 ? (
              <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
                Noch keine Kampagnen. Neue Kampagne über die Launch Charter anlegen oder Beispieldaten laden mit{" "}
                <code>npm run db:seed</code>.
              </p>
            ) : visible.length === 0 ? (
              <div className="rounded-xl border bg-card p-6 text-sm">
                <p className="font-medium">Keine Kampagne passt zu den Filtern.</p>
                <Link href="/" className="mt-2 inline-block text-muted-foreground underline underline-offset-2">
                  Filter zurücksetzen
                </Link>
              </div>
            ) : (
              <ul className="grid gap-4 md:grid-cols-2">
                {visible.map((summary) => (
                  <CampaignCard key={summary.campaign.id} summary={summary} />
                ))}
              </ul>
            )}
          </section>

          <aside className="lg:sticky lg:top-4">
            <CriticalList overdue={overdueAssets(visible, now)} dueSoon={dueSoonAssets(visible, now)} />
            {filtered && (
              <p className="mt-2 px-1 text-xs text-muted-foreground">Berücksichtigt nur die gefilterten Kampagnen.</p>
            )}
          </aside>
        </div>
      </div>
    </CompareProvider>
  );
}
