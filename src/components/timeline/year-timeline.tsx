"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate, formatDateRange } from "@/lib/dates";
import {
  CAMPAIGN_PHASE_LABELS,
  FUNNEL_STAGES,
  FUNNEL_STAGE_LABELS,
  type CampaignPhase,
  type TrafficLight,
} from "@/lib/domain/enums";
import type { YearBar, YearCampaignRow, YearTimeline } from "@/lib/gantt/year";
import type { Progress } from "@/lib/status";
import { Button, buttonVariants } from "@/components/ui/button";
import { STAGE_STYLES } from "@/components/stage-styles";

const LIGHT: Record<TrafficLight, { dot: string; label: string }> = {
  RED: { dot: "bg-status-red", label: "Critical" },
  YELLOW: { dot: "bg-status-yellow", label: "At risk" },
  GREEN: { dot: "bg-status-green", label: "On track" },
};

const expandedKey = "campaign-tracker:timeline-expanded";
const assetsKey = "campaign-tracker:timeline-assets";
const pct = (v: number) => `${v * 100}%`;

function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function store(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Remembering the view is a convenience only.
  }
}

function Bar({
  bar,
  className,
  style,
  title,
}: {
  bar: YearBar;
  className: string;
  style?: React.CSSProperties;
  title: string;
}) {
  return (
    <span
      className={cn(
        "absolute top-1/2 -translate-y-1/2",
        bar.clippedStart ? "rounded-l-none" : "rounded-l-full",
        bar.clippedEnd ? "rounded-r-none" : "rounded-r-full",
        className,
      )}
      style={{ left: pct(bar.left), width: pct(bar.width), ...style }}
      title={title}
    />
  );
}

