// Reverse planning of KPIs: from the sales goal back through the funnel.
//   units sold  = goal (or revenue / average order value)
//   sessions    = units / (consideration → sales rate)
//   impressions = sessions / (awareness → consideration rate)
//   reach       = impressions / frequency (per channel)
// Volumes are split across the channels of each stage by share; media costs
// come from CPM (awareness) and cost per session (consideration). Pure functions.

import { z } from "zod";
import type { FunnelStage } from "@/lib/domain/enums";
import type { BenchmarkValues } from "@/lib/planning/defaults";

/** KPI names the plan writes as channel targets (match the funnel's lead KPIs). */
export const PLAN_KPIS = {
  impressions: "Impressions",
  reach: "Reach",
  sessions: "Sessions",
  units: "Units sold",
  revenue: "Revenue",
} as const;

// ---------------------------------------------------------------------------
// Stored plan inputs (Campaign.reversePlan)

const optionalNumber = z.number().finite().nonnegative().nullable().optional();

export const reversePlanSchema = z.object({
  goalType: z.enum(["units", "revenue"]),
  goalValue: z.number().finite().positive(),
  /** Plan-level overrides; null = derived from the channel benchmarks. */
  avgOrderValue: optionalNumber,
  awarenessToConsideration: optionalNumber,
  considerationToSales: optionalNumber,
  /** Per channel: share within its stage (%) and benchmark overrides. */
  channels: z
    .record(
      z.string(),
      z.object({
        share: z.number().finite().nonnegative().max(100).optional(),
        cpm: optionalNumber,
        frequency: optionalNumber,
        rateToNext: optionalNumber,
        costPerAction: optionalNumber,
        avgOrderValue: optionalNumber,
      }),
    )
    .default({}),
});
export type ReversePlanInput = z.infer<typeof reversePlanSchema>;

