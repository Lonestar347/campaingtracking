import { describe, expect, it } from "vitest";
import {
  applyMapping,
  detectNumberFormat,
  extractTable,
  findMatchingMapping,
  matchChannel,
  parseReportDate,
  parseReportNumber,
  suggestMapping,
  summarizeValues,
  type CellValue,
  type ImportMapping,
} from "@/lib/kpi-import";
import { aggregationFor, computeActuals, lowerIsBetter } from "@/lib/kpi-import/actuals";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

const channels = [
  { id: "c-social", name: "Social Reach (Paid)", typeName: "Social Reach (Paid)" },
  { id: "c-tv", name: "CTV-Spot", typeName: "TV/CTV" },
];

describe("extractTable", () => {
  it("finds the header row below title rows, skips empty and total rows, makes headers unique", () => {
    const rows: CellValue[][] = [
      [null, null],
      ["Report Agentur X", null, null],
      [],
      ["Datum", "Kanal", "Klicks", "Klicks", null],
      ["01.11.2026", "Social", 10, 11, null],
      [null, null, null],
      ["Gesamt", null, 10, 11],
    ];
    expect(extractTable(rows)).toEqual({
      headers: ["Datum", "Kanal", "Klicks", "Klicks (2)"],
      rows: [["01.11.2026", "Social", 10, 11]],
      rowNumbers: [5],
      skippedTotals: [7],
    });
    expect(extractTable([[null], []]).headers).toEqual([]);
  });

  it("names empty header cells", () => {
    expect(extractTable([["A", null, "C"], [1, 2, 3]]).headers).toEqual(["A", "Column 2", "C"]);
  });

  it("handles single-column tables", () => {
    expect(extractTable([["Klicks"], [3], [4]])).toMatchObject({ headers: ["Klicks"], rows: [[3], [4]] });
  });
});

describe("parseReportNumber", () => {
  it.each([
    [1234.5, "de", 1234.5],
    ["1.234,5", "de", 1234.5],
    ["1.234.567", "de", 1234567],
    ["12,5 %", "de", 12.5],
    ["€ 3.000", "de", 3000],
    ["(250)", "de", -250],
    ["1,234.5", "en", 1234.5],
    ["0.75", "en", 0.75],
    ["2,000,000", "en", 2000000],
    ["0.75", "de", 0.75],
  ] as const)("%j (%s) -> %d", (input, format, expected) => {
    expect(parseReportNumber(input, format)).toBe(expected);
  });

  it.each([["abc"], [""], ["1,2,3"], [null], [true]] as const)("rejects %j", (input) => {
    expect(parseReportNumber(input, "de")).toBeNull();
  });
});

describe("detectNumberFormat", () => {
  it("detects German and English text numbers", () => {
    expect(detectNumberFormat(["1.234,50", "12,5", 7])).toBe("de");
    expect(detectNumberFormat(["1,234.50", "12.5", "3,000,000"])).toBe("en");
    expect(detectNumberFormat([1, 2, 3])).toBe("de");
  });
});

describe("parseReportDate", () => {
  it.each([
    [day("2026-11-03"), "2026-11-03"],
    [new Date("2026-11-03T15:30:00Z"), "2026-11-03"],
    [46329, "2026-11-03"],
    ["03.11.2026", "2026-11-03"],
    ["3.11.26", "2026-11-03"],
    ["03/11/2026", "2026-11-03"],
    ["2026-11-03 00:00:00", "2026-11-03"],
  ] as const)("%j -> %s", (input, expected) => {
    expect(parseReportDate(input)?.toISOString().slice(0, 10)).toBe(expected);
  });

  it.each([["31.02.2026"], ["morgen"], [12], [null]] as const)("rejects %j", (input) => {
    expect(parseReportDate(input)).toBeNull();
  });
});

const wideTable = extractTable([
  ["Datum", "Plattform", "impressions", "Klicks", "CTR %", "Kommentar"],
  ["01.11.2026", "Social Reach (Paid)", "1.000", 20, "2,0", "ok"],
  ["02.11.2026", "TV/CTV", "2.000", "", "1,5", ""],
  ["03.11.2026", "social reach paid", "x", 5, "1,0", "Nachtrag"],
  ["Summe", null, "3.000", 25, null, null],
]);

