// Year timeline across all campaigns: bars per campaign and channel, asset
// milestones and the number of campaigns running in parallel per week (to spot
// collisions). Positions are fractions (0–1) of the year. Pure functions.

import { statusConfig, type StatusConfig } from "@/lib/config";
import { toDayNumber } from "@/lib/dates";
import { FUNNEL_STAGES, type FunnelStage } from "@/lib/domain/enums";
import { isOverdue } from "@/lib/status";

export interface YearCampaignInput {
  id: string;
  slug: string;
  name: string;
  startDate: Date;
  endDate: Date;
  channels: {
    id: string;
    name: string;
    funnelStage: string;
    startDate: Date | null;
    endDate: Date | null;
    assets: { id: string; title: string; status: string; dueDate: Date | null }[];
  }[];
}

export interface YearBar {
  left: number;
  width: number;
  /** The period continues before / after the visible year. */
  clippedStart: boolean;
  clippedEnd: boolean;
}

export interface YearChannelRow {
  id: string;
  name: string;
  stage: FunnelStage;
  bar: YearBar | null;
  inherited: boolean;
  assets: { id: string; title: string; status: string; at: number; dueDate: Date; overdue: boolean }[];
}

export interface YearCampaignRow {
  id: string;
  slug: string;
  name: string;
  startDate: Date;
  endDate: Date;
  bar: YearBar | null;
  channels: YearChannelRow[];
}

export interface YearTimeline {
  year: number;
  months: { label: string; at: number }[];
  today: number | null;
  rows: YearCampaignRow[];
  /** Campaigns running per ISO-like week of the year (Monday-based buckets of 7 days from Jan 1). */
  weeks: { at: number; width: number; count: number }[];
}

const MS_PER_DAY = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function buildYearTimeline(
  campaigns: readonly YearCampaignInput[],
  year: number,
  now: Date,
  config: StatusConfig = statusConfig,
): YearTimeline {
  const day = (d: Date) => toDayNumber(d, config.timeZone);
  const first = Date.UTC(year, 0, 1) / MS_PER_DAY;
  const end = Date.UTC(year + 1, 0, 1) / MS_PER_DAY; // exclusive
  const span = end - first;
  const pos = (n: number) => (n - first) / span;

  const bar = (start: Date, finish: Date): YearBar | null => {
    const s = day(start);
    const e = day(finish) + 1;
    if (e <= first || s >= end) return null;
    const from = Math.max(s, first);
    const to = Math.min(e, end);
    return { left: pos(from), width: (to - from) / span, clippedStart: s < first, clippedEnd: e > end };
  };

  const visible = campaigns.filter((c) => bar(c.startDate, c.endDate));
  const rows = [...visible]
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime() || a.name.localeCompare(b.name, "en-GB"))
    .map((c): YearCampaignRow => {
      const stageIndex = (s: string) => FUNNEL_STAGES.indexOf(s as FunnelStage);
      const channels = [...c.channels]
        .sort((a, b) => stageIndex(a.funnelStage) - stageIndex(b.funnelStage))
        .map((ch) => ({
          id: ch.id,
          name: ch.name,
          stage: ch.funnelStage as FunnelStage,
          bar: bar(ch.startDate ?? c.startDate, ch.endDate ?? c.endDate),
          inherited: !ch.startDate && !ch.endDate,
          assets: ch.assets
            .filter(
              (a): a is typeof a & { dueDate: Date } => !!a.dueDate && day(a.dueDate) >= first && day(a.dueDate) < end,
            )
            .map((a) => ({
              id: a.id,
              title: a.title,
              status: a.status,
              at: pos(day(a.dueDate) + 0.5),
              dueDate: a.dueDate,
              overdue: isOverdue(a, now, config),
            })),
        }));
      return {
        id: c.id,
        slug: c.slug,
        name: c.name,
        startDate: c.startDate,
        endDate: c.endDate,
        bar: bar(c.startDate, c.endDate),
        channels,
      };
    });

  const weeks: YearTimeline["weeks"] = [];
  for (let w = first; w < end; w += 7) {
    const wEnd = Math.min(w + 7, end);
    const count = visible.filter((c) => day(c.startDate) < wEnd && day(c.endDate) >= w).length;
    weeks.push({ at: pos(w), width: (wEnd - w) / span, count });
  }

  const today = day(now);
  return {
    year,
    months: MONTHS.map((label, m) => ({ label, at: pos(Date.UTC(year, m, 1) / MS_PER_DAY) })),
    today: today >= first && today < end ? pos(today + 0.5) : null,
    rows,
    weeks,
  };
}

/** Years that contain at least one campaign, plus the current year. */
export function timelineYears(campaigns: readonly { startDate: Date; endDate: Date }[], now: Date): number[] {
  const years = new Set<number>([now.getUTCFullYear()]);
  for (const c of campaigns) {
    for (let y = c.startDate.getUTCFullYear(); y <= c.endDate.getUTCFullYear(); y++) years.add(y);
  }
  return [...years].sort((a, b) => a - b);
}
