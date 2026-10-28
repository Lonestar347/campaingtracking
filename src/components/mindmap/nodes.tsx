"use client";

import * as React from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { ChevronLeft, ChevronRight, Link2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { ASSET_TYPE_LABELS, CAMPAIGN_PHASE_LABELS, type AssetType, type TrafficLight } from "@/lib/domain/enums";
import { formatDate, formatDateRange } from "@/lib/dates";
import type {
  AssetNodeData,
  CampaignNodeData,
  ChannelNodeData,
  StageNodeData,
} from "@/lib/mindmap/graph";
import type { Progress } from "@/lib/status";
import { STAGE_STYLES } from "@/components/stage-styles";
import { ASSET_STATUS_STYLES, AssetStatusChip } from "@/components/asset-status";

// Callbacks from the canvas, shared via context so node components stay pure.
export interface MindmapNodeActions {
  canEdit: boolean;
  onToggle: (nodeId: string) => void;
  onAdd: (nodeId: string) => void;
}

export const MindmapActionsContext = React.createContext<MindmapNodeActions>({
  canEdit: false,
  onToggle: () => {},
  onAdd: () => {},
});

const LIGHT_BORDER: Record<TrafficLight, string> = {
  RED: "border-l-status-red",
  YELLOW: "border-l-status-yellow",
  GREEN: "border-l-status-green",
};
const LIGHT_DOT: Record<TrafficLight, string> = {
  RED: "bg-status-red",
  YELLOW: "bg-status-yellow",
  GREEN: "bg-status-green",
};
const LIGHT_LABEL: Record<TrafficLight, string> = { RED: "Kritisch", YELLOW: "Achtung", GREEN: "Im Plan" };

function LightDot({ light }: { light: TrafficLight }) {
  return <span className={cn("inline-block size-2.5 shrink-0 rounded-full", LIGHT_DOT[light])} title={LIGHT_LABEL[light]} />;
}

function MiniProgress({ progress, className }: { progress: Progress; className?: string }) {
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-foreground/60" style={{ width: `${progress.ratio * 100}%` }} />
      </div>
      <span className="text-[11px] tabular-nums text-muted-foreground">
        {progress.done}/{progress.total}
      </span>
    </div>
  );
}

const hiddenHandle = "!h-1 !w-1 !min-h-0 !min-w-0 !border-0 !bg-transparent";

function Handles({ target = true, source = true }: { target?: boolean; source?: boolean }) {
  return (
    <>
      {target && <Handle type="target" position={Position.Left} isConnectable={false} className={hiddenHandle} />}
      {source && <Handle type="source" position={Position.Right} isConnectable={false} className={hiddenHandle} />}
    </>
  );
}

/** Small round button attached to the right edge of a node. */
function NodeButton({
  label,
  onClick,
  children,
  className,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "nodrag nopan flex h-6 min-w-6 items-center justify-center gap-0.5 rounded-full border bg-card px-1 text-[11px] font-semibold shadow-sm transition-colors hover:bg-muted",
        className,
      )}
    >
      {children}
    </button>
  );
}

function NodeControls({
  id,
  collapsed,
  childCount,
  addLabel,
}: {
  id: string;
  collapsed: boolean;
  childCount: number;
  addLabel: string;
}) {
  const { canEdit, onToggle, onAdd } = React.useContext(MindmapActionsContext);
  return (
    <div className="absolute -right-3 top-1/2 flex -translate-y-1/2 flex-col gap-1">
      {childCount > 0 && (
        <NodeButton label={collapsed ? "Ausklappen" : "Einklappen"} onClick={() => onToggle(id)}>
          {collapsed ? (
            <>
              {childCount}
              <ChevronRight className="size-3" />
            </>
          ) : (
            <ChevronLeft className="size-3.5" />
          )}
        </NodeButton>
      )}
      {canEdit && (
        <NodeButton label={addLabel} onClick={() => onAdd(id)}>
          <Plus className="size-3.5" />
        </NodeButton>
      )}
    </div>
  );
}

const nodeBase =
  "relative h-full w-full rounded-lg border bg-card text-card-foreground shadow-sm transition-shadow hover:shadow-md";
const selectedRing = "ring-2 ring-ring ring-offset-2 ring-offset-background";