export function YearTimelineView({
  timeline,
  years,
  status,
}: {
  timeline: YearTimeline;
  years: number[];
  status: Record<string, { light: TrafficLight; phase: CampaignPhase; progress: Progress }>;
}) {
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set());
  const [showAssets, setShowAssets] = React.useState(true);
  React.useEffect(() => {
    setExpanded(new Set(readStored<string[]>(expandedKey, [])));
    setShowAssets(readStored<boolean>(assetsKey, true));
  }, []);

  const update = (next: Set<string>) => {
    setExpanded(next);
    store(expandedKey, [...next]);
  };
  const toggle = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    update(next);
  };
  const allIds = timeline.rows.map((r) => r.id);
  const maxParallel = Math.max(1, ...timeline.weeks.map((w) => w.count));
  const peak = Math.max(...timeline.weeks.map((w) => w.count), 0);
  const prevYear = years.filter((y) => y < timeline.year).at(-1) ?? timeline.year - 1;
  const nextYear = years.find((y) => y > timeline.year) ?? timeline.year + 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/timeline?year=${prevYear}`}
          className={buttonVariants({ variant: "outline", size: "icon" })}
          aria-label={`Show ${prevYear}`}
        >
          <ChevronLeft />
        </Link>
        <span className="min-w-16 text-center text-xl font-semibold tabular-nums">{timeline.year}</span>
        <Link
          href={`/timeline?year=${nextYear}`}
          className={buttonVariants({ variant: "outline", size: "icon" })}
          aria-label={`Show ${nextYear}`}
        >
          <ChevronRight />
        </Link>
        <span className="mx-2 text-sm text-muted-foreground">
          {timeline.rows.length === 1 ? "1 campaign" : `${timeline.rows.length} campaigns`}
          {peak > 1 && ` · up to ${peak} at the same time`}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => update(new Set(allIds))} disabled={timeline.rows.length === 0}>
            <ChevronsUpDown /> Expand all
          </Button>
          <Button variant="outline" onClick={() => update(new Set())} disabled={expanded.size === 0}>
            <ChevronsDownUp /> Collapse all
          </Button>
          <label className="ml-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-foreground"
              checked={showAssets}
              onChange={(e) => {
                setShowAssets(e.target.checked);
                store(assetsKey, e.target.checked);
              }}
            />
            Show asset deadlines
          </label>
        </div>
      </div>

      {timeline.rows.length === 0 ? (
        <p className="rounded-2xl border bg-card p-6 text-base text-muted-foreground">
          No campaigns in {timeline.year}.
        </p>
      ) : (
        <section className="overflow-x-auto rounded-2xl border bg-card" aria-label={`Campaigns ${timeline.year}`}>
          <div className="relative min-w-[960px] pb-3">
            {/* Month grid and today, behind the rows. */}
            <div className="pointer-events-none absolute inset-y-0 left-72 right-4" aria-hidden>
              {timeline.months.map((m) => (
                <div
                  key={m.label}
                  className="absolute inset-y-0 border-l border-border/70"
                  style={{ left: pct(m.at) }}
                />
              ))}
              {timeline.today != null && (
                <div
                  className="absolute inset-y-0 border-l-2 border-josera-ruby/80"
                  style={{ left: pct(timeline.today) }}
                >
                  <span className="absolute bottom-0 left-1 rounded bg-josera-ruby px-1 text-[10px] font-semibold text-white">
                    Today
                  </span>
                </div>
              )}
            </div>

            <div className="sticky top-0 z-10 grid grid-cols-[18rem_1fr] border-b bg-card pr-4">
              <span className="px-4 py-2 text-xs font-medium text-muted-foreground">Campaign</span>
              <div className="relative h-8 text-xs font-medium text-muted-foreground">
                {timeline.months.map((m) => (
                  <span key={m.label} className="absolute top-2 pl-1.5" style={{ left: pct(m.at) }}>
                    {m.label}
                  </span>
                ))}
              </div>
            </div>

            {/* Campaigns running in parallel per week. */}
            <div className="grid grid-cols-[18rem_1fr] items-end border-b pr-4" title="Campaigns running per week">
              <span className="px-4 py-2 text-xs text-muted-foreground">Running in parallel</span>
              <div className="relative h-10">
                {timeline.weeks.map((w) =>
                  w.count > 0 ? (
                    <span
                      key={w.at}
                      className={cn(
                        "absolute bottom-1 rounded-t-sm",
                        w.count >= 3 ? "bg-status-yellow" : "bg-foreground/25",
                      )}
                      style={{
                        left: pct(w.at),
                        width: `calc(${pct(w.width)} - 2px)`,
                        height: `${(w.count / maxParallel) * 28 + 4}px`,
                      }}
                      title={`${w.count} campaign${w.count === 1 ? "" : "s"} running`}
                    />
                  ) : null,
                )}
              </div>
            </div>

            <ol>
              {timeline.rows.map((row) => (
                <CampaignRows
                  key={row.id}
                  row={row}
                  status={status[row.id]}
                  expanded={expanded.has(row.id)}
                  showAssets={showAssets}
                  onToggle={() => toggle(row.id)}
                />
              ))}
            </ol>
          </div>
        </section>
      )}

      <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-6 rounded-full bg-josera-gold" /> Campaign
        </span>
        {FUNNEL_STAGES.map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className={cn("h-2.5 w-6 rounded-full", STAGE_STYLES[s].bg)} /> {FUNNEL_STAGE_LABELS[s]} channel
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rotate-45 bg-foreground/70" /> Asset due
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rotate-45 bg-status-red" /> Overdue
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-t-sm bg-status-yellow" /> 3+ campaigns in parallel
        </span>
      </div>
    </div>
  );
}

function CampaignRows({
  row,
  status,
  expanded,
  showAssets,
  onToggle,
}: {
  row: YearCampaignRow;
  status?: { light: TrafficLight; phase: CampaignPhase; progress: Progress };
  expanded: boolean;
  showAssets: boolean;
  onToggle: () => void;
}) {
  const light = status ? LIGHT[status.light] : null;
  const range = formatDateRange(row.startDate, row.endDate);
  return (
    <li className="border-b last:border-0">
      <div className="grid grid-cols-[18rem_1fr] items-center pr-4 hover:bg-muted/40">
        <div className="flex min-w-0 items-center gap-1.5 py-2 pl-2 pr-3">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={`${expanded ? "Collapse" : "Expand"} ${row.name}`}
            className="flex size-7 shrink-0 items-center justify-center rounded-md hover:bg-muted"
            disabled={row.channels.length === 0}
          >
            <ChevronDown
              className={cn(
                "size-4 transition-transform",
                !expanded && "-rotate-90",
                row.channels.length === 0 && "opacity-30",
              )}
            />
          </button>
          <div className="min-w-0">
            <Link
              href={`/campaigns/${row.slug}`}
              className="block truncate font-semibold hover:underline"
              title={row.name}
            >
              {row.name}
            </Link>
            <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
              {light && (
                <span
                  className={cn("size-2 shrink-0 rounded-full", light.dot)}
                  title={light.label}
                  aria-label={light.label}
                />
              )}
              {status && CAMPAIGN_PHASE_LABELS[status.phase]} · {range}
            </p>
          </div>
        </div>
        <div className="relative h-12">
          {row.bar && <Bar bar={row.bar} className="h-5 bg-josera-gold" title={`${row.name}: ${range}`} />}
          {row.bar && status && status.progress.total > 0 && (
            <span
              className="absolute top-1/2 -translate-y-1/2 truncate px-2 text-[11px] font-semibold text-black"
              style={{ left: pct(row.bar.left), maxWidth: pct(row.bar.width) }}
            >
              {status.progress.done}/{status.progress.total}
            </span>
          )}
        </div>
      </div>

      {expanded &&
        row.channels.map((channel) => (
          <div key={channel.id} className="grid grid-cols-[18rem_1fr] items-center pr-4 hover:bg-muted/40">
            <div className="flex min-w-0 items-center gap-2 py-1 pl-11 pr-3">
              <span className={cn("size-2 shrink-0 rounded-full", STAGE_STYLES[channel.stage].bg)} aria-hidden />
              <Link
                href={`/campaigns/${row.slug}?channel=${channel.id}`}
                className="truncate text-sm hover:underline"
                title={`${channel.name} · ${FUNNEL_STAGE_LABELS[channel.stage]}`}
              >
                {channel.name}
              </Link>
            </div>
            <div className="relative h-8">
              {channel.bar && (
                <Bar
                  bar={channel.bar}
                  className={cn(
                    "h-3",
                    channel.inherited
                      ? cn("border border-dashed", STAGE_STYLES[channel.stage].border, STAGE_STYLES[channel.stage].soft)
                      : STAGE_STYLES[channel.stage].bg,
                  )}
                  title={`${channel.name}${channel.inherited ? " (campaign period)" : ""}`}
                />
              )}
              {showAssets &&
                channel.assets.map((asset) => (
                  <Link
                    key={asset.id}
                    href={`/campaigns/${row.slug}?asset=${asset.id}`}
                    className={cn(
                      "absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 ring-2 ring-card",
                      asset.overdue
                        ? "bg-status-red"
                        : asset.status === "DONE" || asset.status === "LIVE"
                          ? "bg-status-green"
                          : "bg-foreground/70",
                    )}
                    style={{ left: pct(asset.at) }}
                    title={`${asset.title} · due ${formatDate(asset.dueDate)}`}
                    aria-label={`${asset.title}, due ${formatDate(asset.dueDate)}`}
                  />
                ))}
            </div>
          </div>
        ))}
    </li>
  );
}
