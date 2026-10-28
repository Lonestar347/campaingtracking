import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCampaignBySlug } from "@/lib/queries";
import { formatDate, formatDateRange, formatEuroCents } from "@/lib/dates";
import { EXECUTION_TYPE_LABELS, FUNNEL_STAGES, FUNNEL_STAGE_LABELS, type ExecutionType } from "@/lib/domain/enums";
import { buildTimeline, parseCompareSlugs, summarizeCampaigns } from "@/lib/dashboard";
import { launchCharterDataSchema, parseStringList } from "@/lib/validation";
import {
  MarketBadge,
  PhaseBadge,
  ProgressBar,
  StageDot,
  TrafficLightBadge,
} from "@/components/status-badges";
import { STAGE_STYLES } from "@/components/stage-styles";

export const metadata = { title: "Compare campaigns · Campaign Tracker" };
export const dynamic = "force-dynamic";

const BAR_COLORS = ["bg-foreground/70", "bg-josera-gold", "bg-stage-awareness", "bg-stage-sales"];

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const slugs = parseCompareSlugs(await searchParams);
  const campaigns = (await Promise.all(slugs.map((slug) => getCampaignBySlug(slug)))).filter(
    (c): c is NonNullable<typeof c> => c != null,
  );
  const now = new Date();

  const back = (
    <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground print:hidden">
      <ChevronLeft className="size-4" /> Dashboard
    </Link>
  );

  if (campaigns.length < 2) {
    return (
      <div className="space-y-4">
        {back}
        <h1 className="text-2xl font-semibold tracking-tight">Compare campaigns</h1>
        <p className="text-sm text-muted-foreground">
          Select at least two campaigns via “Compare” on the dashboard.
        </p>
      </div>
    );
  }

  const summaries = summarizeCampaigns(campaigns, now);
  const timeline = buildTimeline(campaigns, now)!;
  const charters = campaigns.map((c) => {
    const parsed = launchCharterDataSchema.safeParse(c.charter?.data);
    return parsed.success ? parsed.data : null;
  });
  const cols = { gridTemplateColumns: `11rem repeat(${campaigns.length}, minmax(13rem, 1fr))` };

  const Row = ({ label, children, className }: { label: React.ReactNode; children: React.ReactNode[]; className?: string }) => (
    <div className={cn("contents", className)}>
      <div className="border-t py-2.5 pr-3 text-sm text-muted-foreground">{label}</div>
      {children.map((child, i) => (
        <div key={i} className="border-t px-3 py-2.5 text-sm">
          {child}
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      {back}
      <h1 className="text-2xl font-semibold tracking-tight">Compare campaigns</h1>

      <section aria-labelledby="timeline-title" className="rounded-xl border bg-card p-4">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h2 id="timeline-title" className="font-semibold">
            Period
          </h2>
          <span className="text-xs text-muted-foreground">{formatDateRange(timeline.start, timeline.end)}</span>
        </div>
        <div className="relative space-y-2">
          {timeline.today != null && (
            <div
              className="pointer-events-none absolute inset-y-0 z-10 w-px bg-status-red"
              style={{ left: `calc(10rem + (100% - 10rem) * ${timeline.today / 100})` }}
              title={`Today, ${formatDate(now)}`}
            />
          )}
          {campaigns.map((c, i) => (
            <div key={c.id} className="grid grid-cols-[10rem_1fr] items-center gap-0 text-sm">
              <span className="truncate pr-3">{c.name}</span>
              <div className="relative h-6 rounded bg-muted">
                <div
                  className={cn("absolute inset-y-0 rounded", BAR_COLORS[i % BAR_COLORS.length])}
                  style={{ left: `${timeline.bars[i].left}%`, width: `${timeline.bars[i].width}%` }}
                  title={formatDateRange(c.startDate, c.endDate)}
                />
              </div>
            </div>
          ))}
        </div>
        {timeline.today != null && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-3 w-px bg-status-red" /> Today
          </p>
        )}
      </section>

      <div className="overflow-x-auto rounded-xl border bg-card px-4 pb-2">
        <div className="grid min-w-fit" style={cols}>
          <div className="py-3" />
          {summaries.map(({ campaign, rollup, markets }) => (
            <div key={campaign.id} className="space-y-1.5 px-3 py-3">
              <Link href={`/campaigns/${campaign.slug}`} className="font-semibold leading-tight hover:underline">
                {campaign.name}
              </Link>
              <div className="flex flex-wrap items-center gap-1.5">
                <PhaseBadge value={rollup.campaign.phase} />
                <TrafficLightBadge value={rollup.campaign.trafficLight} className="text-xs" />
              </div>
              <div className="flex gap-1">
                {markets.map((m) => (
                  <MarketBadge key={m} market={m} />
                ))}
              </div>
            </div>
          ))}

          <Row label="Period">{campaigns.map((c) => formatDateRange(c.startDate, c.endDate))}</Row>
          <Row label="Owner">{campaigns.map((c) => c.owner.name)}</Row>
          <Row label="Brand / product line">
            {campaigns.map((c) => [c.brand, c.productLine].filter(Boolean).join(" / ") || "–")}
          </Row>
          <Row label="Execution">
            {campaigns.map((c) => EXECUTION_TYPE_LABELS[c.executionType as ExecutionType] ?? c.executionType)}
          </Row>
          <Row label="Partners">{campaigns.map((c) => parseStringList(c.partners).join(", ") || "–")}</Row>
          <Row label="Objective">{campaigns.map((c) => c.objective ?? "–")}</Row>
          <Row label="Budget">{campaigns.map((c) => formatEuroCents(c.budgetCents))}</Row>
          {FUNNEL_STAGES.map((stage) => (
            <Row
              key={`budget-${stage}`}
              label={
                <span className="flex items-center gap-2 pl-3">
                  <StageDot stage={stage} /> {FUNNEL_STAGE_LABELS[stage]}
                </span>
              }
            >
              {charters.map((data) => {
                const cents = data?.budget.byFunnelStageCents?.[stage];
                return cents != null ? formatEuroCents(cents) : <span className="text-muted-foreground">–</span>;
              })}
            </Row>
          ))}
          <Row label="Progress">
            {summaries.map((s) => (
              <ProgressBar key={s.campaign.id} progress={s.rollup.campaign.progress} />
            ))}
          </Row>
          {FUNNEL_STAGES.map((stage) => (
            <Row
              key={`stage-${stage}`}
              label={<span className={cn("font-medium", STAGE_STYLES[stage].text)}>{FUNNEL_STAGE_LABELS[stage]}</span>}
            >
              {summaries.map(({ campaign, rollup }) => {
                const channels = campaign.channels.filter((c) => c.funnelStage === stage);
                const s = rollup.stages[stage];
                return (
                  <div key={campaign.id} className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="tabular-nums">
                        {s.progress.done}/{s.progress.total} assets
                      </span>
                      <TrafficLightBadge value={s.trafficLight} className="text-xs" />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {channels.length === 0 ? "No channels" : channels.map((c) => c.name).join(", ")}
                    </p>
                  </div>
                );
              })}
            </Row>
          ))}
          <Row label="Overdue">
            {summaries.map((s) => (
              <span key={s.campaign.id} className={cn("tabular-nums", s.rollup.campaign.overdueCount > 0 && "font-semibold text-status-red")}>
                {s.rollup.campaign.overdueCount}
              </span>
            ))}
          </Row>
          <Row label="Due soon">
            {summaries.map((s) => (
              <span key={s.campaign.id} className={cn("tabular-nums", s.dueSoonCount > 0 && "font-medium text-status-yellow")}>
                {s.dueSoonCount}
              </span>
            ))}
          </Row>
        </div>
      </div>
    </div>
  );
}
