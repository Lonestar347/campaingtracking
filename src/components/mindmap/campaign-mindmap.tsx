"use client";

import * as React from "react";
import {
  Background,
  Controls,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ChevronsDownUp, ChevronsUpDown, Maximize } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FUNNEL_STAGES, FUNNEL_STAGE_LABELS, type FunnelStage } from "@/lib/domain/enums";
import {
  CAMPAIGN_NODE_ID,
  assetNodeId,
  buildMindmap,
  channelNodeId,
  parseNodeId,
  stageNodeId,
  type MindmapNodeData,
} from "@/lib/mindmap/graph";
import type { CampaignDetail, CharterFormOptions } from "@/lib/queries";
import { KpiDatalist } from "@/components/kpi-datalist";
import { MindmapActionsContext, nodeTypes } from "@/components/mindmap/nodes";
import { DetailPanel, type Selection, type TeamData } from "@/components/mindmap/detail-panel";

interface Props {
  campaign: CampaignDetail;
  options: CharterFormOptions;
  canEdit: boolean;
  /** Initially selected entity, e.g. from ?asset=<id>. */
  initialSelection?: Selection | null;
  team: TeamData;
}

const collapsedKey = (campaignId: string) => `campaign-tracker:mindmap-collapsed:${campaignId}`;

