// Campaign-level KPIs: targets of all channels and imported values combined per
// KPI name, a pace-based traffic light, the three headline KPIs of the
// performance tab and the stage-to-stage flow of the funnel view. Pure functions.

import { statusConfig, type StatusConfig } from "@/lib/config";
import { toDayNumber } from "@/lib/dates";
import { FUNNEL_STAGES, type FunnelStage, type TrafficLight } from "@/lib/domain/enums";
import { aggregationFor, lowerIsBetter, type Aggregation } from "@/lib/kpi-import/actuals";
import { parseKpiTargets, parseStringList } from "@/lib/validation";

export interface KpiCampaignInput {
  startDate: Date;
  endDate: Date;
  channels: readonly {
    id: string;
    funnelStage: string;
    startDate: Date | null;
    endDate: Date | null;
    kpiTargets: unknown;
  }[];
}

export interface KpiValueInput {
  channelId: string | null;
  kpiName: string;
  value: number;
  date: Date | null;
}

export interface KpiPoint {
  /** Day (00:00 UTC of the calendar day). */
  date: Date;
  value: number;
}

export interface CampaignKpi {
  kpiName: string;
  /** Funnel stage of the channels that target this KPI (or report it). */
  stage: FunnelStage | null;
  aggregation: Aggregation;
  lowerIsBetter: boolean;
  /** Sum of the channel targets (average for rates), null without target. */
  target: number | null;
  /** Sum of all imported values (average for rates), null without values. */
  actual: number | null;
  valueCount: number;
  /** Period the target refers to: the channels' periods, else the campaign period. */
  period: { start: Date; end: Date };
  /** Dated values per day: summed (or averaged for rates), oldest first. */
  series: KpiPoint[];
}

const MS_PER_DAY = 86_400_000;
const kpiKey = (name: string) => name.trim().toLocaleLowerCase("en-GB");
const stageIndex = (stage: string) => FUNNEL_STAGES.indexOf(stage as FunnelStage);
const average = (list: number[]) => list.reduce((a, b) => a + b, 0) / list.length;
const combine = (aggregation: Aggregation, list: number[]) =>
  aggregation === "sum" ? list.reduce((a, b) => a + b, 0) : average(list);

/** All KPIs of a campaign (with a target or with values), in funnel order. */
export function campaignKpis(
  campaign: KpiCampaignInput,
  values: readonly KpiValueInput[],
  config: StatusConfig = statusConfig,
): CampaignKpi[] {
  const channels = [...campaign.channels].sort((a, b) => stageIndex(a.funnelStage) - stageIndex(b.funnelStage));
  const channelById = new Map(channels.map((c) => [c.id, c]));
  const entries = new Map<
    string,
    { name: string; targets: number[]; channelIds: string[]; values: KpiValueInput[]; order: number }
  >();
  let order = 0;
  const entry = (name: string) => {
    const key = kpiKey(name);
    let e = entries.get(key);
    if (!e) {
      e = { name: name.trim(), targets: [], channelIds: [], values: [], order: order++ };
      entries.set(key, e);
    }
    return e;
  };

  for (const channel of channels) {
    for (const [name, target] of Object.entries(parseKpiTargets(channel.kpiTargets))) {
      const e = entry(name);
      e.targets.push(target);
      e.channelIds.push(channel.id);
    }
  }
  for (const v of values) entry(v.kpiName).values.push(v);

  const day = (d: Date) => toDayNumber(d, config.timeZone);
  return [...entries.values()]
    .map((e): CampaignKpi => {
      const aggregation = aggregationFor(e.name);
      const targetChannels = e.channelIds.map((id) => channelById.get(id)!);
      const valueChannels = e.values
        .map((v) => (v.channelId ? channelById.get(v.channelId) : undefined))
        .filter((c) => !!c);
      const stageChannel = targetChannels[0] ?? valueChannels[0];

      const starts = targetChannels.map((c) => c.startDate ?? campaign.startDate);
      const ends = targetChannels.map((c) => c.endDate ?? campaign.endDate);
      const period =
        targetChannels.length > 0
          ? {
              start: new Date(Math.min(...starts.map((d) => d.getTime()))),
              end: new Date(Math.max(...ends.map((d) => d.getTime()))),
            }
          : { start: campaign.startDate, end: campaign.endDate };

      const byDay = new Map<number, number[]>();
      for (const v of e.values) {
        if (!v.date) continue;
        const n = day(v.date);
        byDay.set(n, [...(byDay.get(n) ?? []), v.value]);
      }
      const series = [...byDay.entries()]
        .sort(([a], [b]) => a - b)
        .map(([n, list]) => ({ date: new Date(n * MS_PER_DAY), value: combine(aggregation, list) }));

      return {
        kpiName: e.name,
        stage: stageChannel ? (stageChannel.funnelStage as FunnelStage) : null,
        aggregation,
        lowerIsBetter: lowerIsBetter(e.name),
        target: e.targets.length > 0 ? combine(aggregation, e.targets) : null,
        actual:
          e.values.length > 0
            ? combine(
                aggregation,
                e.values.map((v) => v.value),
              )
            : null,
        valueCount: e.values.length,
        period,
        series,
      };
    })
    .sort(
      (a, b) =>
        (a.stage ? stageIndex(a.stage) : 9) - (b.stage ? stageIndex(b.stage) : 9) ||
        entries.get(kpiKey(a.kpiName))!.order - entries.get(kpiKey(b.kpiName))!.order,
    );
}

