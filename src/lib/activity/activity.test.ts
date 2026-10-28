import { describe, expect, it } from "vitest";
import {
  describeActivity,
  entriesFor,
  formatRelativeTime,
  groupByDay,
  mergeTimeline,
  type ActivityContext,
  type ActivityEntry,
  type CommentEntry,
} from "@/lib/activity";

const ctx: ActivityContext = {
  campaignName: "Autumn Campaign Dog",
  channels: new Map([["ch1", "Social Reach (Paid)"]]),
  assets: new Map([["as1", "Carousel ingredients"]]),
  users: new Map([["u1", "Anna Sample"]]),
};

const entry = (partial: Partial<ActivityEntry>): ActivityEntry => ({
  id: "e1",
  entityType: "asset",
  entityId: "as1",
  action: "status_changed",
  details: {},
  createdAt: new Date("2026-10-28T09:00:00Z"),
  user: { name: "Ben Mock" },
  ...partial,
});

describe("describeActivity", () => {
  it("describes status changes with labels and links to the asset", () => {
    expect(describeActivity(entry({ details: { from: "BRIEFING", to: "IN_PRODUCTION" } }), ctx)).toEqual({
      actor: "Ben Mock",
      text: "changed the status of “Carousel ingredients” from Briefing to In production",
      target: { kind: "asset", id: "as1" },
      note: undefined,
    });
  });

  it("lists changed fields with readable values", () => {
    const d = describeActivity(
      entry({
        action: "updated",
        details: {
          changes: [
            { field: "ownerId", from: null, to: "u1" },
            { field: "dueDate", from: null, to: "2026-11-05" },
            { field: "notes", from: "a", to: "b" },
          ],
        },
      }),
      ctx,
    );
    expect(d.text).toBe("updated asset “Carousel ingredients”: owner → Anna Sample, due date → 05/11/2026, notes");
  });

  it("uses names stored in the details for deleted objects and does not link them", () => {
    const d = describeActivity(entry({ entityId: "gone", action: "deleted", details: { title: "Old flyer" } }), ctx);
    expect(d).toMatchObject({ text: "deleted asset “Old flyer”", target: null });
  });

  it("describes channel moves, creation and deletion", () => {
    expect(
      describeActivity(
        entry({
          entityType: "channel",
          entityId: "ch1",
          action: "updated",
          details: { changes: [{ field: "funnelStage", from: "AWARENESS", to: "SALES" }] },
        }),
        ctx,
      ).text,
    ).toBe("moved channel “Social Reach (Paid)” from Awareness to Sales");
    expect(
      describeActivity(entry({ entityType: "channel", entityId: "new", action: "created", details: { name: "OOH", funnelStage: "AWARENESS" } }), ctx).text,
    ).toBe("created channel “OOH” in Awareness");
    expect(
      describeActivity(entry({ entityType: "channel", entityId: "x", action: "deleted", details: { name: "OOH", assets: 2 } }), ctx).text,
    ).toBe("deleted channel “OOH” and 2 assets");
  });

  it("describes campaign, charter, report and link entries", () => {
    expect(
      describeActivity(entry({ entityType: "campaign", entityId: "c1", action: "created", details: { channels: 1, assets: 3 } }), ctx),
    ).toMatchObject({ text: "created the campaign via the launch charter (1 channel, 3 assets)", target: { kind: "campaign" } });
    expect(
      describeActivity(
        entry({ entityType: "charter", entityId: "ch", action: "charter_updated", details: { version: 2, sections: ["Strategy"], changeNote: "New audience" } }),
        ctx,
      ),
    ).toMatchObject({ text: "saved launch charter version 2 (Strategy)", note: "New audience" });
    expect(
      describeActivity(
        entry({ entityType: "kpi_report", entityId: "r1", action: "imported", details: { fileName: "wk45.xlsx", source: "Sample Agency", values: 14 } }),
        ctx,
      ).text,
    ).toBe("imported report “wk45.xlsx” from Sample Agency (14 values)");
    expect(describeActivity(entry({ action: "link_added", details: { type: "frontify" } }), ctx).text).toBe(
      "added a Frontify link to “Carousel ingredients”",
    );
    expect(describeActivity(entry({ entityType: "campaign", entityId: "c1", action: "link_removed", details: { type: "other" } }), ctx).text).toBe(
      "removed a link from the campaign",
    );
  });

  it("falls back for unknown actors and actions", () => {
    expect(describeActivity(entry({ user: null, action: "archived" }), ctx)).toMatchObject({
      actor: "Someone",
      text: "archived “Carousel ingredients”",
    });
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-10-28T12:00:00Z");
  it.each([
    ["2026-10-28T11:59:30Z", "just now"],
    ["2026-10-28T11:55:00Z", "5 min ago"],
    ["2026-10-28T08:00:00Z", "4 h ago"],
    ["2026-10-27T20:00:00Z", "yesterday"],
    ["2026-10-24T12:00:00Z", "4 days ago"],
    ["2026-10-10T12:00:00Z", "10/10/2026"],
  ])("%s -> %s", (date, expected) => {
    expect(formatRelativeTime(new Date(date), now)).toBe(expected);
  });
});

describe("timeline", () => {
  const comment = (id: string, at: string): CommentEntry => ({
    id,
    entityType: "asset",
    entityId: "as1",
    body: "Hi",
    createdAt: new Date(at),
    updatedAt: new Date(at),
    author: { id: "u1", name: "Anna Sample" },
  });

  it("merges entries and comments newest first and groups them by day", () => {
    const now = new Date("2026-10-28T12:00:00Z");
    const items = mergeTimeline(
      [entry({ id: "a1", createdAt: new Date("2026-10-28T10:00:00Z") }), entry({ id: "a2", createdAt: new Date("2026-10-20T10:00:00Z") })],
      [comment("c1", "2026-10-28T11:00:00Z"), comment("c2", "2026-10-27T09:00:00Z")],
    );
    expect(items.map((i) => i.id)).toEqual(["c:c1", "a:a1", "c:c2", "a:a2"]);
    expect(groupByDay(items, now).map((g) => [g.label, g.items.length])).toEqual([
      ["Today", 2],
      ["Yesterday", 1],
      ["20/10/2026", 1],
    ]);
  });

  it("filters entries for an object", () => {
    const items = [
      { entityType: "asset", entityId: "as1" },
      { entityType: "asset", entityId: "as2" },
      { entityType: "charter", entityId: "x" },
      { entityType: "kpi_report", entityId: "r" },
      { entityType: "campaign", entityId: "c" },
    ];
    expect(entriesFor(items, "asset", "as1")).toHaveLength(1);
    expect(entriesFor(items, "campaign", "c").map((i) => i.entityType)).toEqual(["charter", "kpi_report", "campaign"]);
  });
});
