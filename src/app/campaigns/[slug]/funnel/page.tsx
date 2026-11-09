import { notFound } from "next/navigation";
import { ArrowRight, ExternalLink } from "lucide-react";
import { getCampaignBySlug, getCampaignReports } from "@/lib/queries";
import { formatDate, formatDateRange } from "@/lib/dates";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  ASSET_STATUS_LABELS,
  FUNNEL_STAGES,
  FUNNEL_STAGE_LABELS,
  type AssetStatus,
  type FunnelStage,
  type TrafficLight,
} from "@/lib/domain/enums";
import { isDueSoonAndBehind, isOverdue, rollupCampaign, summarizeAssets } from "@/lib/status";
import { campaignKpis, kpiPace, lightForRatio, stageFlow, type CampaignKpi, type StageConversion } from "@/lib/kpi";
import { ProgressBar, TrafficLightBadge } from "@/components/status-badges";
import { STAGE_STYLES } from "@/components/stage-styles";
import { KPI_LIGHT } from "@/components/performance/headline-kpis";
import { LinkIcon } from "@/components/links/link-icon";
import { LINK_TYPE_LABELS } from "@/lib/links";

/** Funnel shape: inset of each stage's left and right edge in % (wide → narrow). */
const EDGES = [0, 10, 20, 28];

function clipFor(index: number) {
  const [a, b] = [EDGES[index], EDGES[index + 1]];
  return {
    // Desktop: stages left to right, narrowing to the right. Mobile: top to bottom.
    "--clip-h": `polygon(0 ${a}%, 100% ${b}%, 100% ${100 - b}%, 0 ${100 - a}%)`,
    "--clip-v": `polygon(${a}% 0, ${100 - a}% 0, ${100 - b}% 100%, ${b}% 100%)`,
  } as React.CSSProperties;
}

function percent(rate: number) {
  return `${formatNumber(rate * 100, rate < 0.1 ? 2 : 1)} %`;
}

function KpiLine({ kpi, now }: { kpi: CampaignKpi; now: Date }) {
  const pace = kpiPace(kpi, now);
  const light = pace.light ? KPI_LIGHT[pace.light] : null;
  const bar = pace.achievement != null ? Math.min(pace.achievement, 1) : 0;
  const isAvg = kpi.aggregation === "avg";
  return (
    <li className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="truncate">{kpi.kpiName}</span>
        <span className="shrink-0 tabular-nums">
          <span className="font-semibold">
            {kpi.actual != null ? `${isAvg ? "avg. " : ""}${formatNumber(kpi.actual, isAvg ? 2 : 0)}` : "–"}
          </span>
          {kpi.target != null && <span className="text-muted-foreground"> / {formatNumber(kpi.target)}</span>}
        </span>
      </div>
      {kpi.target != null && (
        <div className="flex items-center gap-2">
          <div className="relative h-1.5 flex-1 rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full", light?.bar ?? "bg-foreground/40")}
              style={{ width: `${bar * 100}%` }}
            />
            {!isAvg && pace.state === "rated" && (
              <span className="absolute -top-0.5 h-2.5 w-px bg-foreground" style={{ left: `${pace.elapsed * 100}%` }} />
            )}
          </div>
          <span className={cn("w-12 text-right text-xs tabular-nums", light?.text ?? "text-muted-foreground")}>
            {pace.ratio != null ? `${formatNumber(pace.ratio * 100, 0)} %` : "–"}
          </span>
        </div>
      )}
    </li>
  );
}

/** Asset deadline status (not KPI performance), labelled to tell the two apart. */
function DeadlineLight({ value }: { value: TrafficLight }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-xs" title="Status of the asset deadlines">
      <span className="text-muted-foreground">Deadlines</span>
      <TrafficLightBadge value={value} className="text-xs" />
    </span>
  );
}

