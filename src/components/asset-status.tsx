import { cn } from "@/lib/utils";
import { ASSET_STATUS_LABELS, type AssetStatus } from "@/lib/domain/enums";

/**
 * Asset status colours: neutral while in preparation, gold (CI accent) while
 * waiting for approval, green once done/live. Paused and cancelled are muted.
 * Overdue/due-soon is signalled separately with the traffic light colours.
 */
export const ASSET_STATUS_STYLES: Record<AssetStatus, { chip: string; node: string }> = {
  IDEE: { chip: "bg-muted text-muted-foreground", node: "border-border" },
  BRIEFING: { chip: "bg-muted text-foreground", node: "border-border" },
  IN_PRODUKTION: { chip: "bg-foreground/10 text-foreground", node: "border-foreground/30" },
  FREIGABE: { chip: "bg-josera-gold/30 text-foreground", node: "border-josera-gold" },
  FERTIG: { chip: "bg-status-green/15 text-status-green", node: "border-status-green/60" },
  LIVE: { chip: "bg-status-green text-white dark:text-black", node: "border-status-green" },
  PAUSIERT: { chip: "border border-dashed text-muted-foreground", node: "border-dashed border-border" },
  ABGEBROCHEN: { chip: "text-muted-foreground line-through", node: "border-border opacity-60" },
};

export function AssetStatusChip({ status, className }: { status: AssetStatus; className?: string }) {
  const style = ASSET_STATUS_STYLES[status] ?? ASSET_STATUS_STYLES.IDEE;
  return (
    <span className={cn("inline-flex shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium leading-tight", style.chip, className)}>
      {ASSET_STATUS_LABELS[status] ?? status}
    </span>
  );
}
