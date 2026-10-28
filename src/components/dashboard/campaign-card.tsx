import Link from "next/link";
import { formatDateRange, formatEuroCents } from "@/lib/dates";
import { EXECUTION_TYPE_LABELS, FUNNEL_STAGES, FUNNEL_STAGE_LABELS, type ExecutionType } from "@/lib/domain/enums";
import type { CampaignSummary } from "@/lib/dashboard";
import { MarketBadge, PhaseBadge, ProgressBar, StageDot, TrafficLightBadge } from "@/components/status-badges";
import { CompareToggle } from "@/components/dashboard/compare";

export function CampaignCard({ summary }: { summary: CampaignSummary }) {
  const { campaign, rollup, markets, dueSoonCount } = summary;
  const brandLine = [campaign.brand, campaign.productLine].filter(Boolean).join(" · ");

  return (
    <li className="relative flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-sm transition-shadow focus-within:ring-2 focus-within:ring-ring hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold leading-tight">
            <Link href={`/campaigns/${campaign.slug}`} className="outline-none after:absolute after:inset-0">
              {campaign.name}
            </Link>
          </h3>
          {brandLine && <p className="mt-0.5 truncate text-xs text-muted-foreground">{brandLine}</p>}
        </div>
        <PhaseBadge value={rollup.campaign.phase} />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {markets.map((m) => (
          <MarketBadge key={m} market={m} />
        ))}
        <span className="ml-auto">
          <TrafficLightBadge value={rollup.campaign.trafficLight} />
        </span>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Period</dt>
        <dd>{formatDateRange(campaign.startDate, campaign.endDate)}</dd>
        <dt className="text-muted-foreground">Owner</dt>
        <dd>{campaign.owner.name}</dd>
        <dt className="text-muted-foreground">Execution</dt>
        <dd>{EXECUTION_TYPE_LABELS[campaign.executionType as ExecutionType] ?? campaign.executionType}</dd>
        <dt className="text-muted-foreground">Budget</dt>
        <dd>{formatEuroCents(campaign.budgetCents)}</dd>
      </dl>

      <ProgressBar progress={rollup.campaign.progress} />

      <ul className="space-y-1 border-t pt-3 text-sm">
        {FUNNEL_STAGES.map((stage) => {
          const s = rollup.stages[stage];
          return (
            <li key={stage} className="flex items-center gap-2">
              <StageDot stage={stage} />
              <span className="flex-1">{FUNNEL_STAGE_LABELS[stage]}</span>
              <span className="tabular-nums text-muted-foreground">
                {s.progress.done}/{s.progress.total}
              </span>
              <TrafficLightBadge value={s.trafficLight} className="w-20 text-xs" />
            </li>
          );
        })}
      </ul>

      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-3 text-sm">
        {rollup.campaign.overdueCount > 0 && (
          <span className="font-medium text-status-red">{rollup.campaign.overdueCount} overdue</span>
        )}
        {dueSoonCount > 0 && <span className="font-medium text-status-yellow">{dueSoonCount} due soon</span>}
        {rollup.campaign.overdueCount === 0 && dueSoonCount === 0 && (
          <span className="text-muted-foreground">No open deadlines</span>
        )}
        <span className="ml-auto">
          <CompareToggle slug={campaign.slug} name={campaign.name} />
        </span>
      </div>
    </li>
  );
}
