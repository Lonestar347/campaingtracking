import { describe, expect, it } from "vitest";
import {
  computeCampaignPhase,
  computeProgress,
  computeTrafficLight,
  isDueSoonAndBehind,
  isOverdue,
  rollupCampaign,
  type StatusAsset,
} from "@/lib/status";
import type { StatusConfig } from "@/lib/config";

// 28.10.2026, 10:00 in Berlin (CET, UTC+1)
const NOW = new Date("2026-10-28T09:00:00Z");
const config: StatusConfig = { dueSoonDays: 7, timeZone: "Europe/Berlin" };

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const asset = (status: string, due: string | null): StatusAsset => ({
  status,
  dueDate: due ? day(due) : null,
});

describe("computeProgress", () => {
  it("counts FERTIG and LIVE as done", () => {
    const p = computeProgress([
      asset("FERTIG", null),
      asset("LIVE", null),
      asset("FREIGABE", null),
      asset("IDEE", null),
      asset("PAUSIERT", null),
    ]);
    expect(p).toEqual({ done: 2, total: 5, ratio: 0.4 });
  });

  it("excludes cancelled assets", () => {
    expect(computeProgress([asset("FERTIG", null), asset("ABGEBROCHEN", null)])).toMatchObject({
      done: 1,
      total: 1,
    });
  });

  it("returns 0/0 for no assets", () => {
    expect(computeProgress([])).toEqual({ done: 0, total: 0, ratio: 0 });
  });
});

describe("isOverdue", () => {
  it("is overdue when due yesterday and not done", () => {
    expect(isOverdue(asset("IN_PRODUKTION", "2026-10-27"), NOW, config)).toBe(true);
  });

  it("is not overdue when due today", () => {
    expect(isOverdue(asset("IN_PRODUKTION", "2026-10-28"), NOW, config)).toBe(false);
  });

  it("ignores done, cancelled and undated assets", () => {
    expect(isOverdue(asset("FERTIG", "2026-10-01"), NOW, config)).toBe(false);
    expect(isOverdue(asset("LIVE", "2026-10-01"), NOW, config)).toBe(false);
    expect(isOverdue(asset("ABGEBROCHEN", "2026-10-01"), NOW, config)).toBe(false);
    expect(isOverdue(asset("IDEE", null), NOW, config)).toBe(false);
  });

  it("treats paused assets past their deadline as overdue", () => {
    expect(isOverdue(asset("PAUSIERT", "2026-10-20"), NOW, config)).toBe(true);
  });

  it("uses the calendar day in the configured time zone", () => {
    // 23:30 UTC on 27.10. is already 28.10. in Berlin -> due today, not overdue
    const lateEvening = new Date("2026-10-27T23:30:00Z");
    expect(isOverdue(asset("BRIEFING", "2026-10-28"), lateEvening, config)).toBe(false);
  });
});

describe("isDueSoonAndBehind", () => {
  it("is true for due today and within the threshold", () => {
    expect(isDueSoonAndBehind(asset("BRIEFING", "2026-10-28"), NOW, config)).toBe(true);
    expect(isDueSoonAndBehind(asset("BRIEFING", "2026-11-04"), NOW, config)).toBe(true);
  });

  it("is false beyond the threshold", () => {
    expect(isDueSoonAndBehind(asset("BRIEFING", "2026-11-05"), NOW, config)).toBe(false);
  });

  it("is false once the asset is in approval or later", () => {
    expect(isDueSoonAndBehind(asset("FREIGABE", "2026-10-30"), NOW, config)).toBe(false);
    expect(isDueSoonAndBehind(asset("FERTIG", "2026-10-30"), NOW, config)).toBe(false);
  });

  it("respects a custom threshold", () => {
    const strict = { ...config, dueSoonDays: 2 };
    expect(isDueSoonAndBehind(asset("IDEE", "2026-11-01"), NOW, strict)).toBe(false);
    expect(isDueSoonAndBehind(asset("IDEE", "2026-10-30"), NOW, strict)).toBe(true);
  });
});

