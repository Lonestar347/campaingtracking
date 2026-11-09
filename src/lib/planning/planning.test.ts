import { describe, expect, it } from "vitest";
import {
  budgetCheck,
  computeReversePlan,
  mergeTargets,
  parseReversePlan,
  type PlanChannel,
} from "@/lib/planning/reverse";
import { backwardSchedule } from "@/lib/planning/schedule";
import { EMPTY_BENCHMARK } from "@/lib/planning/defaults";

const bm = (values: Partial<typeof EMPTY_BENCHMARK>) => ({ ...EMPTY_BENCHMARK, ...values });
const channels: PlanChannel[] = [
  { id: "tv", name: "TV", stage: "AWARENESS", benchmark: bm({ cpm: 20, frequency: 4, rateToNext: 0.5 }) },
  { id: "social", name: "Social", stage: "AWARENESS", benchmark: bm({ cpm: 5, frequency: 2, rateToNext: 1.5 }) },
  { id: "web", name: "Web", stage: "CONSIDERATION", benchmark: bm({ costPerAction: 1, rateToNext: 5 }) },
  { id: "pos", name: "POS", stage: "SALES", benchmark: bm({ avgOrderValue: 20 }) },
];

describe("computeReversePlan", () => {
  it("calculates back from units through the funnel with benchmark rates", () => {
    const plan = computeReversePlan(channels, { goalType: "units", goalValue: 1000, channels: {} });
    // equal split in awareness: rate (0.5 + 1.5) / 2 = 1 %
    expect(plan.rates).toEqual({ awarenessToConsideration: 1, considerationToSales: 5 });
    expect(plan.sessions).toBe(20_000);
    expect(plan.impressions).toBe(2_000_000);
    expect(plan.revenue).toBe(20_000);
    const tv = plan.channels.find((c) => c.id === "tv")!;
    expect(tv.kpis).toEqual({ Impressions: 1_000_000, Reach: 250_000 });
    expect(tv.cost).toBe(20_000);
    expect(plan.reach).toBe(750_000);
    expect(plan.cost).toEqual({ awareness: 25_000, consideration: 20_000, total: 45_000 });
    expect(plan.channels.find((c) => c.id === "pos")!.kpis).toEqual({ "Units sold": 1000, Revenue: 20_000 });
    expect(plan.warnings).toEqual([]);
  });

  it("uses shares, overrides and a revenue goal", () => {
    const plan = computeReversePlan(channels, {
      goalType: "revenue",
      goalValue: 50_000,
      avgOrderValue: 25,
      considerationToSales: 10,
      channels: { tv: { share: 75 }, social: { share: 25, cpm: 4 } },
    });
    expect(plan.units).toBe(2000);
    // weighted 0.75 * 0.5 + 0.25 * 1.5 = 0.75 %
    expect(plan.rates.awarenessToConsideration).toBeCloseTo(0.75);
    expect(plan.sessions).toBe(20_000);
    const social = plan.channels.find((c) => c.id === "social")!;
    expect(social.share).toBe(0.25);
    expect(social.benchmark.cpm).toBe(4);
  });

  it("plans additional KPIs as a share of the channel volume, plan overrides first", () => {
    const withExtras = channels.map((c) =>
      c.id === "social" ? { ...c, extraKpis: [{ name: "Clicks", rate: 2 }] } : c.id === "web" ? { ...c, extraKpis: [{ name: "Leads", rate: 10 }] } : c,
    );
    const plan = computeReversePlan(withExtras, { goalType: "units", goalValue: 1000, channels: {} });
    expect(plan.channels.find((c) => c.id === "social")!.kpis.Clicks).toBe(20_000); // 2 % of 1,000,000
    expect(plan.channels.find((c) => c.id === "web")!.kpis.Leads).toBe(2000); // 10 % of 20,000 sessions
    const overridden = computeReversePlan(withExtras, {
      goalType: "units",
      goalValue: 1000,
      channels: { social: { extraKpis: [{ name: "Video views", rate: 30 }] }, web: { extraKpis: [] } },
    });
    const social = overridden.channels.find((c) => c.id === "social")!;
    expect(social.kpis).toMatchObject({ "Video views": 300_000 });
    expect(social.kpis.Clicks).toBeUndefined();
    expect(overridden.channels.find((c) => c.id === "web")!.kpis.Leads).toBeUndefined();
  });

  it("warns about missing rates and stages", () => {
    const plan = computeReversePlan([channels[3]], {
      goalType: "revenue",
      goalValue: 100,
      avgOrderValue: 0,
      channels: {},
    });
    expect(plan.warnings[0]).toMatch(/average order value/);
    const noRates = computeReversePlan([channels[3]], { goalType: "units", goalValue: 100, channels: {} });
    expect(noRates.warnings).toEqual(["Enter the conversion rate from consideration to sales."]);
    const noAwareness = computeReversePlan(channels.slice(2), {
      goalType: "units",
      goalValue: 100,
      awarenessToConsideration: 1,
      channels: {},
    });
    expect(noAwareness.warnings).toEqual(["No awareness channel: the impressions cannot be assigned to a channel."]);
  });

  it("checks the budget and merges targets", () => {
    const plan = computeReversePlan(channels, { goalType: "units", goalValue: 1000, channels: {} });
    expect(budgetCheck(plan, 30_000)).toMatchObject({ coverage: 30_000 / 45_000, gap: 15_000 });
    expect(budgetCheck(plan, 30_000)!.achievableUnits).toBeCloseTo(666.67, 1);
    expect(budgetCheck(plan, null)).toBeNull();
    expect(mergeTargets({ impressions: 5, CPM: 6 }, { Impressions: 10, Reach: 3 })).toEqual({
      CPM: 6,
      Impressions: 10,
      Reach: 3,
    });
  });

  it("parses stored plans and rejects invalid ones", () => {
    expect(parseReversePlan({ goalType: "units", goalValue: 10 })).toEqual({
      goalType: "units",
      goalValue: 10,
      channels: {},
    });
    expect(parseReversePlan({ goalType: "units", goalValue: -1 })).toBeNull();
    expect(parseReversePlan(null)).toBeNull();
  });
});

