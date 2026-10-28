// Builds the campaign mindmap: nodes with rolled-up status and positions from
// a left-to-right tree layout (campaign -> funnel stage -> channel -> asset).
// Pure and framework-independent; the React Flow view only renders the result.

import { statusConfig, type StatusConfig } from "@/lib/config";
import {
  FUNNEL_STAGES,
  FUNNEL_STAGE_LABELS,
  type AssetStatus,
  type CampaignPhase,
  type FunnelStage,
  type TrafficLight,
} from "@/lib/domain/enums";
import {
  isDueSoonAndBehind,
  isOverdue,
  rollupCampaign,
  summarizeAssets,
  type Progress,
} from "@/lib/status";

// ---------------------------------------------------------------------------
// Input

export interface MindmapAsset {
  id: string;
  title: string;
  assetType: string;
  status: string;
  dueDate: Date | null;
  owner: { name: string } | null;
  links?: readonly unknown[];
}

export interface MindmapChannel {
  id: string;
  name: string;
  funnelStage: string;
  channelType: { name: string };
  owner: { name: string } | null;
  kpiTargets: unknown;
  links?: readonly unknown[];
  assets: MindmapAsset[];
}

export interface MindmapCampaign {
  name: string;
  startDate: Date;
  endDate: Date;
  channels: MindmapChannel[];
}

// ---------------------------------------------------------------------------
// Output

// A type alias (not an interface) so it satisfies React Flow's Record<string, unknown> data constraint.
export type CampaignNodeData = {
  kind: "campaign";
  name: string;
  startDate: Date;
  endDate: Date;
  phase: CampaignPhase;
  trafficLight: TrafficLight;
  progress: Progress;
  overdueCount: number;
};

export type StageNodeData = {
  kind: "stage";
  stage: FunnelStage;
  label: string;
  trafficLight: TrafficLight;
  progress: Progress;
  childCount: number;
  collapsed: boolean;
};

export type ChannelNodeData = {
  kind: "channel";
  channelId: string;
  stage: FunnelStage;
  name: string;
  typeName: string;
  ownerName: string | null;
  trafficLight: TrafficLight;
  progress: Progress;
  kpiCount: number;
  linkCount: number;
  childCount: number;
  collapsed: boolean;
};

export type AssetNodeData = {
  kind: "asset";
  assetId: string;
  stage: FunnelStage;
  title: string;
  assetType: string;
  status: AssetStatus;
  dueDate: Date | null;
  ownerName: string | null;
  overdue: boolean;
  dueSoon: boolean;
  linkCount: number;
};

export type MindmapNodeData = CampaignNodeData | StageNodeData | ChannelNodeData | AssetNodeData;
export type MindmapNodeKind = MindmapNodeData["kind"];

export interface MindmapNode {
  id: string;
  type: MindmapNodeKind;
  position: { x: number; y: number };
  width: number;
  height: number;
  data: MindmapNodeData;
}

export interface MindmapEdge {
  id: string;
  source: string;
  target: string;
  stage: FunnelStage;
}

// ---------------------------------------------------------------------------
// Ids and layout constants

export const CAMPAIGN_NODE_ID = "campaign";
export const stageNodeId = (stage: FunnelStage) => `stage:${stage}`;
export const channelNodeId = (id: string) => `channel:${id}`;
export const assetNodeId = (id: string) => `asset:${id}`;

/** Parses a node id back into kind and entity id. */
export function parseNodeId(id: string): { kind: MindmapNodeKind; key: string } {
  if (id === CAMPAIGN_NODE_ID) return { kind: "campaign", key: "" };
  const [kind, key] = id.split(":") as [MindmapNodeKind, string];
  return { kind, key };
}

export const NODE_SIZE: Record<MindmapNodeKind, { width: number; height: number }> = {
  campaign: { width: 260, height: 112 },
  stage: { width: 210, height: 76 },
  channel: { width: 250, height: 76 },
  asset: { width: 250, height: 52 },
};

export const LAYOUT = {
  /** Horizontal space between columns. */
  columnGap: 72,
  /** Vertical space between sibling subtrees. */
  rowGap: 14,
  /** Extra space between the three funnel stages. */
  stageGap: 36,
};

const isStage = (value: string): value is FunnelStage => (FUNNEL_STAGES as readonly string[]).includes(value);

// ---------------------------------------------------------------------------
// Tree construction

interface TreeNode {
  id: string;
  kind: MindmapNodeKind;
  data: MindmapNodeData;
  children: TreeNode[];
  stage?: FunnelStage;
}

export interface BuildOptions {
  /** Ids of stage/channel nodes whose children are hidden. */
  collapsed?: ReadonlySet<string>;
  now?: Date;
  config?: StatusConfig;
}

