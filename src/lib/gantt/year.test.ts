import { describe, expect, it } from "vitest";
import { buildYearTimeline, timelineYears } from "@/lib/gantt/year";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const config = { dueSoonDays: 7, timeZone: "UTC", kpiGreenAt: 0.95, kpiYellowAt: 0.8 };
const campaign = (id: string, start: string, end: string, channels = []) => ({
  id,
  slug: id,
  name: id,
  startDate: d(start),
  endDate: d(end),
  channels,
});

describe("buildYearTimeline", () => {
  const campaigns = [
    campaign("b", "2026-12-15", "2027-02-10"),
    campaign("a", "2026-03-01", "2026-03-31", [
      {
        id: "c1",
        name: "Social",
        funnelStage: "SALES",
        startDate: null,
        endDate: null,
        assets: [{ id: "x", title: "Post", status: "IDEA", dueDate: d("2026-03-05") }],
      },
      {
        id: "c0",
        name: "TV",
        funnelStage: "AWARENESS",
        startDate: d("2026-03-10"),
        endDate: d("2026-03-20"),
        assets: [],
      },
    ] as never),
    campaign("old", "2025-01-01", "2025-02-01"),
  ];
  const t = buildYearTimeline(campaigns, 2026, d("2026-03-10"), config);

  it("keeps campaigns of the year, sorted by start", () => {
    expect(t.rows.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("positions and clips bars to the year", () => {
    expect(t.rows[0].bar).toEqual({ left: 59 / 365, width: 31 / 365, clippedStart: false, clippedEnd: false });
    expect(t.rows[1].bar).toMatchObject({ clippedStart: false, clippedEnd: true, width: 17 / 365 });
  });

  it("orders channels by funnel stage and places asset milestones", () => {
    const [tv, social] = t.rows[0].channels;
    expect([tv.name, social.name]).toEqual(["TV", "Social"]);
    expect(social.inherited).toBe(true);
    expect(social.assets[0]).toMatchObject({ id: "x", overdue: true });
    expect(social.assets[0].at).toBeCloseTo(63.5 / 365);
  });

  it("counts parallel campaigns per week and marks today and months", () => {
    expect(t.weeks).toHaveLength(53);
    expect(Math.max(...t.weeks.map((w) => w.count))).toBe(1);
    expect(t.months[2]).toEqual({ label: "Mar", at: 59 / 365 });
    expect(t.today).toBeCloseTo(68.5 / 365);
    expect(buildYearTimeline(campaigns, 2027, d("2026-03-10"), config).today).toBeNull();
  });

  it("lists years with campaigns", () => {
    expect(timelineYears(campaigns, d("2026-03-10"))).toEqual([2025, 2026, 2027]);
  });
});