describe("computeTrafficLight", () => {
  it("is GREEN without assets", () => {
    expect(computeTrafficLight([], NOW, config)).toBe("GREEN");
  });

  it("is RED as soon as one asset is overdue", () => {
    expect(
      computeTrafficLight(
        [asset("FERTIG", "2026-10-01"), asset("BRIEFING", "2026-10-29"), asset("IDEE", "2026-10-20")],
        NOW,
        config,
      ),
    ).toBe("RED");
  });

  it("is YELLOW when something is due soon and behind", () => {
    expect(
      computeTrafficLight([asset("FREIGABE", "2026-10-29"), asset("BRIEFING", "2026-11-02")], NOW, config),
    ).toBe("YELLOW");
  });

  it("is GREEN when everything is on track", () => {
    expect(
      computeTrafficLight(
        [asset("FREIGABE", "2026-10-29"), asset("IDEE", "2026-12-01"), asset("ABGEBROCHEN", "2026-10-01")],
        NOW,
        config,
      ),
    ).toBe("GREEN");
  });
});

describe("computeCampaignPhase", () => {
  const base = { startDate: day("2026-11-15"), endDate: day("2026-12-31") };

  it("is PLANUNG before start with only ideas", () => {
    expect(computeCampaignPhase({ ...base, assets: [asset("IDEE", null)] }, NOW, config)).toBe("PLANUNG");
    expect(computeCampaignPhase({ ...base, assets: [] }, NOW, config)).toBe("PLANUNG");
  });

  it("is IN_ARBEIT before start once work has begun", () => {
    expect(
      computeCampaignPhase({ ...base, assets: [asset("IDEE", null), asset("BRIEFING", null)] }, NOW, config),
    ).toBe("IN_ARBEIT");
  });

  it("ignores cancelled assets for IN_ARBEIT", () => {
    expect(computeCampaignPhase({ ...base, assets: [asset("ABGEBROCHEN", null)] }, NOW, config)).toBe(
      "PLANUNG",
    );
  });

  it("is LIVE before start if an asset is already live", () => {
    expect(computeCampaignPhase({ ...base, assets: [asset("LIVE", null)] }, NOW, config)).toBe("LIVE");
  });

  it("is LIVE within the campaign period, including start and end day", () => {
    const running = { startDate: day("2026-10-28"), endDate: day("2026-10-28"), assets: [] };
    expect(computeCampaignPhase(running, NOW, config)).toBe("LIVE");
  });

  it("is ABGESCHLOSSEN after the end date", () => {
    const past = { startDate: day("2026-09-01"), endDate: day("2026-10-27"), assets: [asset("LIVE", null)] };
    expect(computeCampaignPhase(past, NOW, config)).toBe("ABGESCHLOSSEN");
  });
});

describe("rollupCampaign", () => {
  it("aggregates per funnel stage and for the campaign", () => {
    const result = rollupCampaign(
      {
        startDate: day("2026-11-01"),
        endDate: day("2026-12-31"),
        channels: [
          { funnelStage: "AWARENESS", assets: [asset("FERTIG", null), asset("IDEE", "2026-10-20")] },
          { funnelStage: "AWARENESS", assets: [asset("LIVE", null)] },
          { funnelStage: "SALES", assets: [asset("BRIEFING", "2026-10-30")] },
        ],
      },
      NOW,
      config,
    );

    expect(result.stages.AWARENESS).toMatchObject({
      progress: { done: 2, total: 3 },
      trafficLight: "RED",
      overdueCount: 1,
    });
    expect(result.stages.CONSIDERATION).toMatchObject({ progress: { done: 0, total: 0 }, trafficLight: "GREEN" });
    expect(result.stages.SALES).toMatchObject({ trafficLight: "YELLOW", overdueCount: 0 });
    expect(result.campaign).toMatchObject({
      progress: { done: 2, total: 4 },
      trafficLight: "RED",
      overdueCount: 1,
      phase: "LIVE",
    });
  });
});
