import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/dates";
import { formatNumber } from "@/lib/format";
import { FUNNEL_STAGE_LABELS, type TrafficLight } from "@/lib/domain/enums";
import type { CampaignKpi, KpiPace } from "@/lib/kpi";
import { STAGE_STYLES } from "@/components/stage-styles";
import { KpiTrendChart, type TrendPoint } from "@/components/performance/kpi-trend-chart";

const MS_PER_DAY = 86_400_000;

export const KPI_LIGHT: Record<TrafficLight, { label: string; dot: string; bar: string; text: string; soft: string }> =
  {
    GREEN: {
      label: "On track",
      dot: "bg-status-green",
      bar: "bg-status-green",
      text: "text-status-green",
      soft: "bg-status-green/10",
    },
    YELLOW: {
      label: "At risk",
      dot: "bg-status-yellow",
      bar: "bg-status-yellow",
      text: "text-status-yellow",
      soft: "bg-status-yellow/10",
    },
    RED: {
      label: "Critical",
      dot: "bg-status-red",
      bar: "bg-status-red",
      text: "text-status-red",
      soft: "bg-status-red/10",
    },
  };

const STATE_LABEL: Record<Exclude<KpiPace["state"], "rated">, string> = {
  "no-target": "No target",
  "no-data": "No data yet",
  "not-started": "Not started",
};

/** Chart points: cumulative actual vs. linear plan (counts) or daily values vs. target (rates). */
export function trendPoints(kpi: CampaignKpi): TrendPoint[] {
  const start = kpi.period.start.getTime();
  const end = kpi.period.end.getTime();
  const span = (end - start) / MS_PER_DAY + 1;
  const planAt = (t: number) =>
    kpi.target == null
      ? null
      : kpi.aggregation === "avg"
        ? kpi.target
        : (kpi.target * ((t - start) / MS_PER_DAY + 1)) / span;

  if (kpi.aggregation === "avg") {
    const points = kpi.series.map((p) => ({ t: p.date.getTime(), actual: p.value, plan: planAt(p.date.getTime()) }));
    return points;
  }
  let sum = 0;
  const actual = kpi.series.map((p) => {
    sum += p.value;
    return { t: p.date.getTime(), actual: sum, plan: planAt(p.date.getTime()) };
  });
  // Plan line from the start to the end of the period.
  const edges = [start, end]
    .filter((t) => !actual.some((p) => p.t === t))
    .map((t) => ({ t, actual: null, plan: planAt(t) }));
  return [...actual, ...edges].sort((a, b) => a.t - b.t);
}

function LightPill({ pace }: { pace: KpiPace }) {
  if (pace.state === "rated" && pace.light) {
    const style = KPI_LIGHT[pace.light];
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-semibold",
          style.soft,
          style.text,
        )}
      >
        <span className={cn("size-2.5 rounded-full", style.dot)} aria-hidden />
        {style.label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-sm font-medium text-muted-foreground">
      <span className="size-2.5 rounded-full bg-muted-foreground/40" aria-hidden />
      {pace.state === "rated" ? "–" : STATE_LABEL[pace.state]}
    </span>
  );
}

export function HeadlineKpiCard({ kpi, pace }: { kpi: CampaignKpi; pace: KpiPace }) {
  const stageStyle = kpi.stage ? STAGE_STYLES[kpi.stage] : null;
  const light = pace.light ? KPI_LIGHT[pace.light] : null;
  const points = trendPoints(kpi);
  const progress = pace.achievement != null ? Math.min(pace.achievement, 1) : 0;
  const isAvg = kpi.aggregation === "avg";

  let explanation: string;
  if (pace.state === "no-target") explanation = "Set a target on a channel to rate this KPI.";
  else if (pace.state === "no-data") explanation = "No values imported yet.";
  else if (pace.state === "not-started") explanation = `The KPI period starts on ${formatDate(kpi.period.start)}.`;
  else if (isAvg)
    explanation = `${formatNumber((pace.ratio ?? 0) * 100, 0)} % of target${kpi.lowerIsBetter ? " (lower is better)" : ""}`;
  else
    explanation = `${formatNumber((pace.ratio ?? 0) * 100, 0)} % of plan · expected by ${formatDate(pace.asOf)}: ${formatNumber(pace.expected, 0)}`;

  return (
    <article
      className="flex flex-col gap-4 rounded-2xl border border-t-4 bg-card p-5 shadow-sm"
      style={kpi.stage ? { borderTopColor: `var(--stage-${kpi.stage.toLowerCase()})` } : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p
            className={cn("text-xs font-semibold uppercase tracking-wide", stageStyle?.text ?? "text-muted-foreground")}
          >
            {kpi.stage ? FUNNEL_STAGE_LABELS[kpi.stage] : "Campaign"}
          </p>
          <h3 className="mt-0.5 truncate text-base font-medium" title={kpi.kpiName}>
            {kpi.kpiName}
          </h3>
        </div>
        <LightPill pace={pace} />
      </div>

      <div>
        <p className="text-4xl font-semibold tabular-nums">
          {kpi.actual != null ? (
            <>
              {isAvg && <span className="mr-1 text-lg font-normal text-muted-foreground">avg.</span>}
              {formatNumber(kpi.actual, isAvg ? 2 : 0)}
            </>
          ) : (
            <span className="text-muted-foreground">–</span>
          )}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {kpi.target != null ? (
            <>
              Target <span className="font-medium text-foreground tabular-nums">{formatNumber(kpi.target)}</span>
              {pace.achievement != null && !isAvg && <> · {formatNumber(pace.achievement * 100, 0)} % reached</>}
            </>
          ) : (
            "No target"
          )}
        </p>
      </div>

      {kpi.target != null && !isAvg && (
        <div className="relative h-2.5 rounded-full bg-muted" role="img" aria-label={explanation}>
          <div
            className={cn("h-full rounded-full", light?.bar ?? "bg-foreground/50")}
            style={{ width: `${progress * 100}%` }}
          />
          {pace.state === "rated" && (
            <span
              className="absolute -top-1 h-4.5 w-0.5 rounded bg-foreground"
              style={{ left: `calc(${pace.elapsed * 100}% - 1px)` }}
              title={`Plan for ${formatDate(pace.asOf)}`}
            />
          )}
        </div>
      )}

      <p className={cn("text-sm", light?.text ?? "text-muted-foreground", light && "font-medium")}>{explanation}</p>

      {points.some((p) => p.actual != null) && (
        <div className="mt-auto">
          <KpiTrendChart
            points={points}
            color={kpi.stage ? `var(--stage-${kpi.stage.toLowerCase()})` : "var(--foreground)"}
            planLabel={isAvg ? "Target" : "Plan"}
          />
          <p className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-0.5 w-4 rounded"
                style={{ background: kpi.stage ? `var(--stage-${kpi.stage.toLowerCase()})` : "var(--foreground)" }}
              />
              {isAvg ? "Daily value" : "Cumulative actual"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0 w-4 border-t-2 border-dashed border-muted-foreground" />
              {isAvg ? "Target" : "Plan (linear)"}
            </span>
          </p>
        </div>
      )}
    </article>
  );
}