describe("suggestMapping", () => {
  it("suggests a wide mapping with known KPI names", () => {
    expect(suggestMapping(wideTable, ["Impressions", "Klicks"])).toEqual({
      layout: "wide",
      dateColumn: "Datum",
      channelColumn: "Plattform",
      numberFormat: "de",
      channelAliases: {},
      kpiColumns: [
        { column: "impressions", kpiName: "Impressions" },
        { column: "Klicks", kpiName: "Klicks" },
        { column: "CTR %", kpiName: "CTR %" },
      ],
    });
  });

  it("prefers an explicit date column over week numbers", () => {
    const table = extractTable([
      ["KW", "Datum", "Klicks"],
      [45, "02.11.2026", 3],
    ]);
    expect(suggestMapping(table)).toMatchObject({ dateColumn: "Datum", kpiColumns: [{ column: "Klicks", kpiName: "Klicks" }] });
  });

  it("suggests a long mapping when KPI and value columns exist", () => {
    const table = extractTable([
      ["Date", "Channel", "Metric", "Value", "Unit"],
      ["2026-11-01", "TV", "Reach", "1,500.5", ""],
    ]);
    expect(suggestMapping(table)).toMatchObject({
      layout: "long",
      kpiColumn: "Metric",
      valueColumn: "Value",
      unitColumn: "Unit",
      numberFormat: "en",
    });
  });
});

describe("applyMapping", () => {
  const mapping = suggestMapping(wideTable, ["Impressions", "Klicks"]);

  it("maps rows to values, reporting invalid numbers with row numbers", () => {
    const result = applyMapping(wideTable, mapping, { channels });
    expect(result.errors).toEqual([{ rowNumber: 4, column: "impressions", message: "“x” is not a valid number." }]);
    expect(result.values).toHaveLength(7);
    expect(result.values[0]).toEqual({
      rowNumber: 2,
      channelId: "c-social",
      kpiName: "Impressions",
      value: 1000,
      unit: null,
      date: day("2026-11-01"),
    });
    expect(result.values.filter((v) => v.channelId === "c-tv").map((v) => v.kpiName)).toEqual(["Impressions", "CTR %"]);
    expect(result.emptyCells).toBe(1);
    expect(result.warnings[0].message).toMatch(/Skipped 1 total row/);
    expect(result.dateRange).toEqual({ from: day("2026-11-01"), to: day("2026-11-03") });
  });

  it("reports unknown channels and resolves them via aliases", () => {
    const table = extractTable([
      ["Kanal", "Klicks"],
      ["Meta Ads", 5],
      ["YouTube", 7],
      ["CTV-Spot", 1],
    ]);
    const m: ImportMapping = { ...suggestMapping(table), channelColumn: "Kanal" };
    const first = applyMapping(table, m, { channels });
    expect(first.unknownChannels).toEqual(["Meta Ads", "YouTube"]);
    expect(first.dateRange).toBeNull();
    expect(first.errors[0].message).toBe("Unmapped channel: “Meta Ads”, “YouTube”.");

    const second = applyMapping(
      table,
      { ...m, channelAliases: { "meta ads": "Social Reach (Paid)", YouTube: "CTV-Spot" } },
      { channels },
    );
    expect(second.errors).toEqual([]);
    expect(second.values.map((v) => v.channelId)).toEqual(["c-social", "c-tv", "c-tv"]);
  });

  it("uses the default channel when there is no channel column", () => {
    const table = extractTable([["Klicks"], [3]]);
    const result = applyMapping(table, suggestMapping(table), { channels, defaultChannelId: "c-tv" });
    expect(result.values[0].channelId).toBe("c-tv");
    expect(result.warnings).toEqual([]);
  });

  it("reports missing columns and invalid dates", () => {
    const missing = applyMapping(wideTable, { ...mapping, dateColumn: "Tag" }, { channels });
    expect(missing.errors).toEqual([{ column: "Tag", message: "Column “Tag” is missing from the file." }]);

    const table = extractTable([["Datum", "Klicks"], ["gestern", 1], ["05.11.2026", "x"]]);
    const badDate = applyMapping(table, suggestMapping(table), { channels });
    expect(badDate.errors).toEqual([
      { rowNumber: 2, column: "Datum", message: "Invalid date “gestern”." },
      { rowNumber: 3, column: "Klicks", message: "“x” is not a valid number." },
    ]);
    // The period suggestion uses valid dates even from rows with other errors.
    expect(badDate.dateRange).toEqual({ from: day("2026-11-05"), to: day("2026-11-05") });
  });

  it("requires KPI and value columns in the long layout", () => {
    const result = applyMapping(wideTable, { ...mapping, layout: "long", kpiColumns: [] }, { channels });
    expect(result.errors[0].message).toMatch(/KPI and value columns/);
  });

  it("summarizes values per channel and KPI", () => {
    const result = applyMapping(wideTable, mapping, { channels });
    expect(summarizeValues(result.values).find((s) => s.channelId === "c-social" && s.kpiName === "Klicks")).toEqual({
      channelId: "c-social",
      kpiName: "Klicks",
      count: 2,
      sum: 25,
    });
  });
});

