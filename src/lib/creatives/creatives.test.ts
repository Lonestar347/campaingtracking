import { describe, expect, it } from "vitest";
import {
  checkImage,
  creativeDataFromInput,
  creativeFormFromRecord,
  creativeFormSchema,
  creativeKpiOptions,
  creativeKpis,
  pickCover,
  rankCreatives,
  resolveRankingKpi,
  type CreativeKpi,
} from "@/lib/creatives";

const kpi = (kpiName: string, value: number): CreativeKpi => ({ kpiName, value, source: "manual", valueCount: 0 });

describe("creativeKpis", () => {
  it("sums counts and averages rates from imports", () => {
    const result = creativeKpis({}, [
      { kpiName: "Clicks", value: 100 },
      { kpiName: "clicks ", value: 50 },
      { kpiName: "CTR", value: 1 },
      { kpiName: "CTR", value: 2 },
    ]);
    expect(result).toEqual([
      { kpiName: "Clicks", value: 150, source: "import", valueCount: 2 },
      { kpiName: "CTR", value: 1.5, source: "import", valueCount: 2 },
    ]);
  });

  it("lets manual values replace imported ones (case-insensitive)", () => {
    const result = creativeKpis({ clicks: 999, Conversions: 12 }, [{ kpiName: "Clicks", value: 100 }]);
    expect(result).toEqual([
      { kpiName: "clicks", value: 999, source: "manual", valueCount: 0 },
      { kpiName: "Conversions", value: 12, source: "manual", valueCount: 0 },
    ]);
  });

  it("ignores invalid manual JSON", () => {
    expect(creativeKpis(null, [])).toEqual([]);
    expect(creativeKpis("nonsense", [])).toEqual([]);
  });
});

describe("ranking", () => {
  const creatives = [
    { id: "a", title: "Alpha", kpis: [kpi("CTR", 1.2), kpi("CPC", 0.8)] },
    { id: "b", title: "Bravo", kpis: [kpi("ctr", 2.5), kpi("CPC", 0.4)] },
    { id: "c", title: "Charlie", kpis: [kpi("Clicks", 10)] },
    { id: "d", title: "Delta", kpis: [kpi("CTR", 2.5)] },
  ];

  it("ranks highest first and breaks ties by title", () => {
    expect(rankCreatives(creatives, "CTR").map((r) => [r.rank, r.creative.id])).toEqual([
      [1, "b"],
      [2, "d"],
      [3, "a"],
    ]);
  });

  it("ranks cost KPIs lowest first", () => {
    expect(rankCreatives(creatives, "cpc").map((r) => r.creative.id)).toEqual(["b", "a"]);
  });

  it("respects the limit", () => {
    expect(rankCreatives(creatives, "CTR", 1)).toHaveLength(1);
  });

  it("offers KPIs by frequency and resolves the requested one", () => {
    const options = creativeKpiOptions(creatives);
    expect(options).toEqual(["CTR", "CPC", "Clicks"]);
    expect(resolveRankingKpi("cpc", options)).toBe("CPC");
    expect(resolveRankingKpi("Reach", options)).toBe("CTR");
    expect(resolveRankingKpi(undefined, [])).toBeNull();
  });
});

describe("pickCover", () => {
  const c = (id: string, sortOrder: number, imageKey: string | null, isCover = false) => ({
    id,
    sortOrder,
    imageKey,
    isCover,
  });

  it("prefers the marked cover with an image", () => {
    expect(pickCover([c("a", 0, "x"), c("b", 1, "y", true)])?.id).toBe("b");
  });

  it("falls back to the first creative with an image", () => {
    expect(pickCover([c("a", 2, "x"), c("b", 0, null, true), c("c", 1, "z")])?.id).toBe("c");
    expect(pickCover([c("a", 0, null)])).toBeNull();
  });
});

describe("checkImage", () => {
  it("detects PNG and JPEG from their content", () => {
    expect(checkImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d]))).toEqual({ ok: true, type: "image/png" });
    expect(checkImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toEqual({ ok: true, type: "image/jpeg" });
  });

  it("rejects SVG, empty and oversized files", () => {
    expect(checkImage(new TextEncoder().encode("<svg xmlns=…>")).ok).toBe(false);
    expect(checkImage(new Uint8Array()).ok).toBe(false);
    expect(checkImage(new Uint8Array(5 * 1024 * 1024 + 1)).ok).toBe(false);
  });
});

describe("creative form", () => {
  it("round-trips a record through form values", () => {
    const values = creativeFormFromRecord({
      title: "Reel",
      channelId: null,
      format: "9:16",
      notes: null,
      kpiValues: { CTR: 1.5 },
    });
    expect(values.kpis).toEqual([{ clientId: "k0", name: "CTR", target: "1.5" }]);
    const parsed = creativeFormSchema.parse(values);
    expect(creativeDataFromInput(parsed)).toEqual({
      title: "Reel",
      channelId: null,
      format: "9:16",
      notes: null,
      kpiValues: { CTR: 1.5 },
    });
  });

  it("requires a title and numeric values", () => {
    const result = creativeFormSchema.safeParse({
      title: " ",
      channelId: "",
      format: "",
      notes: "",
      kpis: [{ clientId: "1", name: "CTR", target: "abc" }],
    });
    expect(result.success).toBe(false);
  });
});
