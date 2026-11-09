import { describe, expect, it } from "vitest";
import {
  CAMPAIGN_NODE_ID,
  assetNodeId,
  buildMindmap,
  channelNodeId,
  collapsibleNodeIds,
  parseNodeId,
  stageNodeId,
  type MindmapCampaign,
  type MindmapNode,
} from "@/lib/mindmap/graph";
import type { StatusConfig } from "@/lib/config";

const NOW = new Date("2026-10-28T09:00:00Z");
const config: StatusConfig = { dueSoonDays: 7, timeZone: "Europe/Berlin", kpiGreenAt: 0.95, kpiYellowAt: 0.8 };
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

function asset(id: string, status: string, due: string | null = null) {
  return { id, title: `Asset ${id}`, assetType: "VIDEO", status, dueDate: due ? day(due) : null, owner: null };
}

const campaign: MindmapCampaign = {
  name: "Test",
  startDate: day("2026-11-01"),
  endDate: day("2026-12-31"),
  channels: [
    {
      id: "tv",
      name: "TV",
      funnelStage: "AWARENESS",
      channelType: { name: "TV/CTV" },
      owner: { name: "Anna" },
      kpiTargets: { Impressions: 1, Reach: 2 },
      assets: [asset("a1", "DONE"), asset("a2", "BRIEFING", "2026-10-20"), asset("a3", "IDEA")],
    },
    {
      id: "social",
      name: "Social",
      funnelStage: "AWARENESS",
      channelType: { name: "Social Reach (Paid)" },
      owner: null,
      kpiTargets: {},
      assets: [asset("a4", "BRIEFING", "2026-10-30")],
    },
    {
      id: "pos",
      name: "POS",
      funnelStage: "SALES",
      channelType: { name: "POS/Handel" },
      owner: null,
      kpiTargets: null,
      assets: [],
    },
  ],
};

const byId = (nodes: MindmapNode[]) => Object.fromEntries(nodes.map((n) => [n.id, n]));

function overlaps(a: MindmapNode, b: MindmapNode) {
  return (
    a.position.x < b.position.x + b.width &&
    b.position.x < a.position.x + a.width &&
    a.position.y < b.position.y + b.height &&
    b.position.y < a.position.y + a.height
  );
}

describe("buildMindmap", () => {
  it("creates campaign, all three stages, channels and assets with edges", () => {
    const { nodes, edges } = buildMindmap(campaign, { now: NOW, config });
    expect(nodes).toHaveLength(1 + 3 + 3 + 4);
    expect(edges).toHaveLength(3 + 3 + 4);
    expect(edges.find((e) => e.target === assetNodeId("a4"))).toMatchObject({
      source: channelNodeId("social"),
      stage: "AWARENESS",
    });
    expect(edges.find((e) => e.target === stageNodeId("SALES"))?.source).toBe(CAMPAIGN_NODE_ID);
  });

  it("rolls status up to channel, stage and campaign", () => {
    const nodes = byId(buildMindmap(campaign, { now: NOW, config }).nodes);
    expect(nodes[channelNodeId("tv")].data).toMatchObject({
      trafficLight: "RED",
      progress: { done: 1, total: 3 },
      kpiCount: 2,
      ownerName: "Anna",
    });
    expect(nodes[channelNodeId("social")].data).toMatchObject({ trafficLight: "YELLOW" });
    expect(nodes[stageNodeId("AWARENESS")].data).toMatchObject({
      trafficLight: "RED",
      progress: { done: 1, total: 4 },
      childCount: 2,
    });
    expect(nodes[stageNodeId("CONSIDERATION")].data).toMatchObject({ trafficLight: "GREEN", childCount: 0 });
    expect(nodes[CAMPAIGN_NODE_ID].data).toMatchObject({ trafficLight: "RED", overdueCount: 1, phase: "IN_PROGRESS" });
    expect(nodes[assetNodeId("a2")].data).toMatchObject({ overdue: true, dueSoon: false });
    expect(nodes[assetNodeId("a4")].data).toMatchObject({ overdue: false, dueSoon: true });
  });

  it("lays out columns left to right without overlapping nodes", () => {
    const { nodes } = buildMindmap(campaign, { now: NOW, config });
    const map = byId(nodes);
    expect(map[CAMPAIGN_NODE_ID].position.x).toBe(0);
    expect(map[stageNodeId("AWARENESS")].position.x).toBeGreaterThan(map[CAMPAIGN_NODE_ID].position.x);
    expect(map[channelNodeId("tv")].position.x).toBeGreaterThan(map[stageNodeId("AWARENESS")].position.x);
    expect(map[assetNodeId("a1")].position.x).toBeGreaterThan(map[channelNodeId("tv")].position.x);

    for (const a of nodes) for (const b of nodes) if (a !== b) expect(overlaps(a, b), `${a.id} vs ${b.id}`).toBe(false);
  });

  it("keeps funnel order top to bottom and centres parents on their children", () => {
    const map = byId(buildMindmap(campaign, { now: NOW, config }).nodes);
    const centerY = (id: string) => map[id].position.y + map[id].height / 2;
    expect(centerY(stageNodeId("AWARENESS"))).toBeLessThan(centerY(stageNodeId("CONSIDERATION")));
    expect(centerY(stageNodeId("CONSIDERATION"))).toBeLessThan(centerY(stageNodeId("SALES")));
    // Single child: parent and child are vertically aligned
    expect(centerY(channelNodeId("social"))).toBeCloseTo(centerY(assetNodeId("a4")));
    expect(centerY(stageNodeId("SALES"))).toBeCloseTo(centerY(channelNodeId("pos")));
  });

  it("hides children of collapsed nodes but keeps their counts and rollup", () => {
    const { nodes, edges } = buildMindmap(campaign, {
      now: NOW,
      config,
      collapsed: new Set([channelNodeId("tv"), stageNodeId("SALES")]),
    });
    const map = byId(nodes);
    expect(map[assetNodeId("a1")]).toBeUndefined();
    expect(map[channelNodeId("pos")]).toBeUndefined();
    expect(map[channelNodeId("tv")].data).toMatchObject({ collapsed: true, childCount: 3, trafficLight: "RED" });
    expect(map[stageNodeId("SALES")].data).toMatchObject({ collapsed: true, childCount: 1 });
    expect(edges.some((e) => e.target === assetNodeId("a1"))).toBe(false);
  });
});