describe("backwardSchedule", () => {
  const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
  const config = { dueSoonDays: 7, timeZone: "UTC", kpiGreenAt: 0.95, kpiYellowAt: 0.8 };
  const asset = (status: string, assetType = "VIDEO") => ({
    id: "a",
    title: "Spot",
    assetType,
    status,
    dueDate: d("2026-11-27"),
    channelId: "c",
    channelName: "TV",
    goLive: d("2026-12-01"),
    goLiveSource: "channel" as const,
  });

  it("counts back from go-live with buffer and lead times", () => {
    const [row] = backwardSchedule([asset("IDEA")], {}, 3, d("2026-10-01"), config);
    // VIDEO: approval 5, production 20, briefing 5
    expect(row.readyBy).toEqual(d("2026-11-28"));
    expect(row.approvalStart).toEqual(d("2026-11-23"));
    expect(row.productionStart).toEqual(d("2026-11-03"));
    expect(row.briefingStart).toEqual(d("2026-10-29"));
    expect(row.delay).toBeNull();
    expect(row.changed).toBe(true);
  });

  it("flags the latest missed phase depending on the status", () => {
    const leadTimes = { STATIC: { briefingDays: 2, productionDays: 5, approvalDays: 2 } };
    const at = (status: string, today: string) =>
      backwardSchedule([asset(status, "STATIC")], leadTimes, 3, d(today), config)[0].delay;
    // ready 28/11, approval 26/11, production 21/11, briefing 19/11
    expect(at("IDEA", "2026-11-20")).toBe("briefing");
    expect(at("BRIEFING", "2026-11-20")).toBeNull();
    expect(at("BRIEFING", "2026-11-22")).toBe("production");
    expect(at("IN_PRODUCTION", "2026-11-27")).toBe("approval");
    expect(at("APPROVAL", "2026-11-29")).toBe("ready");
    expect(at("DONE", "2026-11-29")).toBeNull();
  });
});