export function parseReversePlan(value: unknown): ReversePlanInput | null {
  const parsed = reversePlanSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

// ---------------------------------------------------------------------------
// Calculation

export interface PlanChannel {
  id: string;
  name: string;
  stage: FunnelStage;
  /** Benchmarks of the channel type (master data). */
  benchmark: BenchmarkValues;
}

export interface PlannedChannel {
  id: string;
  name: string;
  stage: FunnelStage;
  /** Normalised share within the stage (0–1). */
  share: number;
  /** Benchmarks used (master data with plan overrides). */
  benchmark: BenchmarkValues;
  /** KPI targets resulting from the plan. */
  kpis: Record<string, number>;
  /** Media cost of the channel in EUR (null if it has no cost benchmark). */
  cost: number | null;
}

export interface ReversePlanResult {
  units: number | null;
  revenue: number | null;
  sessions: number | null;
  impressions: number | null;
  /** Sum of the channels' reach (people may be reached by several channels). */
  reach: number | null;
  avgOrderValue: number | null;
  rates: { awarenessToConsideration: number | null; considerationToSales: number | null };
  /** Rates derived from the channel benchmarks (shown as default). */
  benchmarkRates: {
    awarenessToConsideration: number | null;
    considerationToSales: number | null;
    avgOrderValue: number | null;
  };
  cost: { awareness: number; consideration: number; total: number };
  channels: PlannedChannel[];
  warnings: string[];
}

const pick = (override: number | null | undefined, base: number | null) => (override != null ? override : base);

/** Shares per channel within a stage, normalised to 1 (equal split if none is given). */
function stageShares(channels: readonly PlanChannel[], input: ReversePlanInput): Map<string, number> {
  const given = channels.map((c) => input.channels[c.id]?.share);
  const result = new Map<string, number>();
  const total = given.reduce<number>((sum, s) => sum + (s ?? 0), 0);
  if (given.every((s) => s == null) || total <= 0) {
    channels.forEach((c) => result.set(c.id, 1 / channels.length));
  } else {
    channels.forEach((c, i) => result.set(c.id, (given[i] ?? 0) / total));
  }
  return result;
}

/** Share-weighted average of a benchmark across channels (ignoring channels without the value). */
function weighted(channels: readonly { share: number; value: number | null }[]): number | null {
  const valid = channels.filter((c) => c.value != null && c.share > 0);
  const weight = valid.reduce((sum, c) => sum + c.share, 0);
  return weight > 0 ? valid.reduce((sum, c) => sum + c.share * c.value!, 0) / weight : null;
}

export function computeReversePlan(channels: readonly PlanChannel[], input: ReversePlanInput): ReversePlanResult {
  const warnings: string[] = [];
  const byStage = (stage: FunnelStage) => channels.filter((c) => c.stage === stage);
  const planned = new Map<string, PlannedChannel>();
  for (const stage of ["AWARENESS", "CONSIDERATION", "SALES"] as const) {
    const own = byStage(stage);
    const shares = stageShares(own, input);
    for (const c of own) {
      const o = input.channels[c.id] ?? {};
      planned.set(c.id, {
        id: c.id,
        name: c.name,
        stage,
        share: shares.get(c.id)!,
        benchmark: {
          cpm: pick(o.cpm, c.benchmark.cpm),
          frequency: pick(o.frequency, c.benchmark.frequency),
          rateToNext: pick(o.rateToNext, c.benchmark.rateToNext),
          costPerAction: pick(o.costPerAction, c.benchmark.costPerAction),
          avgOrderValue: pick(o.avgOrderValue, c.benchmark.avgOrderValue),
        },
        kpis: {},
        cost: null,
      });
    }
  }
  const list = [...planned.values()];
  const inStage = (stage: FunnelStage) => list.filter((c) => c.stage === stage);

  const benchmarkRates = {
    awarenessToConsideration: weighted(
      inStage("AWARENESS").map((c) => ({ share: c.share, value: c.benchmark.rateToNext })),
    ),
    considerationToSales: weighted(
      inStage("CONSIDERATION").map((c) => ({ share: c.share, value: c.benchmark.rateToNext })),
    ),
    avgOrderValue: weighted(inStage("SALES").map((c) => ({ share: c.share, value: c.benchmark.avgOrderValue }))),
  };
  const a2c = pick(input.awarenessToConsideration, benchmarkRates.awarenessToConsideration);
  const c2s = pick(input.considerationToSales, benchmarkRates.considerationToSales);
  const aov = pick(input.avgOrderValue, benchmarkRates.avgOrderValue);

  let units: number | null = input.goalType === "units" ? input.goalValue : null;
  if (input.goalType === "revenue") {
    if (aov && aov > 0) units = input.goalValue / aov;
    else warnings.push("Enter an average order value to turn the revenue goal into units.");
  }
  const revenue = input.goalType === "revenue" ? input.goalValue : units != null && aov ? units * aov : null;

  let sessions: number | null = null;
  if (units != null) {
    if (c2s && c2s > 0) sessions = units / (c2s / 100);
    else warnings.push("Enter the conversion rate from consideration to sales.");
  }
  let impressions: number | null = null;
  if (sessions != null) {
    if (a2c && a2c > 0) impressions = sessions / (a2c / 100);
    else warnings.push("Enter the rate from awareness to consideration.");
  }

  const missing = (stage: string, what: string) =>
    warnings.push(`No ${stage} channel: ${what} cannot be assigned to a channel.`);
  if (inStage("SALES").length === 0 && units != null) missing("sales", "the units sold");
  if (inStage("CONSIDERATION").length === 0 && sessions != null) missing("consideration", "the sessions");
  if (inStage("AWARENESS").length === 0 && impressions != null) missing("awareness", "the impressions");

  const cost = { awareness: 0, consideration: 0, total: 0 };
  let reach: number | null = null;
  for (const c of list) {
    if (c.stage === "AWARENESS" && impressions != null) {
      const imp = impressions * c.share;
      c.kpis[PLAN_KPIS.impressions] = Math.round(imp);
      if (c.benchmark.frequency && c.benchmark.frequency > 0) {
        const r = imp / c.benchmark.frequency;
        c.kpis[PLAN_KPIS.reach] = Math.round(r);
        reach = (reach ?? 0) + r;
      }
      if (c.benchmark.cpm != null) {
        c.cost = (imp / 1000) * c.benchmark.cpm;
        cost.awareness += c.cost;
      }
    }
    if (c.stage === "CONSIDERATION" && sessions != null) {
      const s = sessions * c.share;
      c.kpis[PLAN_KPIS.sessions] = Math.round(s);
      if (c.benchmark.costPerAction != null) {
        c.cost = s * c.benchmark.costPerAction;
        cost.consideration += c.cost;
      }
    }
    if (c.stage === "SALES" && units != null) {
      const u = units * c.share;
      c.kpis[PLAN_KPIS.units] = Math.round(u);
      const value = c.benchmark.avgOrderValue ?? aov;
      if (value) c.kpis[PLAN_KPIS.revenue] = Math.round(u * value);
    }
  }
  cost.total = cost.awareness + cost.consideration;

  return {
    units,
    revenue,
    sessions,
    impressions,
    reach,
    avgOrderValue: aov,
    rates: { awarenessToConsideration: a2c, considerationToSales: c2s },
    benchmarkRates,
    cost,
    channels: list,
    warnings,
  };
}

/** What the campaign budget buys at the plan's cost per unit (linear), null without budget or cost. */
export function budgetCheck(result: ReversePlanResult, budgetEuro: number | null) {
  if (budgetEuro == null || result.cost.total <= 0 || result.units == null) return null;
  const coverage = budgetEuro / result.cost.total;
  return {
    budget: budgetEuro,
    coverage,
    achievableUnits: result.units * coverage,
    gap: result.cost.total - budgetEuro,
  };
}

/** Channel targets after applying the plan: plan KPIs replace existing targets of the same name, others stay. */
export function mergeTargets(
  existing: Record<string, number>,
  planned: Record<string, number>,
): Record<string, number> {
  const key = (name: string) => name.trim().toLocaleLowerCase("en-GB");
  const plannedKeys = new Set(Object.keys(planned).map(key));
  return {
    ...Object.fromEntries(Object.entries(existing).filter(([name]) => !plannedKeys.has(key(name)))),
    ...planned,
  };
}