describe("helpers", () => {
  it("parses node ids", () => {
    expect(parseNodeId(CAMPAIGN_NODE_ID)).toEqual({ kind: "campaign", key: "" });
    expect(parseNodeId(stageNodeId("SALES"))).toEqual({ kind: "stage", key: "SALES" });
    expect(parseNodeId(assetNodeId("x1"))).toEqual({ kind: "asset", key: "x1" });
  });

  it("lists collapsible nodes (stages and channels with assets)", () => {
    expect(collapsibleNodeIds(campaign)).toEqual([
      stageNodeId("AWARENESS"),
      stageNodeId("CONSIDERATION"),
      stageNodeId("SALES"),
      channelNodeId("tv"),
      channelNodeId("social"),
    ]);
  });
});

describe("vertical layout", () => {
  const graph = buildMindmap(campaign, { now: NOW, config, orientation: "vertical" });
  const map = Object.fromEntries(graph.nodes.map((n) => [n.id, n]));

  it("places levels top-down and lists assets below their channel", () => {
    expect(map[CAMPAIGN_NODE_ID].position.y).toBe(0);
    expect(map[stageNodeId("AWARENESS")].position.y).toBeGreaterThan(map[CAMPAIGN_NODE_ID].position.y);
    expect(map[channelNodeId("tv")].position.y).toBeGreaterThan(map[stageNodeId("AWARENESS")].position.y);
    const asset = map[assetNodeId("a1")];
    expect(asset.position.y).toBeGreaterThan(map[channelNodeId("tv")].position.y);
    expect(asset.position.x).toBeGreaterThan(map[channelNodeId("tv")].position.x);
  });

  it("orders the stages left to right without overlaps", () => {
    const xs = ["AWARENESS", "CONSIDERATION", "SALES"].map((s) => map[stageNodeId(s as never)].position.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    for (const a of graph.nodes) for (const b of graph.nodes) if (a !== b) expect(overlaps(a, b)).toBe(false);
  });

  it("connects levels from bottom to top and assets via the list handle", () => {
    const toStage = graph.edges.find((e) => e.target === stageNodeId("AWARENESS"))!;
    expect(toStage).toMatchObject({ sourceHandle: "out-bottom", targetHandle: "in-top", shape: "tree" });
    const toAsset = graph.edges.find((e) => e.target === assetNodeId("a1"))!;
    expect(toAsset).toMatchObject({ sourceHandle: "out-list", targetHandle: "in-left", shape: "list" });
  });
});