function ConversionPill({
  conversion,
  from,
  to,
}: {
  conversion: StageConversion;
  from?: CampaignKpi | null;
  to?: CampaignKpi | null;
}) {
  const ratio =
    conversion.actualRate != null && conversion.targetRate != null && conversion.targetRate > 0
      ? conversion.actualRate / conversion.targetRate
      : null;
  const light = ratio != null ? KPI_LIGHT[lightForRatio(ratio)] : null;
  const label = from && to ? `${to.kpiName} per ${from.kpiName.replace(/s$/, "")}` : "Conversion";
  return (
    <div
      className="w-44 rounded-xl border bg-card px-3 py-2 text-center shadow-md"
      title={`${label}: lead KPI of ${FUNNEL_STAGE_LABELS[conversion.to]} relative to ${FUNNEL_STAGE_LABELS[conversion.from]}`}
    >
      <p className="flex items-center justify-center gap-1.5 text-lg font-semibold tabular-nums">
        <ArrowRight className="size-4 text-muted-foreground max-lg:rotate-90" aria-hidden />
        {conversion.actualRate != null ? percent(conversion.actualRate) : "–"}
        {light && <span className={cn("size-2.5 rounded-full", light.dot)} aria-label={light.label} />}
      </p>
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      {conversion.targetRate != null && (
        <p className="text-xs text-muted-foreground">target {percent(conversion.targetRate)}</p>
      )}
    </div>
  );
}