// ---------------------------------------------------------------------------
// Pace and traffic light

export interface KpiPace {
  state: "no-target" | "no-data" | "not-started" | "rated";
  /** Value expected by the reference day: the target share of the elapsed period for counts, the target for rates. */
  expected: number | null;
  /** Actual relative to expected (inverted for cost KPIs): 1 = on plan. */
  ratio: number | null;
  /** Elapsed share of the KPI period (0–1) at the reference day. */
  elapsed: number;
  /** Reference day: the latest day with data (reports lag behind), else today. */
  asOf: Date;
  light: TrafficLight | null;
  /** Achievement of the full target (1 = target reached), inverted for cost KPIs. */
  achievement: number | null;
}

export function lightForRatio(ratio: number, config: StatusConfig = statusConfig): TrafficLight {
  if (ratio >= config.kpiGreenAt) return "GREEN";
  if (ratio >= config.kpiYellowAt) return "YELLOW";
  return "RED";
}

/**
 * Rates a KPI against its plan. Counts (impressions, sessions, …) are expected
 * to grow linearly over the KPI period, so mid-campaign they are compared with
 * the pro-rata target. Rates and averages are compared with the target itself.
 */
export function kpiPace(kpi: CampaignKpi, now: Date, config: StatusConfig = statusConfig): KpiPace {
  const day = (d: Date) => toDayNumber(d, config.timeZone);
  const lastData = kpi.series.at(-1)?.date ?? null;
  const asOf = lastData ?? now;
  const span = day(kpi.period.end) - day(kpi.period.start) + 1;
  const elapsed = Math.min(1, Math.max(0, (day(asOf) - day(kpi.period.start) + 1) / span));
  const base = { elapsed, asOf, expected: null, ratio: null, light: null, achievement: null };

  if (kpi.target == null) return { ...base, state: "no-target" };
  if (kpi.actual == null) return { ...base, state: "no-data" };
  const relative = (actual: number, wanted: number) =>
    kpi.lowerIsBetter ? (actual === 0 ? null : wanted / actual) : wanted === 0 ? null : actual / wanted;
  const achievement = relative(kpi.actual, kpi.target);

  if (kpi.aggregation === "avg") {
    const ratio = relative(kpi.actual, kpi.target);
    return {
      ...base,
      state: "rated",
      expected: kpi.target,
      ratio,
      achievement,
      light: ratio == null ? null : lightForRatio(ratio, config),
    };
  }
  if (elapsed <= 0) return { ...base, state: "not-started", achievement };
  const expected = kpi.target * elapsed;
  const ratio = relative(kpi.actual, expected);
  return {
    ...base,
    state: "rated",
    expected,
    ratio,
    achievement,
    light: ratio == null ? null : lightForRatio(ratio, config),
  };
}

