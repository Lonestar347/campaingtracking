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
import { isDueSoonAndBehind, isOverdue, rollupCampaign, summarizeAssets, type Progress } from "@/lib/status";

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
  id?: string;
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
  commentCount: number;
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
  commentCount: number;
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
  commentCount: number;
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

export type MindmapOrientation = "horizontal" | "vertical";

/** Handle ids on the nodes (see components/mindmap/nodes.tsx). */
export const HANDLES = {
  left: "in-left",
  top: "in-top",
  right: "out-right",
  bottom: "out-bottom",
  /** Bottom-left corner: feeds the vertical list of assets below a channel. */
  list: "out-list",
} as const;

export interface MindmapEdge {
  id: string;
  source: string;
  target: string;
  stage: FunnelStage;
  sourceHandle: string;
  targetHandle: string;
  /** "tree" = curved edge between levels, "list" = right-angled edge into a stacked list. */
  shape: "tree" | "list";
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

/** Top-down layout: rows per level, siblings side by side, assets as a list below their channel. */
export const VERTICAL_LAYOUT = {
  /** Vertical space between levels. */
  levelGap: 64,
  /** Horizontal space between sibling channels. */
  siblingGap: 24,
  /** Extra space between the three funnel stages. */
  stageGap: 56,
  /** Indent of the asset list below a channel, and the gap between its items. */
  listIndent: 28,
  listGap: 10,
  /** Gap between a channel and its first asset. */
  listTop: 26,
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
  /** Number of comments per campaign/channel/asset id. */
  commentCounts?: ReadonlyMap<string, number>;
  now?: Date;
  config?: StatusConfig;
  /** "horizontal" (left to right, default) or "vertical" (top-down, assets listed below their channel). */
  orientation?: MindmapOrientation;
}

function buildTree(campaign: MindmapCampaign, options: BuildOptions): TreeNode {
  const collapsed = options.collapsed ?? new Set<string>();
  const comments = (id: string) => options.commentCounts?.get(id) ?? 0;
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
          commentCount: comments(channel.id),
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
                commentCount: comments(asset.id),
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
      commentCount: campaign.id ? comments(campaign.id) : 0,
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
  if (options.orientation === "vertical") return layoutVertical(root);
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
        edges.push({
          id: `${node.id}->${child.id}`,
          source: node.id,
          target: child.id,
          stage,
          sourceHandle: HANDLES.right,
          targetHandle: HANDLES.left,
          shape: "tree",
        });
      }
      place(child, depth + 1, cursor);
      cursor += bandHeight(child, bands) + gap;
    }
  };

  place(root, 0, 0);
  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// Top-down layout: each subtree gets a horizontal band at least as wide as its
// node and the sum of its children's bands. Assets are not spread out but
// listed below their channel, so many assets do not make the map very wide.

function layoutVertical(root: TreeNode): { nodes: MindmapNode[]; edges: MindmapEdge[] } {
  const V = VERTICAL_LAYOUT;
  const nodes: MindmapNode[] = [];
  const edges: MindmapEdge[] = [];
  const cache = new Map<string, number>();
  const gap = (node: TreeNode) => (node.kind === "campaign" ? V.stageGap : V.siblingGap);

  const bandWidth = (node: TreeNode): number => {
    const cached = cache.get(node.id);
    if (cached != null) return cached;
    const own = NODE_SIZE[node.kind].width;
    let width: number;
    if (node.kind === "channel") {
      width = node.children.length > 0 ? Math.max(own, V.listIndent + NODE_SIZE.asset.width) : own;
    } else {
      const children =
        node.children.reduce((sum, c) => sum + bandWidth(c), 0) + Math.max(0, node.children.length - 1) * gap(node);
      width = Math.max(own, children);
    }
    cache.set(node.id, width);
    return width;
  };

  const rowY = [0];
  for (let d = 1; d < 3; d++) rowY[d] = rowY[d - 1] + NODE_SIZE[DEPTH_KIND[d - 1]].height + V.levelGap;

  const edge = (from: TreeNode, to: TreeNode, stage: FunnelStage, shape: "tree" | "list") =>
    edges.push({
      id: `${from.id}->${to.id}`,
      source: from.id,
      target: to.id,
      stage,
      sourceHandle: shape === "list" ? HANDLES.list : HANDLES.bottom,
      targetHandle: shape === "list" ? HANDLES.left : HANDLES.top,
      shape,
    });

  const place = (node: TreeNode, depth: number, left: number, inherited?: FunnelStage) => {
    const band = bandWidth(node);
    const ownStage = node.stage ?? inherited;
    const size = NODE_SIZE[node.kind];
    // Channels sit at the left of their band, so the asset list lines up below them.
    const x = node.kind === "channel" ? left : left + (band - size.width) / 2;
    const y = rowY[depth];
    nodes.push({
      id: node.id,
      type: node.kind,
      position: { x, y },
      width: size.width,
      height: size.height,
      data: node.data,
    });

    if (node.kind === "channel") {
      let cursor = y + size.height + V.listTop;
      for (const asset of node.children) {
        const a = NODE_SIZE.asset;
        nodes.push({
          id: asset.id,
          type: asset.kind,
          position: { x: x + V.listIndent, y: cursor },
          width: a.width,
          height: a.height,
          data: asset.data,
        });
        if (ownStage && isStage(ownStage)) edge(node, asset, ownStage, "list");
        cursor += a.height + V.listGap;
      }
      return;
    }

    const children =
      node.children.reduce((sum, c) => sum + bandWidth(c), 0) + Math.max(0, node.children.length - 1) * gap(node);
    let cursor = left + (band - children) / 2;
    for (const child of node.children) {
      const stage = child.stage ?? node.stage;
      if (stage && isStage(stage)) edge(node, child, stage, "tree");
      place(child, depth + 1, cursor, stage);
      cursor += bandWidth(child) + gap(node);
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