// Funnel view: the three stages one after another as a funnel, how each stage
// converts into the next (lead KPI ratios) and the channels feeding each stage.
export default async function CampaignFunnelPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const campaign = await getCampaignBySlug(slug);
  if (!campaign) notFound();
  const now = new Date();
  const rollup = rollupCampaign(campaign, now);
  const { values } = await getCampaignReports(campaign.id);
  const flow = stageFlow(campaignKpis(campaign, values));

  const channelKpis = (channelId: string) => {
    const channel = campaign.channels.find((c) => c.id === channelId)!;
    return campaignKpis(
      { startDate: campaign.startDate, endDate: campaign.endDate, channels: [channel] },
      values.filter((v) => v.channelId === channelId),
    );
  };

  return (
    <div className="space-y-8">
      {campaign.links.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {campaign.links.map((link) => (
            <li key={link.id}>
              <a
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm hover:bg-muted"
              >
                <LinkIcon type={link.type} className="text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground">
                  {LINK_TYPE_LABELS[link.type as keyof typeof LINK_TYPE_LABELS] ?? link.type}
                </span>
                {link.label ?? link.url}
                <ExternalLink className="size-3.5 text-muted-foreground" />
              </a>
            </li>
          ))}
        </ul>
      )}

      <section aria-labelledby="funnel-title" className="space-y-4">
        <div>
          <h2 id="funnel-title" className="text-xl font-semibold">
            Funnel
          </h2>
          <p className="text-base text-muted-foreground">
            Each stage feeds the next: the main KPI of a stage and how much of it turns into the main KPI of the
            following stage.
          </p>
        </div>

        <ol className="grid lg:grid-cols-3 lg:pb-28" aria-label="Funnel stages">
          {flow.stages.map((stage, index) => {
            const style = STAGE_STYLES[stage.stage];
            const summary = rollup.stages[stage.stage];
            const lead = stage.lead;
            const pace = lead ? kpiPace(lead, now) : null;
            const light = pace?.light ? KPI_LIGHT[pace.light] : null;
            const conversion = flow.conversions[index];
            const channels = campaign.channels.filter((c) => c.funnelStage === stage.stage);
            return (
              <li key={stage.stage} className="relative flex flex-col items-center">
                <div
                  style={clipFor(index)}
                  className={cn(
                    "flex min-h-64 w-full flex-col items-center justify-center px-[14%] py-8 text-center [clip-path:var(--clip-v)] lg:h-80 lg:px-10 lg:py-0 lg:[clip-path:var(--clip-h)]",
                    style.fill,
                  )}
                >
                  <div className="space-y-1.5">
                    <p className={cn("text-sm font-bold uppercase tracking-wider", style.text)}>
                      {index + 1}. {FUNNEL_STAGE_LABELS[stage.stage]}
                    </p>
                    {lead ? (
                      <>
                        <p className="text-sm text-muted-foreground">{lead.kpiName}</p>
                        <p className="text-3xl font-semibold tabular-nums">
                          {lead.actual != null ? formatNumber(lead.actual, 0) : "–"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {lead.target != null ? <>target {formatNumber(lead.target)}</> : "no target"}
                        </p>
                        {light && pace?.ratio != null && (
                          <p className={cn("inline-flex items-center gap-1.5 text-sm font-semibold", light.text)}>
                            <span className={cn("size-2.5 rounded-full", light.dot)} aria-hidden />
                            {light.label} · {formatNumber(pace.ratio * 100, 0)} % of plan
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">No count KPI in this stage</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {channels.length === 1 ? "1 channel" : `${channels.length} channels`} · assets{" "}
                      {summary.progress.done}/{summary.progress.total}
                    </p>
                  </div>
                </div>
                {conversion && (
                  <div className="relative z-10 -my-3 flex flex-col items-center lg:absolute lg:right-0 lg:top-full lg:my-0 lg:translate-x-1/2">
                    <span className="hidden h-4 w-px bg-border lg:block" aria-hidden />
                    <ConversionPill conversion={conversion} from={stage.lead} to={flow.stages[index + 1]?.lead} />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      <section aria-labelledby="channels-title" className="space-y-4">
        <h2 id="channels-title" className="text-lg font-semibold">
          What feeds each stage
        </h2>
        <div className="grid gap-4 lg:grid-cols-3">
          {FUNNEL_STAGES.map((stage: FunnelStage) => {
            const channels = campaign.channels.filter((c) => c.funnelStage === stage);
            const summary = rollup.stages[stage];
            return (
              <section
                key={stage}
                aria-label={FUNNEL_STAGE_LABELS[stage]}
                className="space-y-3 rounded-2xl border border-t-4 bg-card p-4"
                style={{ borderTopColor: `var(--stage-${stage.toLowerCase()})` }}
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className={cn("font-semibold", STAGE_STYLES[stage].text)}>{FUNNEL_STAGE_LABELS[stage]}</h3>
                  <DeadlineLight value={summary.trafficLight} />
                </div>
                {channels.length === 0 && <p className="text-sm text-muted-foreground">No channels in this stage.</p>}
                {channels.map((channel) => {
                  const channelSummary = summarizeAssets(channel.assets, now);
                  const kpis = channelKpis(channel.id);
                  return (
                    <article key={channel.id} className="space-y-3 rounded-xl border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h4 className="font-medium leading-tight">{channel.name}</h4>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {channel.owner?.name ?? "No owner"}
                            {(channel.startDate || channel.endDate) &&
                              ` · ${formatDateRange(channel.startDate, channel.endDate)}`}
                          </p>
                        </div>
                        <DeadlineLight value={channelSummary.trafficLight} />
                      </div>
                      {kpis.length > 0 && (
                        <ul className="space-y-2.5">
                          {kpis.map((kpi) => (
                            <KpiLine key={kpi.kpiName} kpi={kpi} now={now} />
                          ))}
                        </ul>
                      )}
                      {channel.assets.length > 0 && (
                        <details className="group border-t pt-2">
                          <summary className="cursor-pointer list-none text-sm text-muted-foreground hover:text-foreground">
                            <ProgressBar progress={channelSummary.progress} />
                            <span className="mt-1 block text-xs">Show {channel.assets.length} assets</span>
                          </summary>
                          <ul className="mt-2 divide-y text-sm">
                            {channel.assets.map((asset) => {
                              const overdue = isOverdue(asset, now);
                              const dueSoon = !overdue && isDueSoonAndBehind(asset, now);
                              return (
                                <li key={asset.id} className="flex items-center gap-2 py-1.5">
                                  <span className="min-w-0 flex-1 truncate" title={asset.title}>
                                    {asset.title}
                                  </span>
                                  {asset.dueDate && (
                                    <span
                                      className={cn(
                                        "shrink-0 text-xs tabular-nums",
                                        overdue
                                          ? "font-semibold text-status-red"
                                          : dueSoon
                                            ? "font-medium text-status-yellow"
                                            : "text-muted-foreground",
                                      )}
                                    >
                                      {formatDate(asset.dueDate)}
                                    </span>
                                  )}
                                  <span className="shrink-0 rounded-md bg-secondary px-1.5 py-0.5 text-xs">
                                    {ASSET_STATUS_LABELS[asset.status as AssetStatus] ?? asset.status}
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        </details>
                      )}
                    </article>
                  );
                })}
              </section>
            );
          })}
        </div>
      </section>
    </div>
  );
}
