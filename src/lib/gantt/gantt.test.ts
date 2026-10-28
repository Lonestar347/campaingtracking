import { describe, expect, it } from "vitest";
import { buildGantt, buildTicks } from "@/lib/gantt";
import { FUNNEL_STAGE_LABELS } from "@/lib/domain/enums";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const config = { dueSoonDays: 7, timeZone: "UTC" };

const input = {
  startDate: d("2026-11-01"),
  endDate: d("2026-11-30"),
  channels: [
    {
      id: "c1",
      name: "Social",
      funnelStage: "AWARENESS",
      startDate: d("2026-11-05"),
      endDate: d("2026-11-20"),
      assets: [
        { id: "a1", title: "Reel", status: "IN_PRODUCTION", dueDate: d("2026-10-25") },
        { id: "a2", title: "Story", status: "IDEA", dueDate: null },
      ],
    },
    { id: "c2", name: "POS", funnelStage: "SALES", startDate: null, endDate: null, assets: [] },
  ],
};

describe("buildGantt", () => {
  const gantt = buildGantt(input, d("2026-11-02"), FUNNEL_STAGE_LABELS, config);

  it("covers campaign, channels and due dates with padding", () => {
    expect(gantt.from).toEqual(d("2026-10-22"));
    expect(gantt.to).toEqual(d("2026-12-03"));
  });

  it("lists rows grouped by stage, skipping empty stages", () => {
    expect(gantt.rows.map((r) => `${r.kind}:${r.id}`)).toEqual([
      "campaign:campaign",
      "stage:AWARENESS",
      "channel:c1",
      "asset:a1",
      "asset:a2",
      "stage:SALES",
      "channel:c2",
    ]);
  });

  it("positions bars including their end day", () => {
    const span = 43; // 22/10 – 03/12 inclusive
    const campaign = gantt.rows[0];
    expect(campaign.kind === "campaign" && campaign.bar).toEqual({ left: 10 / span, width: 30 / span });
  });

  it("lets channels without dates span the campaign", () => {
    const pos = gantt.rows.find((r) => r.id === "c2");
    expect(pos?.kind === "channel" && pos.inherited).toBe(true);
    expect(pos?.kind === "channel" && pos.bar).toEqual((gantt.rows[0] as { bar: unknown }).bar);
  });

  it("marks overdue milestones and assets without due date", () => {
    const [a1, a2] = gantt.rows.filter((r) => r.kind === "asset");
    expect(a1.kind === "asset" && a1.overdue).toBe(true);
    expect(a1.kind === "asset" && a1.at).toBeCloseTo(3.5 / 43);
    expect(a2.kind === "asset" && a2.at).toBeNull();
  });

  it("places today, or null outside the range", () => {
    expect(gantt.today).toBeCloseTo(11.5 / 43);
    expect(buildGantt(input, d("2027-03-01"), FUNNEL_STAGE_LABELS, config).today).toBeNull();
  });
});

describe("buildTicks", () => {
  const dayNumber = (iso: string) => d(iso).getTime() / 86_400_000;

  it("uses Mondays for short ranges", () => {
    const ticks = buildTicks(dayNumber("2026-10-22"), dayNumber("2026-11-20"));
    expect(ticks.map((t) => t.label)).toEqual(["26 Oct", "2 Nov", "9 Nov", "16 Nov"]);
  });

  it("uses months for long ranges, with the year in January", () => {
    const ticks = buildTicks(dayNumber("2026-10-15"), dayNumber("2027-04-10"));
    expect(ticks.map((t) => t.label)).toEqual(["Nov", "Dec", "Jan 2027", "Feb", "Mar", "Apr"]);
  });
});
