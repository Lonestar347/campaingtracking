import { cn } from "@/lib/utils";
import {
  CAMPAIGN_PHASE_LABELS,
  FUNNEL_STAGE_LABELS,
  type CampaignPhase,
  type FunnelStage,
  type TrafficLight,
} from "@/lib/domain/enums";
import type { Progress } from "@/lib/status";
import { STAGE_STYLES } from "@/components/stage-styles";

const TRAFFIC_LIGHT_STYLES: Record<TrafficLight, { dot: string; label: string }> = {
  RED: { dot: "bg-status-red", label: "Kritisch" },
  YELLOW: { dot: "bg-status-yellow", label: "Achtung" },
  GREEN: { dot: "bg-status-green", label: "Im Plan" },
};

export function TrafficLightBadge({ value, className }: { value: TrafficLight; className?: string }) {
  const style = TRAFFIC_LIGHT_STYLES[value];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm font-medium", className)}>
      <span className={cn("size-2.5 rounded-full", style.dot)} aria-hidden />
      {style.label}
    </span>
  );
}

export function PhaseBadge({ value }: { value: CampaignPhase }) {
  return (
    <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
      {CAMPAIGN_PHASE_LABELS[value]}
    </span>
  );
}

export function MarketBadge({ market }: { market: string }) {
  return (
    <span className="rounded border px-1.5 py-0.5 text-xs font-semibold tracking-wide text-muted-foreground">
      {market}
    </span>
  );
}

export function StageDot({ stage }: { stage: FunnelStage }) {
  return (
    <span
      className={cn("inline-block size-2 rounded-full", STAGE_STYLES[stage].bg)}
      title={FUNNEL_STAGE_LABELS[stage]}
      aria-hidden
    />
  );
}

export function ProgressBar({ progress }: { progress: Progress }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-foreground/70" style={{ width: `${progress.ratio * 100}%` }} />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">
        {progress.done}/{progress.total}
      </span>
    </div>
  );
}