// ---------------------------------------------------------------------------
// Headline KPIs

export const HEADLINE_COUNT = 3;

/** Money amounts (revenue, budget, spend) are not volumes of people or actions. */
const MONEY_KPI = /(revenue|umsatz|turnover|sales value|budget|spend|€|eur\b)/i;

/** The main volume KPI of a list: the count KPI with the largest target (else the largest actual). */
export function leadKpi(kpis: readonly CampaignKpi[]): CampaignKpi | null {
  const counts = kpis.filter((k) => k.aggregation === "sum" && !k.lowerIsBetter && !MONEY_KPI.test(k.kpiName));
  const withTarget = counts.filter((k) => k.target != null);
  if (withTarget.length > 0) return withTarget.reduce((a, b) => (b.target! > a.target! ? b : a));
  const withActual = counts.filter((k) => k.actual != null);
  if (withActual.length > 0) return withActual.reduce((a, b) => (b.actual! > a.actual! ? b : a));
  return null;
}

/** Default headline KPIs: the lead KPI of each funnel stage, filled up with further KPIs that have a target. */
export function defaultHeadlineKpis(kpis: readonly CampaignKpi[]): CampaignKpi[] {
  const chosen: CampaignKpi[] = [];
  for (const stage of FUNNEL_STAGES) {
    const lead = leadKpi(kpis.filter((k) => k.stage === stage));
    if (lead) chosen.push(lead);
  }
  const rest = [...kpis.filter((k) => k.target != null), ...kpis.filter((k) => k.target == null)];
  for (const kpi of rest) {
    if (chosen.length >= HEADLINE_COUNT) break;
    if (!chosen.includes(kpi)) chosen.push(kpi);
  }
  return chosen.slice(0, HEADLINE_COUNT);
}

/** Headline KPIs: the stored choice (names that still exist), else the default. */
export function resolveHeadlineKpis(
  stored: unknown,
  kpis: readonly CampaignKpi[],
): { kpis: CampaignKpi[]; custom: boolean } {
  const byKey = new Map(kpis.map((k) => [kpiKey(k.kpiName), k]));
  const picked = [...new Set(parseStringList(stored).map(kpiKey))]
    .map((key) => byKey.get(key))
    .filter((k): k is CampaignKpi => !!k)
    .slice(0, HEADLINE_COUNT);
  return picked.length > 0 ? { kpis: picked, custom: true } : { kpis: defaultHeadlineKpis(kpis), custom: false };
}

// ---------------------------------------------------------------------------
// Funnel flow

export interface StageFlow {
  stage: FunnelStage;
  kpis: CampaignKpi[];
  lead: CampaignKpi | null;
}

export interface StageConversion {
  from: FunnelStage;
  to: FunnelStage;
  /** Lead KPI of the next stage relative to the lead KPI of the previous stage. */
  actualRate: number | null;
  targetRate: number | null;
}

/** Lead KPI per stage and how each stage converts into the next (e.g. sessions per impression). */
export function stageFlow(kpis: readonly CampaignKpi[]): { stages: StageFlow[]; conversions: StageConversion[] } {
  const stages = FUNNEL_STAGES.map((stage) => {
    const own = kpis.filter((k) => k.stage === stage);
    return { stage, kpis: own, lead: leadKpi(own) };
  });
  const rate = (to: number | null | undefined, from: number | null | undefined) =>
    to != null && from != null && from > 0 ? to / from : null;
  const conversions = stages.slice(1).map((next, i) => {
    const prev = stages[i];
    return {
      from: prev.stage,
      to: next.stage,
      actualRate: rate(next.lead?.actual, prev.lead?.actual),
      targetRate: rate(next.lead?.target, prev.lead?.target),
    };
  });
  return { stages, conversions };
}
