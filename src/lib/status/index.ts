// Derived status logic. Status is maintained on asset level only; channel,
// funnel stage and campaign derive progress, traffic light and phase from
// their assets.

import { statusConfig, type StatusConfig } from "@/lib/config";
import { daysBetween } from "@/lib/dates";
import {
  FUNNEL_STAGES,
  type AssetStatus,
  type CampaignPhase,
  type FunnelStage,
  type TrafficLight,
} from "@/lib/domain/enums";

/** Minimal asset shape the status logic needs. */
export interface StatusAsset {
  status: AssetStatus | string;
  dueDate: Date | null;
}

const DONE_STATUSES: ReadonlySet<string> = new Set<AssetStatus>(["DONE", "LIVE"]);

/** Statuses that count as "in approval or later" for the yellow rule. */
const APPROVAL_OR_LATER: ReadonlySet<string> = new Set<AssetStatus>(["APPROVAL", "DONE", "LIVE"]);

export function isDone(asset: StatusAsset): boolean {
  return DONE_STATUSES.has(asset.status);
}

/** Cancelled assets are out of scope: they count neither for progress nor for the traffic light. */
export function isCancelled(asset: StatusAsset): boolean {
  return asset.status === "CANCELLED";
}

export interface Progress {
  done: number;
  total: number;
  /** 0..1; 0 when there are no relevant assets. */
  ratio: number;
}

/** Share of assets in DONE or LIVE, e.g. 3/5. Cancelled assets are excluded. */
export function computeProgress(assets: readonly StatusAsset[]): Progress {
  const relevant = assets.filter((a) => !isCancelled(a));
  const done = relevant.filter(isDone).length;
  const total = relevant.length;
  return { done, total, ratio: total === 0 ? 0 : done / total };
}

/** Due date passed (before today) and asset not done. */
export function isOverdue(asset: StatusAsset, now: Date, config: StatusConfig = statusConfig): boolean {
  if (!asset.dueDate || isDone(asset) || isCancelled(asset)) return false;
  return daysBetween(now, asset.dueDate, config.timeZone) < 0;
}

/** Due today or within the next `dueSoonDays` days and not yet in approval or later. */
export function isDueSoonAndBehind(
  asset: StatusAsset,
  now: Date,
  config: StatusConfig = statusConfig,
): boolean {
  if (!asset.dueDate || isCancelled(asset) || APPROVAL_OR_LATER.has(asset.status)) return false;
  const days = daysBetween(now, asset.dueDate, config.timeZone);
  return days >= 0 && days <= config.dueSoonDays;
}

/**
 * RED: at least one asset overdue and not done.
 * YELLOW: at least one asset due within the threshold and not yet in approval.
 * GREEN: otherwise (including no assets at all).
 */
export function computeTrafficLight(
  assets: readonly StatusAsset[],
  now: Date,
  config: StatusConfig = statusConfig,
): TrafficLight {
  if (assets.some((a) => isOverdue(a, now, config))) return "RED";
  if (assets.some((a) => isDueSoonAndBehind(a, now, config))) return "YELLOW";
  return "GREEN";
}

export interface CampaignPhaseInput {
  startDate: Date;
  endDate: Date;
  assets: readonly StatusAsset[];
}

/**
 * - COMPLETED: end date has passed
 * - LIVE: campaign period has started, or any asset is already live
 * - IN_PROGRESS: any (non-cancelled) asset has moved beyond IDEA
 * - PLANNING: otherwise
 */
export function computeCampaignPhase(
  campaign: CampaignPhaseInput,
  now: Date,
  config: StatusConfig = statusConfig,
): CampaignPhase {
  if (daysBetween(campaign.endDate, now, config.timeZone) > 0) return "COMPLETED";
  if (daysBetween(campaign.startDate, now, config.timeZone) >= 0) return "LIVE";
  if (campaign.assets.some((a) => a.status === "LIVE")) return "LIVE";
  if (campaign.assets.some((a) => !isCancelled(a) && a.status !== "IDEA")) return "IN_PROGRESS";
  return "PLANNING";
}

export interface StatusSummary {
  progress: Progress;
  trafficLight: TrafficLight;
  overdueCount: number;
}

export function summarizeAssets(
  assets: readonly StatusAsset[],
  now: Date,
  config: StatusConfig = statusConfig,
): StatusSummary {
  return {
    progress: computeProgress(assets),
    trafficLight: computeTrafficLight(assets, now, config),
    overdueCount: assets.filter((a) => isOverdue(a, now, config)).length,
  };
}

/** Minimal channel shape for the rollup. */
export interface RollupChannel<A extends StatusAsset = StatusAsset> {
  funnelStage: FunnelStage | string;
  assets: readonly A[];
}

export interface CampaignRollup {
  campaign: StatusSummary & { phase: CampaignPhase };
  stages: Record<FunnelStage, StatusSummary>;
}

/** Rolls asset statuses up to funnel stages and the campaign. */
export function rollupCampaign(
  campaign: { startDate: Date; endDate: Date; channels: readonly RollupChannel[] },
  now: Date,
  config: StatusConfig = statusConfig,
): CampaignRollup {
  const allAssets = campaign.channels.flatMap((c) => c.assets);
  const stages = Object.fromEntries(
    FUNNEL_STAGES.map((stage) => [
      stage,
      summarizeAssets(
        campaign.channels.filter((c) => c.funnelStage === stage).flatMap((c) => c.assets),
        now,
        config,
      ),
    ]),
  ) as Record<FunnelStage, StatusSummary>;

  return {
    campaign: {
      ...summarizeAssets(allAssets, now, config),
      phase: computeCampaignPhase(
        { startDate: campaign.startDate, endDate: campaign.endDate, assets: allAssets },
        now,
        config,
      ),
    },
    stages,
  };
}
