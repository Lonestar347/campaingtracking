// Backward schedule: from each asset's go-live (its channel start, else the
// campaign start) back to the latest dates for briefing, production and
// approval, using lead times per asset type. Pure functions.

import { statusConfig, type StatusConfig } from "@/lib/config";
import { toDayNumber } from "@/lib/dates";
import type { AssetType } from "@/lib/domain/enums";
import { DEFAULT_LEAD_TIMES, type LeadTime } from "@/lib/planning/defaults";

export interface ScheduleAsset {
  id: string;
  title: string;
  assetType: string;
  status: string;
  dueDate: Date | null;
  channelId: string;
  channelName: string;
  /** Go-live of the asset: its own go-live date, else the channel start, else the campaign start. */
  goLive: Date;
  goLiveSource: "asset" | "channel" | "campaign";
}

/** First phase whose latest start has passed while the asset has not reached it yet. */
export type ScheduleDelay = "briefing" | "production" | "approval" | "ready" | null;

export interface ScheduleRow extends ScheduleAsset {
  leadTime: LeadTime;
  briefingStart: Date;
  productionStart: Date;
  approvalStart: Date;
  /** Latest date to be approved and ready: the proposed due date. */
  readyBy: Date;
  delay: ScheduleDelay;
  /** Proposed due date differs from the current one. */
  changed: boolean;
  /** Done, live, paused or cancelled: no planning needed. */
  settled: boolean;
}

const MS_PER_DAY = 86_400_000;
const SETTLED = new Set(["DONE", "LIVE", "PAUSED", "CANCELLED"]);
/** Statuses that are past a phase's start. */
const REACHED: Record<Exclude<ScheduleDelay, null>, Set<string>> = {
  briefing: new Set(["BRIEFING", "IN_PRODUCTION", "APPROVAL", "DONE", "LIVE"]),
  production: new Set(["IN_PRODUCTION", "APPROVAL", "DONE", "LIVE"]),
  approval: new Set(["APPROVAL", "DONE", "LIVE"]),
  ready: new Set(["DONE", "LIVE"]),
};

export function leadTimeFor(assetType: string, leadTimes: Partial<Record<string, LeadTime>>): LeadTime {
  return leadTimes[assetType] ?? DEFAULT_LEAD_TIMES[assetType as AssetType] ?? DEFAULT_LEAD_TIMES.OTHER;
}

export function backwardSchedule(
  assets: readonly ScheduleAsset[],
  leadTimes: Partial<Record<string, LeadTime>>,
  bufferDays: number,
  now: Date,
  config: StatusConfig = statusConfig,
): ScheduleRow[] {
  const day = (d: Date) => toDayNumber(d, config.timeZone);
  const date = (n: number) => new Date(n * MS_PER_DAY);
  const today = day(now);

  return assets.map((asset) => {
    const leadTime = leadTimeFor(asset.assetType, leadTimes);
    const ready = day(asset.goLive) - bufferDays;
    const approval = ready - leadTime.approvalDays;
    const production = approval - leadTime.productionDays;
    const briefing = production - leadTime.briefingDays;
    const settled = SETTLED.has(asset.status);

    let delay: ScheduleDelay = null;
    if (!settled) {
      const phases: [Exclude<ScheduleDelay, null>, number][] = [
        ["ready", ready],
        ["approval", approval],
        ["production", production],
        ["briefing", briefing],
      ];
      // The latest phase that should have started already but has not been reached.
      delay = phases.find(([phase, start]) => start < today && !REACHED[phase].has(asset.status))?.[0] ?? null;
    }

    return {
      ...asset,
      leadTime,
      briefingStart: date(briefing),
      productionStart: date(production),
      approvalStart: date(approval),
      readyBy: date(ready),
      delay,
      changed: !asset.dueDate || day(asset.dueDate) !== ready,
      settled,
    };
  });
}

export const DELAY_LABELS: Record<Exclude<ScheduleDelay, null>, string> = {
  briefing: "Briefing is late",
  production: "Production should have started",
  approval: "Approval should have started",
  ready: "Should be ready already",
};