export function CampaignNode({ data, selected }: NodeProps<Node<CampaignNodeData>>) {
  return (
    <div className={cn(nodeBase, "border-t-4 border-t-josera-gold px-3.5 py-2.5", selected && selectedRing)}>
      <Handles target={false} />
      <div className="flex items-start gap-2">
        <p className="line-clamp-2 flex-1 font-semibold leading-tight">{data.name}</p>
        <LightDot light={data.trafficLight} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{formatDateRange(data.startDate, data.endDate)}</p>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="rounded bg-secondary px-1.5 py-0.5 text-[11px] font-medium">
          {CAMPAIGN_PHASE_LABELS[data.phase]}
        </span>
        <MiniProgress progress={data.progress} className="flex-1" />
      </div>
    </div>
  );
}

export function StageNode({ id, data, selected }: NodeProps<Node<StageNodeData>>) {
  const style = STAGE_STYLES[data.stage];
  return (
    <div className={cn(nodeBase, "border-l-4 px-3 py-2", style.border, selected && selectedRing)}>
      {/* Tint on top of the opaque card background, so edges don't shine through. */}
      <div className={cn("pointer-events-none absolute inset-0 rounded-[inherit]", style.soft)} aria-hidden />
      <Handles />
      <div className="flex items-center gap-2 pr-2">
        <span className={cn("flex-1 font-semibold", style.text)}>{data.label}</span>
        <LightDot light={data.trafficLight} />
      </div>
      <p className="text-[11px] text-muted-foreground">
        {data.childCount === 1 ? "1 Kanal" : `${data.childCount} Kanäle`}
      </p>
      <MiniProgress progress={data.progress} className="mt-1 pr-2" />
      <NodeControls id={id} collapsed={data.collapsed} childCount={data.childCount} addLabel="Kanal hinzufügen" />
    </div>
  );
}

export function ChannelNode({ id, data, selected }: NodeProps<Node<ChannelNodeData>>) {
  return (
    <div className={cn(nodeBase, "border-l-4 px-3 py-2", LIGHT_BORDER[data.trafficLight], selected && selectedRing)}>
      <Handles />
      <div className="flex items-center gap-2 pr-2">
        <span className="min-w-0 flex-1 truncate font-medium" title={data.name}>
          {data.name}
        </span>
        <LightDot light={data.trafficLight} />
      </div>
      <p className="truncate pr-2 text-[11px] text-muted-foreground">
        {data.typeName !== data.name ? `${data.typeName} · ` : ""}
        {data.ownerName ?? "Owner offen"}
        {data.kpiCount > 0 && ` · ${data.kpiCount} KPI`}
        {data.linkCount > 0 && (
          <span title={`${data.linkCount} Link(s)`}>
            {" · "}
            <Link2 className="inline size-3 align-[-2px]" aria-label="Links" /> {data.linkCount}
          </span>
        )}
      </p>
      <MiniProgress progress={data.progress} className="mt-1 pr-2" />
      <NodeControls id={id} collapsed={data.collapsed} childCount={data.childCount} addLabel="Asset hinzufügen" />
    </div>
  );
}

export function AssetNode({ data, selected }: NodeProps<Node<AssetNodeData>>) {
  const statusStyle = ASSET_STATUS_STYLES[data.status] ?? ASSET_STATUS_STYLES.IDEE;
  return (
    <div
      className={cn(
        nodeBase,
        "flex flex-col justify-center gap-1 px-2.5 py-1.5",
        statusStyle.node,
        data.overdue && "border-status-red",
        selected && selectedRing,
      )}
    >
      <Handles source={false} />
      <div className="flex items-center gap-2">
        <span
          className={cn("min-w-0 flex-1 truncate text-sm", data.status === "ABGEBROCHEN" && "line-through")}
          title={data.title}
        >
          {data.title}
        </span>
        <AssetStatusChip status={data.status} />
      </div>
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span>{ASSET_TYPE_LABELS[data.assetType as AssetType] ?? data.assetType}</span>
        {data.linkCount > 0 && (
          <span className="inline-flex items-center gap-0.5" title={`${data.linkCount} Link(s)`}>
            <Link2 className="size-3" aria-label="Links" /> {data.linkCount}
          </span>
        )}
        {data.dueDate && (
          <span
            className={cn(
              "ml-auto tabular-nums",
              data.overdue && "font-semibold text-status-red",
              data.dueSoon && "font-medium text-status-yellow",
            )}
            title={data.overdue ? "Überfällig" : data.dueSoon ? "Bald fällig" : "Fällig"}
          >
            {data.overdue ? "überfällig · " : ""}
            {formatDate(data.dueDate)}
          </span>
        )}
      </div>
    </div>
  );
}

export const nodeTypes = {
  campaign: CampaignNode,
  stage: StageNode,
  channel: ChannelNode,
  asset: AssetNode,
};
