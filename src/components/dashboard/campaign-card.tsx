import Link from "next/link";
import { CalendarDays, ImageIcon, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateRange } from "@/lib/dates";
import { CAMPAIGN_PHASE_LABELS, FUNNEL_STAGES, FUNNEL_STAGE_LABELS, type TrafficLight } from "@/lib/domain/enums";
import type { CampaignSummary } from "@/lib/dashboard";
import { MarketBadge, StageDot } from "@/components/status-badges";
import { CompareToggle } from "@/components/dashboard/compare";

const LIGHT: Record<TrafficLight, { dot: string; label: string }> = {
  RED: { dot: "bg-status-red", label: "Critical" },
  YELLOW: { dot: "bg-status-yellow", label: "At risk" },
  GREEN: { dot: "bg-status-green", label: "On track" },
};

/** Large campaign tile: campaign image (from its creatives), status, period and progress. */
export function CampaignCard({ summary, imageUrl }: { summary: CampaignSummary; imageUrl: string | null }) {
  const { campaign, rollup, markets, dueSoonCount } = summary;
  const brandLine = [campaign.brand, campaign.productLine].filter(Boolean).join(" · ");
  const light = LIGHT[rollup.campaign.trafficLight];
  const progress = rollup.campaign.progress;

  return (
    <li className="relative flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-shadow focus-within:ring-2 focus-within:ring-ring hover:shadow-md">
      <div className="relative aspect-[2/1] bg-muted">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- served by our own API route
          <img src={imageUrl} alt="" className="absolute inset-0 size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center bg-gradient-to-br from-josera-gold/25 to-muted text-muted-foreground">
            <ImageIcon className="size-8" aria-hidden />
          </div>
        )}
        <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
          <span className="rounded-full bg-background/90 px-3 py-1 text-sm font-medium shadow-sm backdrop-blur">
            {CAMPAIGN_PHASE_LABELS[rollup.campaign.phase]}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-background/90 px-3 py-1 text-sm font-semibold shadow-sm backdrop-blur">
            <span className={cn("size-2.5 rounded-full", light.dot)} aria-hidden />
            {light.label}
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-5 p-6">
        <div>
          <h3 className="text-xl font-semibold leading-tight">
            <Link href={`/campaigns/${campaign.slug}`} className="outline-none after:absolute after:inset-0">
              {campaign.name}
            </Link>
          </h3>
          {brandLine && <p className="mt-1 text-base text-muted-foreground">{brandLine}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-base">
          <span className="inline-flex items-center gap-2">
            <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
            {formatDateRange(campaign.startDate, campaign.endDate)}
          </span>
          <span className="inline-flex items-center gap-2">
            <UserRound className="size-4 text-muted-foreground" aria-hidden />
            {campaign.owner.name}
          </span>
          <span className="flex gap-1">
            {markets.map((m) => (
              <MarketBadge key={m} market={m} />
            ))}
          </span>
        </div>

        <div>
          <div className="mb-2 flex items-baseline justify-between text-base">
            <span className="text-muted-foreground">Assets done</span>
            <span className="font-semibold tabular-nums">
              {progress.done}/{progress.total}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-foreground/70" style={{ width: `${progress.ratio * 100}%` }} />
          </div>
        </div>

        <ul className="grid grid-cols-3 gap-3 border-t pt-4" aria-label="Funnel stages">
          {FUNNEL_STAGES.map((stage) => {
            const s = rollup.stages[stage];
            const stageLight = LIGHT[s.trafficLight];
            return (
              <li key={stage} className="min-w-0">
                <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground sm:text-sm">
                  <StageDot stage={stage} />
                  {FUNNEL_STAGE_LABELS[stage]}
                </p>
                <p className="mt-0.5 flex items-center gap-2 text-lg font-semibold tabular-nums">
                  {s.progress.done}/{s.progress.total}
                  <span
                    className={cn("size-2 rounded-full", stageLight.dot)}
                    title={stageLight.label}
                    aria-label={stageLight.label}
                  />
                </p>
              </li>
            );
          })}
        </ul>

        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-4 text-base">
          {rollup.campaign.overdueCount > 0 && (
            <span className="font-semibold text-status-red">{rollup.campaign.overdueCount} overdue</span>
          )}
          {dueSoonCount > 0 && <span className="font-semibold text-status-yellow">{dueSoonCount} due soon</span>}
          {rollup.campaign.overdueCount === 0 && dueSoonCount === 0 && (
            <span className="text-muted-foreground">No open deadlines</span>
          )}
          <span className="relative z-10 ml-auto">
            <CompareToggle slug={campaign.slug} name={campaign.name} />
          </span>
        </div>
      </div>
    </li>
  );
}
