import { describe, expect, it } from "vitest";
import {
  emptyCharterForm,
  errorsForStep,
  stepForPath,
  validateCharterForm,
  type CharterFormValues,
} from "@/lib/charter/form";
import { buildCampaignPlan, changedCharterSections, diffCharterLinks } from "@/lib/charter/plan";

function validForm(): CharterFormValues {
  const form = emptyCharterForm({ ownerId: "user-1" });
  form.basis = {
    ...form.basis,
    name: "  Testkampagne  ",
    brand: "Marke",
    markets: ["DE", "AT"],
    startDate: "2026-11-01",
    endDate: "2026-12-31",
    executionType: "agency",
    partners: "Agentur A\n\n  Produktion B  ",
  };
  form.strategy.objective = "Bekanntheit steigern";
  form.budget = { total: "100.000", byStage: { AWARENESS: "60.000", CONSIDERATION: "", SALES: "40.000" } };
  form.channels = [
    {
      clientId: "c1",
      channelTypeId: "type-tv",
      funnelStage: "AWARENESS",
      name: "TV/CTV",
      ownerId: "",
      startDate: "",
      endDate: "",
      kpis: [{ clientId: "k1", name: "Impressions", target: "5.000.000" }],
      assets: [
        { clientId: "a1", title: "Spot 20s", assetType: "VIDEO", format: "16:9", dueDate: "2026-10-20", ownerId: "user-2" },
      ],
    },
    {
      clientId: "c2",
      channelTypeId: "type-pos",
      funnelStage: "CONSIDERATION", // overridden default stage
      name: "POS",
      ownerId: "user-3",
      startDate: "2026-11-10",
      endDate: "2026-11-30",
      kpis: [],
      assets: [],
    },
  ];
  form.links.frontify = "https://example.frontify.com/x";
  form.stakeholders = [{ clientId: "s1", team: "Design", people: "Ben, , Clara ", role: "" }];
  return form;
}

describe("validateCharterForm", () => {
  it("parses a valid form", () => {
    const result = validateCharterForm(validForm());
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.basis.name).toBe("Testkampagne");
    expect(result.data.basis.partners).toEqual(["Agentur A", "Produktion B"]);
    expect(result.data.budget.total).toBe(10_000_000);
    expect(result.data.budget.byStage).toEqual({ AWARENESS: 6_000_000, CONSIDERATION: undefined, SALES: 4_000_000 });
    expect(result.data.stakeholders[0].people).toEqual(["Ben", "Clara"]);
  });

  it("reports required basis fields", () => {
    const result = validateCharterForm(emptyCharterForm());
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(Object.keys(errorsForStep(result.errors, "basis")).sort()).toEqual([
      "basis.endDate",
      "basis.executionType",
      "basis.markets",
      "basis.name",
      "basis.ownerId",
      "basis.startDate",
    ]);
  });

  it("rejects end before start, invalid money and an oversized budget split", () => {
    const form = validForm();
    form.basis.endDate = "2026-10-01";
    form.budget = { total: "1.000", byStage: { AWARENESS: "800", CONSIDERATION: "abc", SALES: "500" } };
    const result = validateCharterForm(form);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors["basis.endDate"]).toBe("Ende liegt vor dem Start");
    expect(result.errors["budget.byStage.CONSIDERATION"]).toMatch(/Ungültiger Betrag/);
  });

  it("flags a budget split above the total", () => {
    const form = validForm();
    form.budget = { total: "1.000", byStage: { AWARENESS: "800", CONSIDERATION: "", SALES: "500" } };
    const result = validateCharterForm(form);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors["budget.byStage"]).toMatch(/höher als das Gesamtbudget/);
  });

  it("validates channels, KPIs, assets and links", () => {
    const form = validForm();
    form.channels[0].kpis.push({ clientId: "k2", name: "impressions", target: "x" });
    form.channels[0].assets[0].title = "";
    form.links.sharepoint = "sharepoint/ordner";
    const result = validateCharterForm(form);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors["channels.0.kpis.1.name"]).toBe("KPI doppelt");
    expect(result.errors["channels.0.kpis.1.target"]).toBe("Zielwert als Zahl angeben");
    expect(result.errors["channels.0.assets.0.title"]).toBe("Titel angeben");
    expect(result.errors["links.sharepoint"]).toMatch(/URL/);
  });
});

describe("stepForPath", () => {
  it("maps field paths to wizard steps", () => {
    expect(stepForPath("basis.name")).toBe("basis");
    expect(stepForPath("channels.2.kpis.0.target")).toBe("channels");
    expect(stepForPath("channels.2.assets.0.title")).toBe("assets");
    expect(stepForPath("approvalProcess")).toBe("stakeholders");
    expect(stepForPath("budget.byStage")).toBe("budget");
  });
});

describe("buildCampaignPlan", () => {
  it("generates campaign, charter, links, channels and assets", () => {
    const result = validateCharterForm(validForm());
    if (!result.success) throw new Error("form should be valid");
    const plan = buildCampaignPlan(result.data);

    expect(plan.campaign).toMatchObject({
      name: "Testkampagne",
      budgetCents: 10_000_000,
      markets: ["DE", "AT"],
      ownerId: "user-1",
      executionType: "agency",
      objective: "Bekanntheit steigern",
    });
    expect(plan.charterData.basis?.startDate).toBe("2026-11-01");
    expect(plan.charterData.budget.byFunnelStageCents).toEqual({ AWARENESS: 6_000_000, SALES: 4_000_000 });
    expect(plan.links).toEqual([
      { type: "frontify", url: "https://example.frontify.com/x", label: "Frontify-Ordner", embed: false },
    ]);

    expect(plan.channels).toHaveLength(2);
    expect(plan.channels[0]).toMatchObject({
      funnelStage: "AWARENESS",
      kpiTargets: { Impressions: 5_000_000 },
      ownerId: null,
      sortOrder: 0,
    });
    expect(plan.channels[0].assets[0]).toMatchObject({
      title: "Spot 20s",
      status: "IDEE",
      ownerId: "user-2",
      dueDate: new Date("2026-10-20T00:00:00Z"),
    });
    expect(plan.channels[1]).toMatchObject({ funnelStage: "CONSIDERATION", ownerId: "user-3", assets: [] });
  });
});

describe("diffCharterLinks", () => {
  it("returns only changed links", () => {
    expect(
      diffCharterLinks(
        { frontify: "https://a", sharepoint: "https://s" },
        { frontify: "https://b", sharepoint: "https://s", lookerStudio: undefined },
      ),
    ).toEqual([{ type: "frontify", label: "Frontify-Ordner", remove: "https://a", add: "https://b" }]);
  });

  it("handles added and removed links", () => {
    expect(diffCharterLinks({ sharepoint: "https://s" }, { lookerStudio: "https://l" } as never)).toEqual([
      { type: "sharepoint", label: "SharePoint-Ordner", remove: "https://s", add: undefined },
      { type: "looker_studio", label: "Looker-Studio-Report", remove: undefined, add: "https://l" },
    ]);
  });
});

describe("changedCharterSections", () => {
  it("lists changed sections and ignores key order and undefined values", () => {
    const base = {
      strategy: { objective: "A", insight: undefined },
      budget: { totalCents: 100 },
      links: {},
      stakeholders: [],
    };
    const next = {
      strategy: { insight: undefined, objective: "A" },
      budget: { totalCents: 200 },
      links: {},
      stakeholders: [{ team: "Design", people: [] }],
    };
    expect(changedCharterSections(base, next)).toEqual(["Budget", "Stakeholder"]);
  });
});