function readCollapsed(campaignId: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(collapsedKey(campaignId));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeCollapsed(campaignId: string, collapsed: Set<string>) {
  try {
    window.localStorage.setItem(collapsedKey(campaignId), JSON.stringify([...collapsed]));
  } catch {
    // Persisting the view state is a convenience only.
  }
}

/** Mindmap node id that represents a panel selection. */
function nodeIdFor(selection: Selection | null): string | null {
  if (!selection) return null;
  switch (selection.kind) {
    case "campaign":
      return CAMPAIGN_NODE_ID;
    case "stage":
    case "new-channel":
      return stageNodeId(selection.stage);
    case "channel":
      return channelNodeId(selection.id);
    case "new-asset":
      return channelNodeId(selection.channelId);
    case "asset":
      return assetNodeId(selection.id);
  }
}

/** Node ids that must be expanded so the selected entity is visible. */
function ancestorsOf(campaign: CampaignDetail, selection: Selection): string[] {
  const channelOf = (channelId: string) => campaign.channels.find((c) => c.id === channelId);
  switch (selection.kind) {
    case "channel":
    case "new-asset": {
      const id = selection.kind === "channel" ? selection.id : selection.channelId;
      const channel = channelOf(id);
      return channel ? [stageNodeId(channel.funnelStage as FunnelStage)] : [];
    }
    case "asset": {
      const channel = campaign.channels.find((c) => c.assets.some((a) => a.id === selection.id));
      return channel ? [stageNodeId(channel.funnelStage as FunnelStage), channelNodeId(channel.id)] : [];
    }
    default:
      return [];
  }
}

export function CampaignMindmap(props: Props) {
  return (
    <ReactFlowProvider>
      <MindmapCanvas {...props} />
    </ReactFlowProvider>
  );
}

function MindmapCanvas({ campaign, options, canEdit, initialSelection = null, team }: Props) {
  const { fitView } = useReactFlow();
  const [collapsed, setCollapsed] = React.useState<Set<string>>(() => new Set());
  const [selection, setSelection] = React.useState<Selection | null>(initialSelection);
  const [now, setNow] = React.useState<Date | null>(null);
  const focusAfterLayout = React.useRef<string | null>(null);

  // Client-only state: stored collapse state and "now" (avoids hydration mismatches).
  React.useEffect(() => {
    const stored = readCollapsed(campaign.id);
    if (initialSelection) for (const id of ancestorsOf(campaign, initialSelection)) stored.delete(id);
    setCollapsed(stored);
    setNow(new Date());
    if (initialSelection) focusAfterLayout.current = nodeIdFor(initialSelection);
    // Only on mount / campaign change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign.id]);

  const updateCollapsed = React.useCallback(
    (fn: (prev: Set<string>) => Set<string>) =>
      setCollapsed((prev) => {
        const next = fn(prev);
        writeCollapsed(campaign.id, next);
        return next;
      }),
    [campaign.id],
  );

  /** Select an entity from the panel: expand its ancestors and bring it into view. */
  const select = React.useCallback(
    (next: Selection | null) => {
      setSelection(next);
      if (!next) return;
      const ancestors = ancestorsOf(campaign, next);
      if (ancestors.some((id) => collapsed.has(id))) {
        updateCollapsed((prev) => {
          const copy = new Set(prev);
          ancestors.forEach((id) => copy.delete(id));
          return copy;
        });
      }
      focusAfterLayout.current = nodeIdFor(next);
    },
    [campaign, collapsed, updateCollapsed],
  );

  const commentCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of team.comments) counts.set(c.entityId, (counts.get(c.entityId) ?? 0) + 1);
    return counts;
  }, [team.comments]);

  const graph = React.useMemo(
    () => buildMindmap(campaign, { collapsed, now: now ?? undefined, commentCounts }),
    [campaign, collapsed, now, commentCounts],
  );

  const selectedNodeId = nodeIdFor(selection);

  const nodes: Node<MindmapNodeData>[] = React.useMemo(
    () =>
      graph.nodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        data: n.data,
        width: n.width,
        height: n.height,
        style: { width: n.width, height: n.height },
        selected: n.id === selectedNodeId,
      })),
    [graph.nodes, selectedNodeId],
  );

  const edges: Edge[] = React.useMemo(
    () =>
      graph.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: "default",
        style: { stroke: `var(--stage-${e.stage.toLowerCase()})`, strokeWidth: 2, opacity: 0.7 },
      })),
    [graph.edges],
  );

  // Bring a node selected via the panel (or deep link) into view once it is laid out.
  React.useEffect(() => {
    const target = focusAfterLayout.current;
    if (!target || !nodes.some((n) => n.id === target)) return;
    focusAfterLayout.current = null;
    requestAnimationFrame(() =>
      fitView({ nodes: [{ id: target }], duration: 400, maxZoom: 1.1, minZoom: 0.6, padding: 0.6 }),
    );
  }, [nodes, fitView]);

  const actions = React.useMemo(
    () => ({
      canEdit,
      onToggle: (nodeId: string) =>
        updateCollapsed((prev) => {
          const next = new Set(prev);
          if (next.has(nodeId)) next.delete(nodeId);
          else next.add(nodeId);
          return next;
        }),
      onAdd: (nodeId: string) => {
        const { kind, key } = parseNodeId(nodeId);
        if (kind === "stage") select({ kind: "new-channel", stage: key as FunnelStage });
        if (kind === "channel") select({ kind: "new-asset", channelId: key });
      },
    }),
    [canEdit, updateCollapsed, select],
  );

  const onNodeClick = (_: React.MouseEvent, node: Node) => {
    const { kind, key } = parseNodeId(node.id);
    if (kind === "campaign") setSelection({ kind: "campaign" });
    else if (kind === "stage") setSelection({ kind: "stage", stage: key as FunnelStage });
    else if (kind === "channel") setSelection({ kind: "channel", id: key });
    else setSelection({ kind: "asset", id: key });
  };

  const expandAll = () => updateCollapsed(() => new Set());
  const collapseAssets = () =>
    updateCollapsed(() => new Set(campaign.channels.filter((c) => c.assets.length > 0).map((c) => channelNodeId(c.id))));

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelection(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <MindmapActionsContext.Provider value={actions}>
      <KpiDatalist />
      <div className="relative flex h-[calc(100vh-15rem)] min-h-[560px] overflow-hidden rounded-xl border bg-background">
        <div className="relative min-w-0 flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodeClick={onNodeClick}
            onPaneClick={() => setSelection(null)}
            nodesDraggable={false}
            nodesConnectable={false}
            edgesFocusable={false}
            fitView
            fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
            minZoom={0.2}
            maxZoom={1.75}
            colorMode="system"
            proOptions={{ hideAttribution: true }}
            className="mindmap"
          >
            <Background gap={24} size={1} />
            <Controls showInteractive={false} position="bottom-right" />
            <Panel position="top-left" className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="outline" className="bg-card" onClick={expandAll}>
                <ChevronsUpDown /> Expand all
              </Button>
              <Button size="sm" variant="outline" className="bg-card" onClick={collapseAssets}>
                <ChevronsDownUp /> Collapse assets
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="bg-card"
                onClick={() => fitView({ padding: 0.15, duration: 300, maxZoom: 1 })}
              >
                <Maximize /> Fit view
              </Button>
            </Panel>
            <Panel position="bottom-left">
              <Legend />
            </Panel>
          </ReactFlow>
        </div>

        {selection && (
          <DetailPanel
            campaign={campaign}
            options={options}
            canEdit={canEdit}
            selection={selection}
            onSelect={select}
            team={team}
          />
        )}
      </div>
    </MindmapActionsContext.Provider>
  );
}

function Legend() {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="rounded-lg border bg-card text-xs shadow-sm">
      <button
        type="button"
        className="w-full px-2.5 py-1.5 text-left font-medium"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        Legend
      </button>
      {open && (
        <div className="space-y-2 border-t px-2.5 py-2">
          <div className="space-y-1">
            {[
              ["bg-status-red", "Critical: asset overdue"],
              ["bg-status-yellow", "At risk: due soon, not yet in approval"],
              ["bg-status-green", "On track"],
            ].map(([color, label]) => (
              <p key={label} className="flex items-center gap-2">
                <span className={cn("size-2.5 rounded-full", color)} /> {label}
              </p>
            ))}
          </div>
          <div className="space-y-1 border-t pt-2">
            {FUNNEL_STAGES.map((stage) => (
              <p key={stage} className="flex items-center gap-2">
                <span className="h-0.5 w-4 rounded" style={{ background: `var(--stage-${stage.toLowerCase()})` }} />
                {FUNNEL_STAGE_LABELS[stage]}
              </p>
            ))}
          </div>
          <p className="border-t pt-2 text-muted-foreground">x/y = assets done or live</p>
        </div>
      )}
    </div>
  );
}
