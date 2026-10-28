import { describe, expect, it } from "vitest";
import {
  buildTimeline,
  countActiveFilters,
  dashboardStats,
  dueSoonAssets,
  filterOptions,
  filtersToSearchParams,
  matchesFilters,
  overdueAssets,
  parseCompareSlugs,
  parseFilters,
  parseSort,
  sortSummaries,
  summarizeCampaigns,
  type DashboardCampaign,
} from "@/lib/dashboard";
import type { StatusConfig } from "@/lib/config";

const NOW = new Date("2026-10-28T09:00:00Z");
const config: StatusConfig = { dueSoonDays: 7, timeZone: "Europe/Berlin" };
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

function campaign(partial: Partial<DashboardCampaign> & { slug: string }): DashboardCampaign {
  return {
    id: partial.slug,
    name: partial.slug,
    startDate: day("2026-11-01"),
    endDate: day("2026-12-31"),
    markets: ["DE"],
    brand: null,
    productLine: null,
    executionType: "inhouse",
    budgetCents: null,
    owner: { id: "u1", name: "Anna" },
    channels: [],
    ...partial,
  };
}

const asset = (id: string, status: string, due: string | null) => ({
  id,
  title: `Asset ${id}`,
  status,
  dueDate: due ? day(due) : null,
  owner: null,
});

const red = campaign({
  slug: "rot",
  name: "Herbst Hund",
  brand: "Marke A",
  productLine: "Hund",
  markets: ["DE", "AT"],
  executionType: "agency",
  startDate: day("2026-10-01"),
  endDate: day("2026-11-30"),
  channels: [
    {
      id: "c1",
      name: "Social",
      funnelStage: "AWARENESS",
      assets: [asset("a1", "BRIEFING", "2026-10-20"), asset("a2", "IDEE", "2026-10-25"), asset("a3", "LIVE", "2026-10-01")],
    },
  ],
});
const yellow = campaign({
  slug: "gelb",
  name: "Winter Katze",
  brand: "Marke A",
  productLine: "Katze",
  markets: ["PL"],
  owner: { id: "u2", name: "Clara" },
  channels: [{ id: "c2", name: "Sampling", funnelStage: "CONSIDERATION", assets: [asset("a4", "BRIEFING", "2026-10-30")] }],
});
const green = campaign({
  slug: "gruen",
  name: "Frühjahr Snacks",
  brand: "Marke B",
  markets: ["DE", "PL"],
  startDate: day("2027-03-01"),
  endDate: day("2027-04-30"),
  channels: [{ id: "c3", name: "Amazon", funnelStage: "SALES", assets: [asset("a5", "IDEE", "2027-02-01")] }],
});

const summaries = summarizeCampaigns([green, yellow, red], NOW, config);
const filtered = (params: Record<string, string>) =>
  summaries.filter((s) => matchesFilters(s, parseFilters(params), config)).map((s) => s.campaign.slug);

