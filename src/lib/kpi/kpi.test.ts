import { describe, expect, it } from "vitest";
import { campaignKpis, defaultHeadlineKpis, kpiPace, resolveHeadlineKpis, stageFlow } from "@/lib/kpi";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const config = { dueSoonDays: 7, timeZone: "UTC", kpiGreenAt: 0.95, kpiYellowAt: 0.8 };

const campaign = {
  startDate: d("2026-11-01"),
  endDate: d("2026-11-30"),
  channels: [
    { id: "pos", funnelStage: "SALES", startDate: null, endDate: null, kpiTargets: { "Units sold": 3000 } },
    {
      id: "social",
      funnelStage: "AWARENESS",
      startDate: d("2026-11-01"),
      endDate: d("2026-11-10"),
      kpiTargets: { Impressions: 1000, "CTR %": 2, CPM: 5 },
    },
    {
      id: "tv",
      funnelStage: "AWARENESS",
      startDate: null,
      endDate: null,
      kpiTargets: { impressions: 4000, Reach: 500 },
    },
    { id: "web", funnelStage: "CONSIDERATION", startDate: null, endDate: null, kpiTargets: { Sessions: 50 } },
  ],
};

const values = [
  { channelId: "social", kpiName: "Impressions", value: 300, date: d("2026-11-01") },
  { channelId: "tv", kpiName: "Impressions", value: 200, date: d("2026-11-01") },
  { channelId: "social", kpiName: "Impressions", value: 500, date: d("2026-11-02") },
  { channelId: "social", kpiName: "CTR %", value: 1.5, date: d("2026-11-01") },
  { channelId: "social", kpiName: "CTR %", value: 2.5, date: d("2026-11-02") },
  { channelId: "social", kpiName: "CPM", value: 4, date: null },
  { channelId: "web", kpiName: "Sessions", value: 10, date: d("2026-11-02") },
  { channelId: null, kpiName: "Followers", value: 42, date: null },
];

const kpis = campaignKpis(campaign, values, config);
const byName = (name: string) => kpis.find((k) => k.kpiName === name)!;

describe("campaignKpis", () => {
  it("combines targets and values across channels, in funnel order", () => {
    expect(kpis.map((k) => k.kpiName)).toEqual([
      "Impressions",
      "CTR %",
      "CPM",
      "Reach",
      "Sessions",
      "Units sold",
      "Followers",
    ]);
    expect(byName("Impressions")).toMatchObject({ stage: "AWARENESS", target: 5000, actual: 1000, valueCount: 3 });
    expect(byName("CTR %")).toMatchObject({ aggregation: "avg", target: 2, actual: 2 });
    expect(byName("Followers")).toMatchObject({ stage: null, target: null, actual: 42 });
  });

  it("uses the channels' periods and builds a daily series", () => {
    expect(byName("Impressions").period).toEqual({ start: d("2026-11-01"), end: d("2026-11-30") });
    expect(byName("CTR %").period).toEqual({ start: d("2026-11-01"), end: d("2026-11-10") });
    expect(byName("Impressions").series).toEqual([
      { date: d("2026-11-01"), value: 500 },
      { date: d("2026-11-02"), value: 500 },
    ]);
    expect(byName("CTR %").series.map((p) => p.value)).toEqual([1.5, 2.5]);
  });
});

describe("kpiPace", () => {
  it("compares counts with the pro-rata target up to the latest data", () => {
    const pace = kpiPace(byName("Impressions"), d("2026-11-20"), config);
    // 2 of 30 days elapsed -> expected 333.3; actual 1000
    expect(pace.elapsed).toBeCloseTo(2 / 30);
    expect(pace.expected).toBeCloseTo(333.33, 1);
    expect(pace.light).toBe("GREEN");
    expect(pace.achievement).toBeCloseTo(0.2);
  });

  it("rates averages against the target and inverts cost KPIs", () => {
    expect(kpiPace(byName("CTR %"), d("2026-11-05"), config)).toMatchObject({
      state: "rated",
      ratio: 1,
      light: "GREEN",
    });
    expect(kpiPace(byName("CPM"), d("2026-11-05"), config)).toMatchObject({ ratio: 1.25, light: "GREEN" });
  });

  it("turns yellow and red below the thresholds", () => {
    const sessions = byName("Sessions"); // 10 of 50, 2/30 elapsed -> expected 3.33 -> green
    expect(kpiPace(sessions, d("2026-11-02"), config).light).toBe("GREEN");
    const late = { ...sessions, series: [{ date: d("2026-11-15"), value: 10 }] }; // expected 25
    expect(kpiPace(late, d("2026-11-15"), config).light).toBe("RED");
    const close = { ...sessions, actual: 22, series: [{ date: d("2026-11-15"), value: 22 }] };
    expect(kpiPace(close, d("2026-11-15"), config).light).toBe("YELLOW");
  });

  it("reports missing target, missing data and not started", () => {
    expect(kpiPace(byName("Followers"), d("2026-11-05"), config).state).toBe("no-target");
    expect(kpiPace(byName("Units sold"), d("2026-11-05"), config).state).toBe("no-data");
    const early = { ...byName("Sessions"), series: [] };
    expect(kpiPace(early, d("2026-10-20"), config).state).toBe("not-started");
  });
});

describe("headline KPIs", () => {
  it("defaults to the lead KPI of each stage", () => {
    expect(defaultHeadlineKpis(kpis).map((k) => k.kpiName)).toEqual(["Impressions", "Sessions", "Units sold"]);
  });

  it("uses a stored choice when its KPIs exist", () => {
    expect(resolveHeadlineKpis(["ctr %", "Unknown", "Reach"], kpis)).toMatchObject({ custom: true });
    expect(resolveHeadlineKpis(["ctr %", "Unknown", "Reach"], kpis).kpis.map((k) => k.kpiName)).toEqual([
      "CTR %",
      "Reach",
    ]);
    expect(resolveHeadlineKpis(["Unknown"], kpis).custom).toBe(false);
    expect(resolveHeadlineKpis(null, kpis).kpis).toHaveLength(3);
  });
});

describe("leadKpi", () => {
  it("ignores money KPIs such as revenue", () => {
    const withRevenue = campaignKpis(
      { ...campaign, channels: [{ id: "pos", funnelStage: "SALES", startDate: null, endDate: null, kpiTargets: { "Units sold": 300, Revenue: 9000 } }] },
      [],
      config,
    );
    expect(stageFlow(withRevenue).stages[2].lead?.kpiName).toBe("Units sold");
  });
});

describe("stageFlow", () => {
  it("links the lead KPIs of consecutive stages", () => {
    const flow = stageFlow(kpis);
    expect(flow.stages.map((s) => s.lead?.kpiName ?? null)).toEqual(["Impressions", "Sessions", "Units sold"]);
    expect(flow.conversions[0]).toMatchObject({
      from: "AWARENESS",
      to: "CONSIDERATION",
      actualRate: 0.01,
      targetRate: 0.01,
    });
    expect(flow.conversions[1]).toMatchObject({ actualRate: null, targetRate: 60 });
  });
});
