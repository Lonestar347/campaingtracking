import { describe, expect, it } from "vitest";
import {
  assetDataFromInput,
  assetEditSchema,
  assetFormFromRecord,
  channelDataFromInput,
  channelEditSchema,
  channelFormFromRecord,
  diffFields,
  emptyAssetForm,
  emptyChannelForm,
  validate,
} from "@/lib/entities/forms";

describe("channel form", () => {
  it("round-trips a record through form and back", () => {
    const record = {
      channelTypeId: "t1",
      name: "Social Reach",
      funnelStage: "AWARENESS",
      ownerId: null,
      startDate: new Date("2026-11-01T00:00:00Z"),
      endDate: null,
      kpiTargets: { Reichweite: 2_000_000, "CTR %": 1.25 },
      notes: null,
    };
    const form = channelFormFromRecord(record);
    expect(form.kpis.map((k) => k.target)).toEqual(["2.000.000", "1,25"]);

    const result = validate(channelEditSchema, form);
    if (!result.success) throw new Error(JSON.stringify(result.errors));
    expect(channelDataFromInput(result.data)).toEqual({ ...record, ownerId: null, notes: null });
  });

  it("validates required fields, dates and KPIs", () => {
    const form = {
      ...emptyChannelForm(),
      startDate: "2026-12-01",
      endDate: "2026-11-01",
      kpis: [
        { clientId: "a", name: "Klicks", target: "100" },
        { clientId: "b", name: "klicks", target: "viel" },
      ],
    };
    const result = validate(channelEditSchema, form);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors).toMatchObject({
      channelTypeId: "Kanaltyp wählen",
      name: "Namen angeben",
      funnelStage: "Funnel-Stufe wählen",
      "kpis.1.name": "KPI doppelt",
      "kpis.1.target": "Zielwert als Zahl angeben",
    });
  });

  it("checks the date order once the other fields are valid", () => {
    const form = {
      ...emptyChannelForm({ funnelStage: "SALES", channelTypeId: "t1", name: "POS" }),
      startDate: "2026-12-01",
      endDate: "2026-11-01",
    };
    const result = validate(channelEditSchema, form);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors).toEqual({ endDate: "Ende liegt vor dem Start" });
  });
});

describe("asset form", () => {
  it("defaults to status IDEE and requires title and type", () => {
    const result = validate(assetEditSchema, emptyAssetForm());
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(Object.keys(result.errors).sort()).toEqual(["assetType", "title"]);
  });

  it("round-trips a record", () => {
    const record = {
      title: "Reel",
      assetType: "VIDEO",
      format: "9:16",
      status: "FREIGABE",
      dueDate: new Date("2026-11-20T00:00:00Z"),
      ownerId: "u1",
      approverId: null,
      notes: "Bitte prüfen",
    };
    const result = validate(assetEditSchema, assetFormFromRecord(record));
    if (!result.success) throw new Error(JSON.stringify(result.errors));
    expect(assetDataFromInput(result.data)).toEqual(record);
  });

  it("rejects unknown statuses", () => {
    const result = validate(assetEditSchema, { ...emptyAssetForm(), title: "x", assetType: "VIDEO", status: "DONE" });
    expect(result.success).toBe(false);
  });
});

describe("diffFields", () => {
  it("reports changed fields only, comparing dates by day", () => {
    const before = {
      title: "A",
      status: "BRIEFING",
      dueDate: new Date("2026-11-20T00:00:00Z") as Date | null,
      ownerId: null as string | null,
      kpiTargets: { a: 1 } as unknown,
    };
    const after = {
      title: "A",
      status: "IN_PRODUKTION",
      dueDate: new Date("2026-11-20T00:00:00Z"),
      ownerId: "u1",
      kpiTargets: { a: 1 },
    };
    expect(diffFields(before, after)).toEqual([
      { field: "status", from: "BRIEFING", to: "IN_PRODUKTION" },
      { field: "ownerId", from: null, to: "u1" },
    ]);
  });
});