describe("parseFilters / filtersToSearchParams", () => {
  it("parses, validates and round-trips URL parameters", () => {
    const filters = parseFilters({
      markt: "DE,XX",
      phase: ["LIVE", "PLANUNG"],
      ampel: "RED",
      umsetzung: "agency",
      von: "2026-11-01",
      bis: "kein-datum",
      q: "hund",
    });
    expect(filters).toMatchObject({
      markets: ["DE"],
      phases: ["LIVE", "PLANUNG"],
      lights: ["RED"],
      executionTypes: ["agency"],
      q: "hund",
    });
    expect(filters.from?.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(filters.to).toBeUndefined();
    expect(countActiveFilters(filters)).toBe(6);

    const params = filtersToSearchParams(filters, "ampel");
    expect(params.toString()).toBe(
      "q=hund&markt=DE&umsetzung=agency&phase=LIVE%2CPLANUNG&ampel=RED&von=2026-11-01&sortierung=ampel",
    );
    expect(parseFilters(Object.fromEntries(params))).toEqual(filters);
  });

  it("falls back to start sorting", () => {
    expect(parseSort({ sortierung: "ampel" })).toBe("ampel");
    expect(parseSort({ sortierung: "unsinn" })).toBe("start");
  });
});

describe("matchesFilters", () => {
  it("returns everything without filters", () => {
    expect(filtered({})).toEqual(["gruen", "gelb", "rot"]);
  });

  it("filters by market (any selected market)", () => {
    expect(filtered({ markt: "AT" })).toEqual(["rot"]);
    expect(filtered({ markt: "AT,PL" })).toEqual(["gruen", "gelb", "rot"]);
  });

  it("filters by brand, product line, owner and execution type", () => {
    expect(filtered({ marke: "Marke A" })).toEqual(["gelb", "rot"]);
    expect(filtered({ produktlinie: "Katze" })).toEqual(["gelb"]);
    expect(filtered({ owner: "u2" })).toEqual(["gelb"]);
    expect(filtered({ umsetzung: "agency" })).toEqual(["rot"]);
  });

  it("filters by derived phase and traffic light", () => {
    expect(filtered({ phase: "LIVE" })).toEqual(["rot"]);
    expect(filtered({ phase: "PLANUNG,IN_ARBEIT" })).toEqual(["gruen", "gelb"]);
    expect(filtered({ ampel: "YELLOW,GREEN" })).toEqual(["gruen", "gelb"]);
  });

  it("filters by overlapping period, inclusive", () => {
    expect(filtered({ von: "2026-12-01" })).toEqual(["gruen", "gelb"]);
    expect(filtered({ von: "2026-11-30", bis: "2026-11-30" })).toEqual(["gelb", "rot"]);
    expect(filtered({ bis: "2026-10-31" })).toEqual(["rot"]);
  });

  it("searches name, brand and product line case-insensitively", () => {
    expect(filtered({ q: "KATZE" })).toEqual(["gelb"]);
    expect(filtered({ q: "frühjahr" })).toEqual(["gruen"]);
    expect(filtered({ q: "marke b" })).toEqual(["gruen"]);
  });
});

describe("sortSummaries", () => {
  it("sorts by start date by default", () => {
    expect(sortSummaries(summaries, "start").map((s) => s.campaign.slug)).toEqual(["rot", "gelb", "gruen"]);
  });

  it("sorts by severity", () => {
    expect(sortSummaries(summaries, "ampel").map((s) => s.campaign.slug)).toEqual(["rot", "gelb", "gruen"]);
  });

  it("sorts by name (German collation)", () => {
    expect(sortSummaries(summaries, "name").map((s) => s.campaign.slug)).toEqual(["gruen", "rot", "gelb"]);
  });
});

describe("critical assets and stats", () => {
  it("lists overdue assets, most overdue first", () => {
    const list = overdueAssets(summaries, NOW, config);
    expect(list.map((a) => [a.assetId, a.daysUntilDue])).toEqual([
      ["a1", -8],
      ["a2", -3],
    ]);
    expect(list[0]).toMatchObject({ campaignSlug: "rot", channelName: "Social", funnelStage: "AWARENESS" });
  });

  it("lists assets due soon", () => {
    expect(dueSoonAssets(summaries, NOW, config).map((a) => [a.assetId, a.daysUntilDue])).toEqual([["a4", 2]]);
  });

  it("computes headline stats", () => {
    expect(dashboardStats(summaries)).toEqual({ campaigns: 3, live: 1, red: 1, overdueAssets: 2, dueSoonAssets: 1 });
  });

  it("collects filter options", () => {
    expect(filterOptions([red, yellow, green])).toEqual({
      brands: ["Marke A", "Marke B"],
      productLines: ["Hund", "Katze"],
      owners: [
        { id: "u1", name: "Anna" },
        { id: "u2", name: "Clara" },
      ],
    });
  });
});

describe("buildTimeline", () => {
  it("places periods on a common axis", () => {
    const timeline = buildTimeline(
      [
        { startDate: day("2026-11-01"), endDate: day("2026-11-10") },
        { startDate: day("2026-11-11"), endDate: day("2026-11-20") },
      ],
      day("2026-11-05"),
      config,
    )!;
    expect(timeline.bars).toEqual([
      { left: 0, width: 50 },
      { left: 50, width: 50 },
    ]);
    expect(timeline.today).toBeCloseTo(22.5);
  });

  it("hides today outside the range and handles empty input", () => {
    expect(buildTimeline([{ startDate: day("2027-01-01"), endDate: day("2027-01-31") }], NOW, config)?.today).toBeNull();
    expect(buildTimeline([], NOW, config)).toBeNull();
  });
});

describe("parseCompareSlugs", () => {
  it("deduplicates and caps the selection", () => {
    expect(parseCompareSlugs({ k: "a,b,a,c,d,e" })).toEqual(["a", "b", "c", "d"]);
    expect(parseCompareSlugs({})).toEqual([]);
  });
});
