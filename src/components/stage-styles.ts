import type { FunnelStage } from "@/lib/domain/enums";

/** Funnel stage colour classes, used consistently across all views. */
export const STAGE_STYLES: Record<FunnelStage, { bg: string; text: string; border: string; soft: string }> = {
  AWARENESS: {
    bg: "bg-stage-awareness",
    text: "text-stage-awareness",
    border: "border-stage-awareness",
    soft: "bg-stage-awareness/10",
  },
  CONSIDERATION: {
    bg: "bg-stage-consideration",
    text: "text-stage-consideration",
    border: "border-stage-consideration",
    soft: "bg-stage-consideration/10",
  },
  SALES: {
    bg: "bg-stage-sales",
    text: "text-stage-sales",
    border: "border-stage-sales",
    soft: "bg-stage-sales/10",
  },
};