describe("matchChannel / findMatchingMapping", () => {
  it("matches by name or type name, ignoring case and punctuation", () => {
    expect(matchChannel("tv / ctv", channels)?.id).toBe("c-tv");
    expect(matchChannel("CTV Spot", channels)?.id).toBe("c-tv");
    expect(matchChannel("", channels)).toBeNull();
  });

  it("recognises the saved mapping of a source by its columns", () => {
    const saved = [
      { source: "Agentur A", mapping: { ...suggestMapping(wideTable), kpiColumns: [{ column: "Klicks", kpiName: "Klicks" }] } },
      { source: "Agentur B", mapping: { ...suggestMapping(wideTable), dateColumn: "Tag" } },
      { source: "Agentur C", mapping: suggestMapping(wideTable) },
    ];
    expect(findMatchingMapping(wideTable.headers, saved)?.source).toBe("Agentur C");
    expect(findMatchingMapping(["Foo"], saved)).toBeNull();
  });
});

describe("computeActuals", () => {
  it("aggregates sums and averages and computes achievement", () => {
    const result = computeActuals(
      [{ id: "c1", kpiTargets: { Klicks: 100, "CTR %": 2, CPM: 5, Reichweite: 1000 } }],
      [
        { channelId: "c1", kpiName: "klicks", value: 60 },
        { channelId: "c1", kpiName: "Klicks", value: 30 },
        { channelId: "c1", kpiName: "CTR %", value: 1 },
        { channelId: "c1", kpiName: "CTR %", value: 2 },
        { channelId: "c1", kpiName: "CPM", value: 4 },
        { channelId: "c1", kpiName: "Views", value: 7 },
        { channelId: "other", kpiName: "Klicks", value: 999 },
      ],
    );
    expect(result[0].kpis).toEqual([
      { kpiName: "Klicks", target: 100, actual: 90, aggregation: "sum", valueCount: 2, achievement: 0.9 },
      { kpiName: "CTR %", target: 2, actual: 1.5, aggregation: "avg", valueCount: 2, achievement: 0.75 },
      { kpiName: "CPM", target: 5, actual: 4, aggregation: "avg", valueCount: 1, achievement: 1.25 },
      { kpiName: "Reichweite", target: 1000, actual: null, aggregation: "sum", valueCount: 0, achievement: null },
      { kpiName: "Views", target: null, actual: 7, aggregation: "sum", valueCount: 1, achievement: null },
    ]);
  });

  it("classifies KPIs", () => {
    expect(aggregationFor("Öffnungsrate %")).toBe("avg");
    expect(aggregationFor("Umsatz")).toBe("sum");
    expect(lowerIsBetter("CPC")).toBe(true);
    expect(lowerIsBetter("ROAS")).toBe(false);
  });
});