function buildTree(campaign: MindmapCampaign, options: BuildOptions): TreeNode {
  const collapsed = options.collapsed ?? new Set<string>();
  const now = options.now ?? new Date();
  const config = options.config ?? statusConfig;
  const rollup = rollupCampaign(campaign, now, config);

  const stages: TreeNode[] = FUNNEL_STAGES.map((stage) => {
    const id = stageNodeId(stage);
    const channels = campaign.channels.filter((c) => c.funnelStage === stage);
    const isCollapsed = collapsed.has(id);

    const channelNodes: TreeNode[] = channels.map((channel) => {
      const channelId = channelNodeId(channel.id);
      const channelCollapsed = collapsed.has(channelId);
      const summary = summarizeAssets(channel.assets, now, config);
      const kpis = channel.kpiTargets && typeof channel.kpiTargets === "object" ? channel.kpiTargets : {};

      return {
        id: channelId,
        kind: "channel",
        stage,
        data: {
          kind: "channel",
          channelId: channel.id,
          stage,
          name: channel.name,
          typeName: channel.channelType.name,
          ownerName: channel.owner?.name ?? null,
          trafficLight: summary.trafficLight,
          progress: summary.progress,
          kpiCount: Object.keys(kpis).length,
          linkCount: channel.links?.length ?? 0,
          childCount: channel.assets.length,
          collapsed: channelCollapsed,
        },
        children: channelCollapsed
          ? []
          : channel.assets.map((asset) => ({
              id: assetNodeId(asset.id),
              kind: "asset" as const,
              stage,
              children: [],
              data: {
                kind: "asset" as const,
                assetId: asset.id,
                stage,
                title: asset.title,
                assetType: asset.assetType,
                status: asset.status as AssetStatus,
                dueDate: asset.dueDate,
                ownerName: asset.owner?.name ?? null,
                overdue: isOverdue(asset, now, config),
                dueSoon: isDueSoonAndBehind(asset, now, config),
                linkCount: asset.links?.length ?? 0,
              },
            })),
      };
    });

    return {
      id,
      kind: "stage",
      stage,
      data: {
        kind: "stage",
        stage,
        label: FUNNEL_STAGE_LABELS[stage],
        trafficLight: rollup.stages[stage].trafficLight,
        progress: rollup.stages[stage].progress,
        childCount: channels.length,
        collapsed: isCollapsed,
      },
      children: isCollapsed ? [] : channelNodes,
    };
  });

  return {
    id: CAMPAIGN_NODE_ID,
    kind: "campaign",
    data: {
      kind: "campaign",
      name: campaign.name,
      startDate: campaign.startDate,
      endDate: campaign.endDate,
      phase: rollup.campaign.phase,
      trafficLight: rollup.campaign.trafficLight,
      progress: rollup.campaign.progress,
      overdueCount: rollup.campaign.overdueCount,
    },
    children: stages,
  };
}

// ---------------------------------------------------------------------------
// Layout: every subtree gets a vertical band at least as tall as its node and
// as the sum of its children's bands; each node is centred in its band.

const DEPTH_KIND: MindmapNodeKind[] = ["campaign", "stage", "channel", "asset"];

function columnX(depth: number): number {
  let x = 0;
  for (let d = 0; d < depth; d++) x += NODE_SIZE[DEPTH_KIND[d]].width + LAYOUT.columnGap;
  return x;
}

function gapBetween(node: TreeNode): number {
  return node.kind === "campaign" ? LAYOUT.stageGap : LAYOUT.rowGap;
}

function bandHeight(node: TreeNode, cache: Map<string, number>): number {
  const cached = cache.get(node.id);
  if (cached != null) return cached;
  const own = NODE_SIZE[node.kind].height;
  const childrenTotal =
    node.children.reduce((sum, child) => sum + bandHeight(child, cache), 0) +
    Math.max(0, node.children.length - 1) * gapBetween(node);
  const height = Math.max(own, childrenTotal);
  cache.set(node.id, height);
  return height;
}

export function buildMindmap(
  campaign: MindmapCampaign,
  options: BuildOptions = {},
): { nodes: MindmapNode[]; edges: MindmapEdge[] } {
  const root = buildTree(campaign, options);
  const nodes: MindmapNode[] = [];
  const edges: MindmapEdge[] = [];
  const bands = new Map<string, number>();

  const place = (node: TreeNode, depth: number, top: number) => {
    const band = bandHeight(node, bands);
    const size = NODE_SIZE[node.kind];
    nodes.push({
      id: node.id,
      type: node.kind,
      position: { x: columnX(depth), y: top + (band - size.height) / 2 },
      width: size.width,
      height: size.height,
      data: node.data,
    });

    const gap = gapBetween(node);
    const childrenTotal =
      node.children.reduce((sum, c) => sum + bandHeight(c, bands), 0) + Math.max(0, node.children.length - 1) * gap;
    let cursor = top + (band - childrenTotal) / 2;
    for (const child of node.children) {
      const stage = child.stage ?? node.stage;
      if (stage && isStage(stage)) {
        edges.push({ id: `${node.id}->${child.id}`, source: node.id, target: child.id, stage });
      }
      place(child, depth + 1, cursor);
      cursor += bandHeight(child, bands) + gap;
    }
  };

  place(root, 0, 0);
  return { nodes, edges };
}

/** Ids of all collapsible nodes (stages and channels with children). */
export function collapsibleNodeIds(campaign: MindmapCampaign): string[] {
  return [
    ...FUNNEL_STAGES.map(stageNodeId),
    ...campaign.channels.filter((c) => c.assets.length > 0).map((c) => channelNodeId(c.id)),
  ];
}
