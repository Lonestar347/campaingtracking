import Link from "next/link";
import { Plus } from "lucide-react";
import { can, getCurrentUser } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { getAllCreatives, getDashboardCampaigns } from "@/lib/queries";
import {
  creativeImageUrl,
  creativeKpiOptions,
  creativeKpis,
  pickCover,
  rankCreatives,
  resolveRankingKpi,
} from "@/lib/creatives";
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
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { TopCreatives, type TopCreative } from "@/components/dashboard/top-creatives";

export const dynamic = "force-dynamic";

function Stat({ label, value, tone, href }: { label: string; value: number; tone?: "red" | "yellow"; href?: string }) {
  const content = (
    <>
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-4xl font-semibold tabular-nums",
          tone === "red" && value > 0 && "text-status-red",
          tone === "yellow" && value > 0 && "text-status-yellow",
        )}
      >
        {value}
      </p>
    </>
  );
  const className = "block rounded-2xl border bg-card px-5 py-4";
  return href ? (
    <a href={href} className={cn(className, "transition-colors hover:bg-muted/50")}>
      {content}
    </a>
  ) : (
    <div className={className}>{content}</div>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const [campaigns, creatives, user] = await Promise.all([
    getDashboardCampaigns(),
    getAllCreatives(),
    getCurrentUser(),
  ]);
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

  // Campaign images and top creatives (only of the campaigns shown).
  const coverUrl = new Map<string, string>();
  for (const campaign of campaigns) {
    const cover = pickCover(creatives.filter((c) => c.campaignId === campaign.id));
    if (cover) coverUrl.set(campaign.id, creativeImageUrl(cover));
  }
  const visibleCampaigns = new Map(visible.map((s) => [s.campaign.id, s.campaign]));
  const topCandidates: TopCreative[] = creatives
    .filter((c) => visibleCampaigns.has(c.campaignId))
    .map((c) => ({
      id: c.id,
      title: c.title,
      kpis: creativeKpis(c.kpiValues, c.importedValues),
      imageUrl: c.imageKey ? creativeImageUrl(c) : null,
      campaignName: visibleCampaigns.get(c.campaignId)!.name,
      campaignSlug: visibleCampaigns.get(c.campaignId)!.slug,
      channelName: c.channel?.name ?? null,
    }));
  const kpiOptions = creativeKpiOptions(topCandidates).slice(0, 8);
  const rankingKpi = resolveRankingKpi(typeof params.kpi === "string" ? params.kpi : undefined, kpiOptions);
  const ranked = rankingKpi ? rankCreatives(topCandidates, rankingKpi, 4) : [];
  const hrefForKpi = (kpi: string) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      for (const v of Array.isArray(value) ? value : value ? [value] : []) query.append(key, v);
    }
    query.set("kpi", kpi);
    return `/?${query}#top-creatives`;
  };

  return (
    <CompareProvider>
      <div className="space-y-8 pb-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
            <p className="mt-1 text-base text-muted-foreground">
              {filtered
                ? `${visible.length} of ${all.length} campaigns match the filters.`
                : "All campaigns at a glance."}
            </p>
          </div>
          {canCreate && (
            <Link href="/campaigns/new" className={buttonVariants({ variant: "accent", size: "lg" })}>
              <Plus /> New campaign
            </Link>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Campaigns" value={stats.campaigns} />
          <Stat label="Live" value={stats.live} />
          <Stat label="Overdue assets" value={stats.overdueAssets} tone="red" href="#critical" />
          <Stat label="Due soon" value={stats.dueSoonAssets} tone="yellow" href="#critical" />
        </div>

        <FilterBar filters={filters} sort={sort} options={filterOptions(campaigns)} />

        <section aria-label="Campaigns">
          {all.length === 0 ? (
            <p className="rounded-2xl border bg-card p-6 text-base text-muted-foreground">
              No campaigns yet. Create one via the launch charter or load sample data with <code>npm run db:seed</code>.
            </p>
          ) : visible.length === 0 ? (
            <div className="rounded-2xl border bg-card p-6 text-base">
              <p className="font-medium">No campaign matches the filters.</p>
              <Link href="/" className="mt-2 inline-block text-muted-foreground underline underline-offset-2">
                Reset filters
              </Link>
            </div>
          ) : (
            <ul className="grid gap-6 md:grid-cols-2">
              {visible.map((summary) => (
                <CampaignCard
                  key={summary.campaign.id}
                  summary={summary}
                  imageUrl={coverUrl.get(summary.campaign.id) ?? null}
                />
              ))}
            </ul>
          )}
        </section>

        <TopCreatives ranked={ranked} kpi={rankingKpi} kpiOptions={kpiOptions} hrefForKpi={hrefForKpi} />

        <div className="grid items-start gap-6 lg:grid-cols-2">
          <div id="critical" className="scroll-mt-4">
            <CriticalList overdue={overdueAssets(visible, now)} dueSoon={dueSoonAssets(visible, now)} />
            {filtered && (
              <p className="mt-2 px-1 text-sm text-muted-foreground">Only includes the filtered campaigns.</p>
            )}
          </div>
          <RecentActivity />
        </div>
      </div>
    </CompareProvider>
  );
}
