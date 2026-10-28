// Target vs. actual per channel and KPI from imported report values.

export type Aggregation = "sum" | "avg";

const RATE_KPI = /(%|rate|quote|ctr|cpm|cpc|cpa|cpl|cpv|roas|roi|verweildauer|dauer|durchschnitt|ø|avg|average|frequenz|frequency)/i;
const COST_KPI = /(cpm|cpc|cpa|cpl|cpv|kosten|cost)/i;

/** Rates and averages are averaged across values; counts and amounts are summed. */
export function aggregationFor(kpiName: string): Aggregation {
  return RATE_KPI.test(kpiName) ? "avg" : "sum";
}

/** Cost KPIs (CPM, CPC, …) are better when lower. */
export function lowerIsBetter(kpiName: string): boolean {
  return COST_KPI.test(kpiName);
}

const key = (name: string) => name.trim().toLocaleLowerCase("de-DE");

export interface KpiActual {
  kpiName: string;
  target: number | null;
  actual: number | null;
  aggregation: Aggregation;
  valueCount: number;
  /** Achievement as a ratio (1 = target met); inverted for cost KPIs. Null without target or actual. */
  achievement: number | null;
}

export interface ChannelActuals {
  channelId: string;
  kpis: KpiActual[];
}

/**
 * Combines KPI targets (per channel) with imported values. KPI names are
 * matched case-insensitively; KPIs that only exist in reports are listed
 * without target.
 */
export function computeActuals(
  channels: readonly { id: string; kpiTargets: Record<string, number> }[],
  values: readonly { channelId: string | null; kpiName: string; value: number }[],
): ChannelActuals[] {
  return channels.map((channel) => {
    const own = values.filter((v) => v.channelId === channel.id);
    const byKpi = new Map<string, { name: string; values: number[] }>();
    for (const v of own) {
      const k = key(v.kpiName);
      const entry = byKpi.get(k) ?? { name: v.kpiName.trim(), values: [] };
      entry.values.push(v.value);
      byKpi.set(k, entry);
    }

    const result: KpiActual[] = [];
    const build = (kpiName: string, target: number | null, list: number[]): KpiActual => {
      const aggregation = aggregationFor(kpiName);
      const actual =
        list.length === 0
          ? null
          : aggregation === "sum"
            ? list.reduce((a, b) => a + b, 0)
            : list.reduce((a, b) => a + b, 0) / list.length;
      let achievement: number | null = null;
      if (target != null && actual != null && target !== 0) {
        achievement = lowerIsBetter(kpiName) ? (actual === 0 ? null : target / actual) : actual / target;
      }
      return { kpiName, target, actual, aggregation, valueCount: list.length, achievement };
    };

    for (const [name, target] of Object.entries(channel.kpiTargets)) {
      const entry = byKpi.get(key(name));
      byKpi.delete(key(name));
      result.push(build(name, target, entry?.values ?? []));
    }
    for (const entry of byKpi.values()) result.push(build(entry.name, null, entry.values));
    return { channelId: channel.id, kpis: result };
  });
}
