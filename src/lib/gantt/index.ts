// Campaign Gantt chart below the mind map: campaign period, channels as bars
// and asset due dates as milestones, grouped by funnel stage. Positions are
// fractions (0–1) of the visible range. Pure functions.

import { statusConfig, type StatusConfig } from "@/lib/config";
import { toDayNumber } from "@/lib/dates";
import { FUNNEL_STAGES, type FunnelStage } from "@/lib/domain/enums";
import { isDueSoonAndBehind, isOverdue } from "@/lib/status";

export interface GanttInput {
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

export interface GanttBar {
  /** Left edge and width as fractions of the range. */
  left: number;
  width: number;
}

export type GanttRow =
  | { kind: "campaign"; id: string; label: string; bar: GanttBar }
  | { kind: "stage"; id: string; stage: FunnelStage; label: string; bar: GanttBar | null }
  | {
      kind: "channel";
      id: string;
      stage: FunnelStage;
      label: string;
      bar: GanttBar;
      /** True if the channel has no own dates and spans the campaign period. */
      inherited: boolean;
    }
  | {
      kind: "asset";
      id: string;
      stage: FunnelStage;
      channelId: string;
      label: string;
      status: string;
      /** Position of the due date, null without due date. */
      at: number | null;
      dueDate: Date | null;
      overdue: boolean;
      dueSoon: boolean;
    };

export interface GanttTick {
  at: number;
  label: string;
}

export interface Gantt {
  from: Date;
  to: Date;
  rows: GanttRow[];
  ticks: GanttTick[];
  /** Position of today, null if outside the range. */
  today: number | null;
}

const MS_PER_DAY = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const fromDayNumber = (n: number) => new Date(n * MS_PER_DAY);

/**
 * Builds the rows of the chart. The range covers the campaign, all channel
 * periods and asset due dates, padded by a few days. Bars include their end day.
 */
export function buildGantt(
  input: GanttInput,
  now: Date,
  labels: Record<FunnelStage, string>,
  config: StatusConfig = statusConfig,
): Gantt {
  const tz = config.timeZone;
  const day = (d: Date) => toDayNumber(d, tz);
  const all = [
    input.startDate,
    input.endDate,
    ...input.channels.flatMap((c) => [c.startDate, c.endDate, ...c.assets.map((a) => a.dueDate)]),
  ].filter((d): d is Date => !!d);
  const first = Math.min(...all.map(day)) - 3;
  const last = Math.max(...all.map(day)) + 4; // exclusive end, incl. the last day
  const span = last - first;
  const pos = (n: number) => (n - first) / span;
  const bar = (start: Date, end: Date): GanttBar => {
    const [s, e] = [day(start), day(end) + 1];
    return { left: pos(Math.min(s, e - 1)), width: Math.max(e - s, 1) / span };
  };

  const rows: GanttRow[] = [
    { kind: "campaign", id: "campaign", label: "Campaign", bar: bar(input.startDate, input.endDate) },
  ];
  for (const stage of FUNNEL_STAGES) {
    const channels = input.channels.filter((c) => c.funnelStage === stage);
    if (channels.length === 0) continue;
    const periods = channels.map((c) => [c.startDate ?? input.startDate, c.endDate ?? input.endDate] as const);
    const stageStart = new Date(Math.min(...periods.map(([s]) => s.getTime())));
    const stageEnd = new Date(Math.max(...periods.map(([, e]) => e.getTime())));
    rows.push({ kind: "stage", id: stage, stage, label: labels[stage], bar: bar(stageStart, stageEnd) });
    for (const channel of channels) {
      rows.push({
        kind: "channel",
        id: channel.id,
        stage,
        label: channel.name,
        bar: bar(channel.startDate ?? input.startDate, channel.endDate ?? input.endDate),
        inherited: !channel.startDate && !channel.endDate,
      });
      for (const asset of channel.assets) {
        rows.push({
          kind: "asset",
          id: asset.id,
          stage,
          channelId: channel.id,
          label: asset.title,
          status: asset.status,
          // Milestone in the middle of its day.
          at: asset.dueDate ? pos(day(asset.dueDate) + 0.5) : null,
          dueDate: asset.dueDate,
          overdue: isOverdue(asset, now, config),
          dueSoon: isDueSoonAndBehind(asset, now, config),
        });
      }
    }
  }

  const todayDay = day(now);
  return {
    from: fromDayNumber(first),
    to: fromDayNumber(last - 1),
    rows,
    ticks: buildTicks(first, last),
    today: todayDay >= first && todayDay < last ? pos(todayDay + 0.5) : null,
  };
}

/** Weekly ticks (Mondays) for up to ~4 months, otherwise monthly ticks. */
export function buildTicks(first: number, last: number): GanttTick[] {
  const span = last - first;
  const ticks: GanttTick[] = [];
  if (span <= 130) {
    // 1970-01-01 was a Thursday: day number n is a Monday if (n + 3) % 7 === 0.
    let n = first + ((7 - ((first + 3) % 7)) % 7);
    const step = span <= 70 ? 7 : 14;
    for (; n < last; n += step) {
      const d = fromDayNumber(n);
      ticks.push({ at: (n - first) / span, label: `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}` });
    }
  } else {
    const start = fromDayNumber(first);
    let y = start.getUTCFullYear();
    let m = start.getUTCMonth() + 1;
    for (;;) {
      const n = Date.UTC(y, m, 1) / MS_PER_DAY;
      if (n >= last) break;
      ticks.push({ at: (n - first) / span, label: m === 0 ? `${MONTHS[0]} ${y}` : MONTHS[m] });
      m++;
      if (m === 12) {
        m = 0;
        y++;
      }
    }
  }
  return ticks;
}
